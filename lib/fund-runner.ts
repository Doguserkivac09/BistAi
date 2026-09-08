/**
 * Fon precompute çalıştırıcısı (FON-ANALIZ-PLAN F5 + F7).
 *
 * İKİ GEÇİŞLİ (banka K2 dersi):
 *   1. geçiş — her fonun metrikleri hesaplanır (mutlak ölçümler)
 *   2. geçiş — KATEGORİ medyanları türetilir, bayrak/skor **emsale göreli** üretilir
 *
 * ⚠️ KALİBRASYON KURALI: bu projede iki kez aynı ders canlı veride yakalandı
 * (banka reel-ROE, banka NIM trendi). Mutlak eşik = BAĞLAM, asla veto değil;
 * ayrıştırıcı bayrak yalnız kendi kategorisindeki akranlara göre üretilir.
 * Kategoride n < MIN_PEER ise mutlak eşiğe düşülür ve rozet **sektör iddia ETMEZ**.
 *
 * DEPOLAMA (ölçüldü): ham NAV geçmişi tek `ai_cache` satırına SIĞMAZ
 * (1 yıl ≈ 33 MB, 5 yıl ≈ 165 MB). Bu yüzden Kademe 1'de **kayan pencere** ham
 * seri + **yalnız hesaplanmış metrikler** saklanır (~1,5 MB). Uzun geçmiş
 * (1y/3y/5y, rolling tutarlılık, alfa/IR) tablo ister → ayrı faz.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { listFundsOnDate, POLITE_DELAY_MS, type FundDailyRow } from './fund-data';
import { FUND_CATEGORIES, guessAccessibility, categoryLabel, type FundUniverse } from './fund-universe';
import { computeFundMetrics, type NavPoint } from './fund-metrics';

/**
 * Evren eşiği — KULLANICI KARARI (2026-09-09), canlı ölçümle seçildi.
 * `kisiSayisi >= 1000`: TEFAS 2.034 → 639 fon, varlığın %76,8'i korunuyor ve
 * **hiçbir kategori n<5'e düşmüyor** (en küçüğü Karma: 8→7). Serbest fonların
 * %89'u (994→108) doğal olarak eleniyor — davranışsal ölçüt, ad tahmininden güvenilir.
 *
 * Evren SABİT LİSTE DEĞİL: her koşuda yeniden hesaplanır; eşiği yeni geçen fonun
 * geçmişi o an birikmeye başlar (TEFAS geçmişi geriye dönük çekilebildiği için
 * bu kayıp telafi edilebilir — fırsat sicilinden farkı budur).
 */
export const MIN_INVESTORS = 1000;

/** Kategori medyanının güvenilir sayılması için gereken akran sayısı. */
export const MIN_PEER = 5;

/** Kayan ham pencere (gün) — ai_cache sınırı içinde kalacak şekilde. */
export const RAW_WINDOW_DAYS = 75;

export type FundFlagTone = 'pos' | 'warn' | 'neutral';

export interface FundFlag {
  id: string;
  tone: FundFlagTone;
  /** Sade Türkçe — fon dili: karşılaştırma/uygunluk, AL-SAT YOK */
  text: string;
  detail?: string;
}

export interface FundEntry {
  code: string;
  name: string;
  universe: FundUniverse;
  category: number | null;
  categoryLabel: string | null;
  accessibility: string;
  /** Erişilebilirlik AD TAHMİNİ — UI bunu göstermek zorunda */
  accessibilitySource: 'ad-tabanlı-tahmin';
  investors: number | null;
  size: number | null;
  asOf: string | null;
  observations: number;
  /** Üç katman */
  nominal: number | null;
  excess: number | null;
  real: number | null;
  /** Risk */
  volatility: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  /** Kategoriye göre risk-ayarlı bileşik skor 0-100 (varsayılan sıralama) */
  score: number | null;
  /** Kategori içi sıralar — çifte sıralama görünürlüğü (F5-2) */
  rankByReturn: number | null;
  rankByScore: number | null;
  flags: FundFlag[];
  /** Kategori emsali güvenilir mi (n>=MIN_PEER) */
  peerReliable: boolean;
}

export interface FundStore {
  scannedAt: string;
  universe: FundUniverse;
  /** Ham kayan pencere — bir sonraki koşu bunun üstüne ekler */
  raw: Record<string, Array<{ d: string; p: number; s: number | null; k: number | null }>>;
  /**
   * Fon → kategori kodu, KALICI. Kategori satırlarda gelmiyor, ayrı 12 sorguyla
   * türetiliyor; bir koşuda 429 yiyen kategori (canlıda Para Piyasası'na oldu)
   * tüm fonlarını kategorisiz bırakıyordu → emsal kıyası ve sıra kayboluyordu.
   * Önceki koşudan devralınır, yeni gelen üzerine yazar.
   */
  cats?: Record<string, number>;
  items: FundEntry[];
  /** Makro bağlam (şeffaflık) */
  policyRate: number | null;
  inflation: number | null;
  note?: string;
}

const rawKey = (u: FundUniverse) => `fund-store:${u}`;
const TTL_MS = 5 * 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m]! : (a[m - 1]! + a[m]!) / 2;
}

/** İş günü geriye giderek tarih listesi (hafta sonu atlanır — fon fiyatı yok). */
function recentBusinessDays(count: number, from = new Date()): Date[] {
  const out: Date[] = [];
  const d = new Date(from);
  while (out.length < count) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

// ── 1. GEÇİŞ: ham veri toplama ──────────────────────────────────────────────

/**
 * Son `days` iş gününü tarih tarih çeker ve mevcut ham pencereye MERGE eder.
 *
 * NEDEN TARİH BAZLI (fon bazlı değil): tek tarih sorgusu TÜM evreni döndürüyor.
 * Ölçüm: fon-bazlı 1 yıl ≈ 18.400 istek, tarih-bazlı ≈ 1.250 istek → 15 kat ucuz.
 */
export async function fetchRawWindow(
  universe: FundUniverse,
  days: number,
  previous?: FundStore['raw'],
): Promise<{ raw: FundStore['raw']; meta: Map<string, FundDailyRow>; fetchedDays: number; failedDays: number }> {
  const raw: FundStore['raw'] = { ...(previous ?? {}) };
  const meta = new Map<string, FundDailyRow>();
  let fetchedDays = 0, failedDays = 0;

  for (const [i, day] of recentBusinessDays(days).entries()) {
    if (i > 0) await sleep(POLITE_DELAY_MS);
    try {
      const res = await listFundsOnDate(universe, day);
      if (res.data.length === 0) { failedDays++; continue; }
      fetchedDays++;
      for (const row of res.data) {
        meta.set(row.code, row); // en yeni tarih en son yazar
        if (!raw[row.code]) raw[row.code] = [];
        const arr = raw[row.code]!;
        if (!arr.some((x) => x.d === row.date)) {
          arr.push({ d: row.date, p: row.price, s: row.shares, k: row.investors });
        }
      }
    } catch { failedDays++; }
  }

  // Kayan pencereyi kırp (ai_cache boyutu kontrol altında kalsın)
  const cutoff = new Date(Date.now() - RAW_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const code of Object.keys(raw)) {
    raw[code] = raw[code]!.filter((x) => x.d >= cutoff).sort((a, b) => a.d.localeCompare(b.d));
    if (raw[code]!.length === 0) delete raw[code];
  }
  return { raw, meta, fetchedDays, failedDays };
}

// ── 2. GEÇİŞ: kategori-göreli skor + bayraklar ──────────────────────────────

interface Measured {
  code: string;
  meta: FundDailyRow;
  category: number | null;
  nominal: number | null;
  excess: number | null;
  real: number | null;
  volatility: number | null;
  sharpe: number | null;
  maxDrawdown: number | null;
  observations: number;
  asOf: string | null;
}

/** 0-100'e ölçekler: değer medyanın ne kadar üstünde/altında (±%50 tam aralık). */
function relativeScore(value: number, med: number): number {
  if (med === 0) return 50;
  const vs = (value - med) / Math.abs(med);
  return Math.max(0, Math.min(100, Math.round(50 + (vs / 0.5) * 50)));
}

function buildFlags(
  m: Measured,
  peer: { sharpe: number | null; vol: number | null; n: number } | null,
): FundFlag[] {
  const flags: FundFlag[] = [];
  const guvenilir = (peer?.n ?? 0) >= MIN_PEER;

  // BAĞLAM (mutlak) — her zaman gösterilir, ASLA veto değil (kalibrasyon kuralı)
  if (m.excess != null) {
    flags.push(
      m.excess >= 0
        ? { id: 'fon-fazla-poz', tone: 'pos', text: 'Risksiz getiriyi geçti', detail: `Fazla getiri +%${m.excess.toFixed(1)}` }
        : { id: 'fon-fazla-neg', tone: 'warn', text: 'Risksiz getirinin altında kaldı', detail: `Fazla getiri %${m.excess.toFixed(1)}` },
    );
  }
  if (m.real != null && m.real < 0) {
    flags.push({ id: 'fon-reel-neg', tone: 'warn', text: 'Enflasyona yenildi', detail: `Reel getiri %${m.real.toFixed(1)}` });
  }

  // AYRIŞTIRICI (emsale göreli) — yalnız kategori güvenilirse ve "emsal" dili kullanılır
  if (guvenilir && m.sharpe != null && peer!.sharpe != null) {
    if (m.sharpe > peer!.sharpe * 1.25) {
      flags.push({ id: 'fon-risk-ayarli-iyi', tone: 'pos', text: 'Emsallerine göre riskini daha iyi kullandı', detail: `Sharpe ${m.sharpe} · kategori medyanı ${peer!.sharpe.toFixed(2)}` });
    } else if (m.sharpe < peer!.sharpe * 0.75) {
      flags.push({ id: 'fon-risk-ayarli-zayif', tone: 'warn', text: 'Emsallerine göre aldığı riski karşılamadı', detail: `Sharpe ${m.sharpe} · kategori medyanı ${peer!.sharpe.toFixed(2)}` });
    }
  }
  if (guvenilir && m.volatility != null && peer!.vol != null && m.volatility < peer!.vol * 0.7) {
    flags.push({ id: 'fon-dusuk-dalga', tone: 'pos', text: 'Emsallerine göre daha az dalgalandı', detail: `Volatilite %${m.volatility} · kategori medyanı %${peer!.vol.toFixed(1)}` });
  }
  return flags;
}

export async function runFundScan(
  sb: SupabaseClient,
  universe: FundUniverse,
  opts: { days?: number; policyRate?: number | null; inflation?: number | null } = {},
): Promise<{ store: FundStore; scored: number; skipped: number; fetchedDays: number }> {
  const previous = await getFundStore(sb, universe);
  const { raw, meta, fetchedDays, failedDays } = await fetchRawWindow(universe, opts.days ?? 1, previous?.raw);

  // Kategori haritası — satırlarda kategori alanı YOK, filtreyle türetilir
  // Önceki koşunun haritası taban alınır; bu koşuda alınabilen kategoriler üstüne yazar.
  const katMap = new Map<string, number>(Object.entries(previous?.cats ?? {}).map(([k, v]) => [k, v]));
  const dun = recentBusinessDays(1)[0]!;
  for (const [i, c] of FUND_CATEGORIES.entries()) {
    if (i > 0) await sleep(POLITE_DELAY_MS);
    try {
      // Serbest kategorisi ~1000 fon → sayfa limiti geniş tutulmalı (ölçüldü)
      const r = await listFundsOnDate(universe, dun, { sfonTurKod: c.code, maxPages: 4 });
      for (const f of r.data) katMap.set(f.code, c.code);
    } catch { /* önceki koşunun kategorisi korunur (yukarıdaki taban) */ }
  }

  // ── 1. GEÇİŞ: ölçüm ──
  const measured: Measured[] = [];
  let skipped = 0;
  for (const [code, points] of Object.entries(raw)) {
    const onceki = previous?.items.find((x) => x.code === code);
    const info = meta.get(code) ?? (onceki as unknown as FundDailyRow | undefined);
    // Yatırımcı sayısı bu koşuda gelmediyse ÖNCEKİ koşudan devralınır.
    // Canlıda yakalandı (2026-09-09): tek günlük kısmi çekimde `kisiSayisi` boş
    // geldi, evren eşiği 2.034 fonun TAMAMINI eledi ve store 631 → 0'a düştü.
    // Veri yokluğu "eşiğin altında" demek DEĞİLDİR.
    const investors = meta.get(code)?.investors ?? onceki?.investors ?? null;
    // EVREN EŞİĞİ — dinamik, her koşuda yeniden değerlendirilir
    if ((investors ?? 0) < MIN_INVESTORS) { skipped++; continue; }
    if (!info) { skipped++; continue; }

    const series: NavPoint[] = points.map((x) => ({ date: x.d, price: x.p }));
    const fm = computeFundMetrics({
      series,
      benchmark: null, // kategori medyanı serisi ayrı faz (uzun geçmiş gerektirir)
      policyRateAnnualPct: opts.policyRate ?? null,
      inflationAnnualPct: opts.inflation ?? null,
    });
    if (!fm.applicable) { skipped++; continue; }

    measured.push({
      code,
      meta: meta.get(code)!,
      category: katMap.get(code) ?? null,
      nominal: fm.layered.nominal,
      excess: fm.layered.excess,
      real: fm.layered.real,
      volatility: fm.risk.volatility,
      sharpe: fm.risk.sharpe,
      maxDrawdown: fm.risk.maxDrawdown,
      observations: fm.observations,
      asOf: fm.asOf,
    });
  }

  // ── 2. GEÇİŞ: kategori medyanları + göreli skor/bayrak/sıra ──
  const byCat = new Map<number, Measured[]>();
  for (const m of measured) {
    if (m.category == null) continue;
    if (!byCat.has(m.category)) byCat.set(m.category, []);
    byCat.get(m.category)!.push(m);
  }

  const items: FundEntry[] = measured.map((m) => {
    const peers = m.category != null ? (byCat.get(m.category) ?? []) : [];
    const n = peers.length;
    const peerSharpe = median(peers.map((p) => p.sharpe).filter((x): x is number => x != null));
    const peerVol = median(peers.map((p) => p.volatility).filter((x): x is number => x != null));
    const reliable = n >= MIN_PEER;

    // Bileşik skor: risk-ayarlı getiri (emsale göre) + istikrar. Bileşen yoksa
    // ağırlık YENİDEN NORMALİZE edilir (long-term-runner deseni) — 0 sayılmaz.
    //
    // ⚠️ RİSK BİLEŞENİ YOKSA SKOR ÜRETİLMEZ (canlıda yakalandı, 2026-09-09):
    // pencere 11 gözlemken Sharpe/volatilite null kalıyordu, skor yalnız `excess`
    // bileşeninden türüyordu ve **631 fonun tamamı 70** çıkıyordu. Evrenin
    // tamamında aynı değeri veren gösterge bilgi taşımaz — üstelik adı
    // "risk-ayarlı" olduğu için doğrudan YANILTICI. Skorun adı risk diyorsa
    // riski ölçemediğimizde skor yoktur; ekran bunu açıkça söyler.
    const parts: Array<{ v: number; w: number }> = [];
    const riskVar = reliable && m.sharpe != null && peerSharpe != null;
    if (riskVar) parts.push({ v: relativeScore(m.sharpe!, peerSharpe!), w: 60 });
    if (reliable && m.volatility != null && peerVol != null) parts.push({ v: relativeScore(peerVol, m.volatility), w: 25 });
    if (m.excess != null) parts.push({ v: m.excess >= 0 ? 70 : 30, w: 15 });
    const tw = parts.reduce((s, p) => s + p.w, 0);
    const score = riskVar && tw > 0 ? Math.round(parts.reduce((s, p) => s + p.v * p.w, 0) / tw) : null;

    const accessibility = guessAccessibility(m.meta.name);
    return {
      code: m.code,
      name: m.meta.name,
      universe,
      category: m.category,
      categoryLabel: categoryLabel(m.category),
      accessibility: accessibility.value,
      accessibilitySource: 'ad-tabanlı-tahmin' as const,
      investors: m.meta.investors,
      size: m.meta.size,
      asOf: m.asOf,
      observations: m.observations,
      nominal: m.nominal, excess: m.excess, real: m.real,
      volatility: m.volatility, sharpe: m.sharpe, maxDrawdown: m.maxDrawdown,
      score,
      rankByReturn: null,
      rankByScore: null,
      flags: buildFlags(m, reliable ? { sharpe: peerSharpe, vol: peerVol, n } : null),
      peerReliable: reliable,
    };
  });

  // Çifte sıralama (F5-2): KATEGORİ İÇİ sıralar — elma-armut kıyası olmasın
  for (const [, peers] of byCat) {
    const kodlar = new Set(peers.map((p) => p.code));
    const grup = items.filter((i) => kodlar.has(i.code));
    [...grup].filter((i) => i.nominal != null).sort((a, b) => b.nominal! - a.nominal!)
      .forEach((i, idx) => { i.rankByReturn = idx + 1; });
    [...grup].filter((i) => i.score != null).sort((a, b) => b.score! - a.score!)
      .forEach((i, idx) => { i.rankByScore = idx + 1; });
  }

  // ⚠️ KÖTÜ KOŞU İYİ STORE'U EZMESİN (banka motorundaki aynı ders).
  // TEFAS 429 verdiğinde koşu "hatasız ama boş" biter; ham pencere ve kategori
  // haritası yine de değerli olduğu için MERGE edilir, ama zayıflamış `items`
  // yayımlanmaz — sayfa eldeki en iyi ölçümde kalır.
  const oncekiSayi = previous?.items.length ?? 0;
  const zayif = oncekiSayi > 0 && items.length < oncekiSayi * 0.5;
  const yayin = zayif ? previous!.items : items;

  const store: FundStore = {
    scannedAt: zayif ? (previous!.scannedAt) : new Date().toISOString(),
    universe,
    raw,
    cats: Object.fromEntries(katMap),
    items: [...yayin].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)),
    policyRate: zayif ? previous!.policyRate : opts.policyRate ?? null,
    inflation: zayif ? previous!.inflation : opts.inflation ?? null,
    note: zayif
      ? `Bu koşu yalnız ${items.length} fon ölçebildi (${failedDays} gün alınamadı) — önceki ölçüm korundu`
      : failedDays > 0 ? `${failedDays} gün alınamadı` : undefined,
  };
  await storeFundStore(sb, store);
  return { store, scored: yayin.length, skipped, fetchedDays };
}

// ── ai_cache tek satır (MIGRATION YOK — Kademe 1 kapsamında) ────────────────

export async function storeFundStore(sb: SupabaseClient, store: FundStore): Promise<void> {
  await sb.from('ai_cache').upsert(
    {
      cache_key: rawKey(store.universe),
      explanation: JSON.stringify(store),
      version: 1,
      hit_count: 0,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    },
    { onConflict: 'cache_key' },
  );
}

export async function getFundStore(sb: SupabaseClient, universe: FundUniverse): Promise<FundStore | null> {
  try {
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', rawKey(universe))
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (!data?.explanation) return null;
    return JSON.parse(data.explanation as string) as FundStore;
  } catch {
    return null;
  }
}
