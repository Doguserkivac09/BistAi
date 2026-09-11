/**
 * Swing kurulumu İLERİYE DÖNÜK SİCİL — çalıştırıcı (gizli, ürün yüzeyinde YOK).
 *
 * Her koşu:
 *   1. ABD yüksek hacimli evren + SPY için 1 yıllık günlük mum çeker (Yahoo)
 *   2. Açık kayıtları mumlardan BAŞTAN çözer (idempotent — kaçırılan gün sorun olmaz)
 *   3. Son 3 mumda yeni sinyal arar (cron bir-iki gün kaçırırsa sinyal kaybolmasın)
 *   4. Her yeni sinyal için aynı gün RASTGELE 5 kontrol girişi açar (aynı çıkış kuralı)
 *
 * ⚠️ KONTROL NEDEN VAR: geriye dönük ölçümün dersi — "kurulum kârlı mı?" yanlış soru,
 * yükselen piyasada rastgele giriş de kârlı. Doğru soru "rastgele girişten iyi mi?"
 * ve bunu aylar sonra cevaplayabilmek için kontrol grubunun BUGÜNDEN birikmesi gerek.
 *
 * ⚠️ Tamamlanmamış mum: koşu seans içine denk gelirse bugünün mumu atılır
 * (yarım mumla sinyal üretmek ölçülen kuralla aynı şey değildir).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OHLCVCandle } from '@/types';
import { fetchOHLCVUS } from './yahoo-us';
import { US_SYMBOL_LIST } from './us-symbols';
import { computeSwingSeries, resolveSwingTrade, SWING_RULE_VERSION, type SwingSeries } from './swing-setup';

export const SICIL_TABLE = 'swing_sicil';
const BENCH = 'SPY';
const KONTROL_PER_SINYAL = 5;
const YENI_SINYAL_GERIYE = 3;
const BATCH = 8;
const BATCH_DELAY_MS = 300;
const AKTIF = ['bekliyor', 'acik', 'cikiyor'] as const;

export type SicilDurum = 'bekliyor' | 'acik' | 'cikiyor' | 'kapali';

export interface SicilRow {
  id?: number;
  market: 'US';
  symbol: string;
  kind: 'sinyal' | 'kontrol';
  signal_date: string;
  status: SicilDurum;
  entry_date: string | null;
  entry_price: number | null;
  bench_entry: number | null;
  exit_signal_date: string | null;
  exit_reason: 'di-kesisim' | 'sure-doldu' | null;
  exit_date: string | null;
  exit_price: number | null;
  bench_exit: number | null;
  return_pct: number | null;
  bench_return_pct: number | null;
  bars_held: number | null;
  rule_version: string;
  created_at?: string;
  updated_at?: string;
}

type SpyMap = Map<string, { open: number; close: number }>;
/** Günlük mum — tarih her zaman 'YYYY-MM-DD' (OHLCVCandle.date string|number). */
export type GunlukMum = Omit<OHLCVCandle, 'date'> & { date: string };

const yuvarla = (x: number) => Math.round(x * 10_000) / 10_000;
const yuzde = (x: number) => Math.round(x * 1_000_000) / 10_000; // 0.0235 → 2.35

/** New York saatine göre bugünün tarihi ve dakikası. */
export function nyNow(now: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const al = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${al('year')}-${al('month')}-${al('day')}`, minutes: Number(al('hour')) * 60 + Number(al('minute')) };
}

/** Seans kapanmadıysa (16:30 ET öncesi) bugünün yarım mumunu at. */
export function tamamlanmisMumlar(candles: OHLCVCandle[], now: Date): GunlukMum[] {
  const gun = candles.map((c) => ({ ...c, date: String(c.date) }));
  const ny = nyNow(now);
  const son = gun[gun.length - 1];
  if (son && son.date === ny.date && ny.minutes < 16 * 60 + 30) return gun.slice(0, -1);
  return gun;
}

export function bosSatir(symbol: string, kind: SicilRow['kind'], signalDate: string): SicilRow {
  return {
    market: 'US', symbol, kind, signal_date: signalDate, status: 'bekliyor',
    entry_date: null, entry_price: null, bench_entry: null,
    exit_signal_date: null, exit_reason: null, exit_date: null, exit_price: null, bench_exit: null,
    return_pct: null, bench_return_pct: null, bars_held: null,
    rule_version: SWING_RULE_VERSION,
  };
}

/** Kaydı mumlardan baştan çözer. Sinyal mumu pencerede yoksa null (dokunma). */
export function satiriCoz(row: SicilRow, candles: GunlukMum[], series: SwingSeries, spy: SpyMap): SicilRow | null {
  const si = candles.findIndex((c) => c.date === row.signal_date);
  if (si < 0) return null;
  const tr = resolveSwingTrade(candles, series, si);
  const out: SicilRow = {
    ...row, status: 'bekliyor', entry_date: null, entry_price: null, bench_entry: null,
    exit_signal_date: null, exit_reason: null, exit_date: null, exit_price: null, bench_exit: null,
    return_pct: null, bench_return_pct: null, bars_held: null,
  };
  if (tr.entryIdx == null || tr.entryPrice == null) return out;

  const giris = candles[tr.entryIdx]!;
  const sG = spy.get(giris.date);
  const benchGiris = sG ? (sG.open > 0 ? sG.open : sG.close) : null;
  out.entry_date = giris.date;
  out.entry_price = yuvarla(tr.entryPrice);
  out.bench_entry = benchGiris != null ? yuvarla(benchGiris) : null;

  if (tr.exitIdx != null && tr.exitPrice != null) {
    const cikis = candles[tr.exitIdx]!;
    const sC = spy.get(cikis.date);
    // Kesişim çıkışı açılışta, süre dolumu kapanışta — endeks de aynı anda ölçülür.
    const benchCikis = sC ? (tr.exitReason === 'di-kesisim' ? (sC.open > 0 ? sC.open : sC.close) : sC.close) : null;
    out.status = 'kapali';
    out.exit_reason = tr.exitReason;
    out.exit_signal_date = tr.exitReason === 'di-kesisim' ? candles[tr.exitIdx - 1]!.date : null;
    out.exit_date = cikis.date;
    out.exit_price = yuvarla(tr.exitPrice);
    out.bench_exit = benchCikis != null ? yuvarla(benchCikis) : null;
    out.return_pct = yuzde(tr.exitPrice / tr.entryPrice - 1);
    out.bench_return_pct = benchGiris && benchCikis ? yuzde(benchCikis / benchGiris - 1) : null;
    out.bars_held = tr.barsHeld;
  } else if (tr.exitSignalIdx != null) {
    out.status = 'cikiyor';
    out.exit_signal_date = candles[tr.exitSignalIdx]!.date;
  } else {
    out.status = 'acik';
  }
  return out;
}

/** Aynı hissede o tarihte açık (veya henüz kapanmamış) bir SİNYAL pozisyonu var mı? */
export function pozisyonVar(symbol: string, date: string, rows: SicilRow[]): boolean {
  return rows.some((r) => r.symbol === symbol && r.kind === 'sinyal' && r.signal_date <= date
    && ((AKTIF as readonly string[]).includes(r.status) || (r.exit_date != null && r.exit_date > date)));
}

export interface SicilSonucu {
  ok: true;
  dryRun: boolean;
  ruleVersion: string;
  fetched: number;
  failed: number;
  failedSample: string[];
  budgetExhausted: boolean;
  active: number;
  updated: number;
  closedNow: number;
  newSignals: Array<{ symbol: string; signal_date: string; status: SicilDurum; entry_price: number | null }>;
  newControls: number;
  tableError: string | null;
  durationMs: number;
}

export async function runSwingSicil(
  sb: SupabaseClient | null,
  opts: { dryRun: boolean; budgetMs?: number; now?: Date; symbols?: string[] },
): Promise<SicilSonucu> {
  const basla = Date.now();
  const now = opts.now ?? new Date();
  const butce = opts.budgetMs ?? 240_000;
  let tableError: string | null = null;

  // 1) Mevcut kayıtlar
  let aktif: SicilRow[] = [];
  let sonSinyaller: SicilRow[] = [];
  if (sb) {
    const since = new Date(now.getTime() - 150 * 86_400_000).toISOString().slice(0, 10);
    const [a, s] = await Promise.all([
      sb.from(SICIL_TABLE).select('*').eq('market', 'US').in('status', AKTIF as unknown as string[]),
      sb.from(SICIL_TABLE).select('*').eq('market', 'US').eq('kind', 'sinyal').gte('signal_date', since),
    ]);
    const hata = a.error ?? s.error;
    if (hata) {
      tableError = `${hata.message} — migration 20260911_swing_sicil.sql çalıştırıldı mı?`;
      if (!opts.dryRun) throw new Error(tableError);
    } else {
      aktif = (a.data ?? []) as SicilRow[];
      sonSinyaller = (s.data ?? []) as SicilRow[];
    }
  }

  // 2) Mumlar
  const evren = opts.symbols ?? [...US_SYMBOL_LIST];
  const semboller = [BENCH, ...new Set(evren.filter((x) => x !== BENCH))];
  const mumlar = new Map<string, GunlukMum[]>();
  const hatali: string[] = [];
  let butceBitti = false;
  for (let i = 0; i < semboller.length; i += BATCH) {
    if (Date.now() - basla > butce) { butceBitti = true; break; }
    const dilim = semboller.slice(i, i + BATCH);
    const sonuc = await Promise.allSettled(dilim.map((s) => fetchOHLCVUS(s, 365)));
    sonuc.forEach((r, j) => {
      const s = dilim[j]!;
      if (r.status === 'fulfilled' && r.value.candles.length >= 120) mumlar.set(s, tamamlanmisMumlar(r.value.candles, now));
      else hatali.push(s);
    });
    if (i + BATCH < semboller.length) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  const spyMum = mumlar.get(BENCH);
  if (!spyMum) throw new Error('SPY verisi alınamadı — endekssiz sicil yazılmaz');
  const spy: SpyMap = new Map(spyMum.map((c) => [c.date, { open: c.open, close: c.close }]));

  const seriler = new Map<string, SwingSeries>();
  const seri = (s: string) => {
    let x = seriler.get(s);
    if (!x) { x = computeSwingSeries(mumlar.get(s)!); seriler.set(s, x); }
    return x;
  };

  // 3) Açık kayıtları çöz
  const guncel: SicilRow[] = [];
  let kapanan = 0;
  for (const row of aktif) {
    const c = mumlar.get(row.symbol);
    if (!c) continue;
    const yeni = satiriCoz(row, c, seri(row.symbol), spy);
    if (!yeni) continue;
    if (yeni.status === 'kapali') kapanan++;
    guncel.push(yeni);
  }

  // 4) Yeni sinyaller + kontroller
  const yeniSatirlar: SicilRow[] = [];
  const bilinen = [...sonSinyaller, ...guncel.filter((r) => r.kind === 'sinyal')];
  const kontrolAnahtar = new Set<string>();
  let yeniKontrol = 0;
  const hisseler = [...mumlar.keys()].filter((s) => s !== BENCH);

  for (const sym of hisseler) {
    const c = mumlar.get(sym)!;
    const sr = seri(sym);
    for (let idx = Math.max(0, c.length - YENI_SINYAL_GERIYE); idx < c.length; idx++) {
      if (!sr.entry[idx] || !sr.liquid[idx]) continue;
      const tarih = c[idx]!.date;
      if (pozisyonVar(sym, tarih, bilinen)) continue;
      const sinyal = satiriCoz(bosSatir(sym, 'sinyal', tarih), c, sr, spy)!;
      yeniSatirlar.push(sinyal);
      bilinen.push(sinyal);

      // Kontrol: aynı gün, likit, o gün sinyali OLMAYAN rastgele hisseler
      const adaylar = hisseler.filter((k) => {
        if (k === sym || kontrolAnahtar.has(`${k}|${tarih}`)) return false;
        const kc = mumlar.get(k)!;
        const j = kc.findIndex((m) => m.date === tarih);
        if (j < 0) return false;
        const ks = seri(k);
        return ks.liquid[j] && !ks.entry[j];
      });
      for (let a = adaylar.length - 1; a > 0; a--) {
        const b = Math.floor(Math.random() * (a + 1));
        [adaylar[a], adaylar[b]] = [adaylar[b]!, adaylar[a]!];
      }
      for (const k of adaylar.slice(0, KONTROL_PER_SINYAL)) {
        const satir = satiriCoz(bosSatir(k, 'kontrol', tarih), mumlar.get(k)!, seri(k), spy);
        if (!satir) continue;
        kontrolAnahtar.add(`${k}|${tarih}`);
        yeniSatirlar.push(satir);
        yeniKontrol++;
      }
    }
  }

  // 5) Yaz
  if (sb && !opts.dryRun) {
    const zaman = new Date().toISOString();
    const temizle = (r: SicilRow) => { const { id: _id, created_at: _c, ...geri } = r; return { ...geri, updated_at: zaman }; };
    for (let i = 0; i < guncel.length; i += 200) {
      const { error } = await sb.from(SICIL_TABLE).upsert(guncel.slice(i, i + 200).map(temizle), { onConflict: 'market,symbol,kind,signal_date' });
      if (error) throw new Error(`sicil güncelleme: ${error.message}`);
    }
    for (let i = 0; i < yeniSatirlar.length; i += 200) {
      const { error } = await sb.from(SICIL_TABLE).upsert(yeniSatirlar.slice(i, i + 200).map(temizle), { onConflict: 'market,symbol,kind,signal_date', ignoreDuplicates: true });
      if (error) throw new Error(`sicil ekleme: ${error.message}`);
    }
  }

  return {
    ok: true,
    dryRun: opts.dryRun,
    ruleVersion: SWING_RULE_VERSION,
    fetched: mumlar.size,
    failed: hatali.length,
    failedSample: hatali.slice(0, 10),
    budgetExhausted: butceBitti,
    active: aktif.length,
    updated: guncel.length,
    closedNow: kapanan,
    newSignals: yeniSatirlar.filter((r) => r.kind === 'sinyal').map((r) => ({ symbol: r.symbol, signal_date: r.signal_date, status: r.status, entry_price: r.entry_price })),
    newControls: yeniKontrol,
    tableError,
    durationMs: Date.now() - basla,
  };
}

export interface SicilGrup {
  kapanan: number;
  acik: number;
  kazananOran: number | null;
  ortGetiri: number | null;
  ortFazla: number | null;
}

/**
 * Sicil özeti. ANA SORU: sinyal girişleri, aynı gün açılan rastgele kontrollerden
 * SPY'a göre daha mı iyi? (giriş katkısı = sinyal ortFazla − kontrol ortFazla)
 */
export function summarizeSicil(rows: SicilRow[]) {
  const grup = (kind: SicilRow['kind']): SicilGrup => {
    const k = rows.filter((r) => r.kind === kind);
    const kap = k.filter((r) => r.status === 'kapali' && r.return_pct != null);
    const fazla = kap.filter((r) => r.bench_return_pct != null).map((r) => r.return_pct! - r.bench_return_pct!);
    const ort = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 100) / 100 : null);
    return {
      kapanan: kap.length,
      acik: k.filter((r) => r.status !== 'kapali').length,
      kazananOran: kap.length ? Math.round((kap.filter((r) => r.return_pct! > 0).length / kap.length) * 100) : null,
      ortGetiri: ort(kap.map((r) => r.return_pct!)),
      ortFazla: ort(fazla),
    };
  };
  const sinyal = grup('sinyal');
  const kontrol = grup('kontrol');
  const katki = sinyal.ortFazla != null && kontrol.ortFazla != null
    ? Math.round((sinyal.ortFazla - kontrol.ortFazla) * 100) / 100 : null;
  return {
    ruleVersions: [...new Set(rows.map((r) => r.rule_version))],
    sinyal,
    kontrol,
    girisKatkisiPuan: katki,
    yorum: sinyal.kapanan < 30
      ? `Henüz yorum yapılamaz — kapanmış sinyal ${sinyal.kapanan}/30.`
      : katki != null && katki > 0 ? 'Sinyal girişleri kontrolden iyi (anlamlılık ayrıca test edilmeli).' : 'Sinyal girişleri kontrolden iyi DEĞİL.',
    sonSinyaller: rows.filter((r) => r.kind === 'sinyal').sort((a, b) => b.signal_date.localeCompare(a.signal_date)).slice(0, 15)
      .map((r) => ({ symbol: r.symbol, signal_date: r.signal_date, status: r.status, return_pct: r.return_pct, bench_return_pct: r.bench_return_pct })),
  };
}
