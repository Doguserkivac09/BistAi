/**
 * Dipten tepeye SWING işlemi — İŞLEM BAZLI geriye dönük ölçüm.
 *
 * `setup-backtest.ts` sinyalden sonra SABİT 20 gün tutuyordu. Kullanıcının
 * stratejisi bu değil: **dip bölgesinde gir, tepe bölgesi gelince çık.** Bu betik
 * tam olarak onu simüle eder.
 *
 * ⚠️ ASIL SORU "dipten tepeye %15-30 oldu mu?" DEĞİL. Dipler grafikte tepe
 * görüldükten SONRA işaretlenir; aynı koşulların oluşup fiyatın düşmeye devam
 * ettiği yerler gözden kaçar. Soru: **kurulumla girmek, aynı hissede rastgele
 * girip AYNI SÜRE tutmaktan iyi mi?** Her işlem kendi rastgele eşleriyle
 * (aynı hisse, aynı tutma süresi, 30 örnek) karşılaştırılır.
 *
 * TradingView ayarları (kullanıcının VRT 1s grafiğinden, 2026-09-11):
 *   RSI 14 (Wilder) · DMI/ADX 14/14 anahtar seviye 23 · Vortex 7 · OBV + SMA 21
 *
 * DİP koşulları (her biri son ZONE mum içinde en az bir kez):
 *   RSI ≤ 30 · ADX zirvesi (≥23, −DI baskın) son 10 mumda ve düşüyor ·
 *   VI+ son 20 mumun dibi 1-5 mum önce ve yükseliyor ·
 *   OBV SMA21'i son 3 mumda yukarı kesmiş, 60 mumluk aralığın alt %40'ında
 * TEPE = tam aynası (RSI ≥ 70 · +DI baskın ADX zirvesi · VI+ tepeden dönüş · OBV üstte kırmızı)
 *
 * Çıkış kuralları (aynı girişler, üç ayrı çıkış):
 *   tepe      → tepe bölgesi gelince bir sonraki mumun açılışı (gelmezse süre dolunca)
 *   rsi70     → RSI ≥ 70 olunca
 *   hedefstop → +%15 hedef / −%10 stop (aynı mumda ikisi → stop varsayılır)
 *
 * ⚠️ BİLİNEN SINIRLAR: survivorship (bugünkü semboller) · Yahoo bedelsiz
 * düzeltmesi → |mum| > %25 içeren işlemler elenir · 1s verisi Yahoo'da ~2 yıl ·
 * komisyon/kayma yalnız "net" sütununda %0,2 gidiş-dönüş.
 *
 * ── SONUÇ (2026-09-11) — ana ölçüt: GİRİŞ KATKISI = strateji − rastgele giriş (aynı çıkış) ──
 * Kalibrasyon: göstergeler TV ile uyuşuyor (26 Haz 17:30 VRT: RSI 33,61/33,51 · +DI 18,45/18,50 ·
 * −DI 39,31/39,17 · VI+ 0,5523/0,5522); yalnız ADX ~3 puan yüksek (topluluk betiği farkı).
 * SIRALI tanım VRT'de kullanıcının 3 dairesini de yakalar AMA aynı 6 ayda gözün atladığı
 * kaybedenleri de bulur (22 May −16,7% dip, 21 Tem −26,9% dip).
 *
 * BIST 1s (553 hisse, 2023-10 → 2026-09, SIRALI, hisse başına yılda ~13 işlem — SEYREK DEĞİL):
 *   tepe çıkışı   n=17.179 · kazanan %47 · KATKI −0,3 [−0,6, −0,0] · endekse göre −0,1 [−0,4, +0,1]
 *   RSI≥70        n=14.654 · kazanan %64 (rastgele %68) · KATKI −0,3 [−0,6, −0,1]
 *   hedef/stop    n=12.483 · kazanan %46 · KATKI −0,3 [−1,0, +0,4]
 *   27 varyantın hiçbirinde anlamlı pozitif yok; 8 günlük pencerede anlamlı NEGATİF.
 * BIST 1g (587 hisse, 2021-09 → 2026-09, SIRALI): üç çıkışta da endekse göre katkı
 *   +0,1…+0,9, güven aralıkları sıfırı geniş kapsıyor; örneklem dışı −0,6…−0,7.
 * İlk 'bolge' tanımı (1s): tepe çıkışı endekse göre +0,8 [+0,1, +1,5] ama VRT dairelerini
 *   bulamadığı için kullanıcının kurulumu DEĞİL; ızgarada 9'da 4 anlamlı, dayanıksız.
 * KARAR: ❌ BIST'te bu giriş, rastgele girip aynı kuralla çıkmaktan iyi DEĞİL. Yayınlanmaz.
 *
 * ABD (yüksek hacim: 20g medyan ≥ $100M, endeks SPY):
 *   1s (507 hisse, 2023-10 → 2026-09): katkı tepe +0,1 · RSI70 −0,0 · hedef/stop +0,2 — hiçbiri
 *     anlamlı, 27 varyantın 0'ı anlamlı → ❌ kullanıcının grafik zaman diliminde fayda YOK.
 *   1g (509 hisse, 5 yıl, hisse başına yılda 0,23 işlem): SPY'a göre katkı tepe +1,3 [−0,4,+3,1] ·
 *     RSI70 +1,1 [−0,2,+2,4] · hedef/stop +0,5 [−0,5,+1,3]; 24 varyantın 24'ü pozitif, 5'i anlamlı;
 *     iki yarıda da pozitif → ⚠️ ZAYIF OLUMLU İŞARET, kanıt değil. Yayın yok; ileriye dönük sicil adayı.
 *
 * ── DURUM tanımı + "siyah beyazı kesti" çıkışı (kullanıcı düzeltmesi, 2026-09-11) ──
 *   BIST 1s: tüm çıkışlarda katkı ~+0,1 (anlamsız) → ❌
 *   ABD 1s:  tüm çıkışlarda katkı ~0 → ❌
 *   ABD 1g, çıkış −DI > +DI: n=447 · hisse başına yılda 0,22 · kazanan %56 (rastgele %43) ·
 *     SPY'a göre katkı +1,1 [+0,2, +2,1] · iki yarıda +1,0 / +1,2 · 8/8 varyant anlamlı → ✅
 *     BU ÇALIŞMADAKİ İLK ANLAMLI SONUÇ. Diğer ABD 1g çıkışları (VI kesişimi, ikisinden biri) ~0.
 *   ⚠️ Tanım aynı veride birkaç tur düzeltildi → yayından önce ileriye dönük sicil şart.
 *
 * Kullanım:
 *   npx tsx scripts/swing-backtest.ts fetch             # 1s veri (BIST + XU100 + VRT) → önbellek
 *   npx tsx scripts/swing-backtest.ts diag 1h-us VRT 2026-06-01 2026-06-26T14:30  # kalibrasyon
 *   npx tsx scripts/swing-backtest.ts analyze 1h
 *   npx tsx scripts/swing-backtest.ts analyze 1d        # setup-backtest'in günlük önbelleğini okur
 *   npx tsx scripts/swing-backtest.ts trades 1h-us VRT  # tek sembolün bölge/işlem listesi (TRT saati)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BIST_SYMBOLS } from '../types';
import { US_SYMBOL_LIST } from '../lib/us-symbols';
import { calculateADX, calculateOBV, calculateSMA, calculateVortex } from '../lib/indicators';

const ROOT = process.env.SETUP_CACHE ?? path.join(os.tmpdir(), 'bistai-setup-backtest');
const INDEX = 'XU100';

// ── TradingView ayarları + kurulum sabitleri (SONUÇLARA BAKMADAN sabitlendi) ──
const TV = { rsi: 14, di: 14, adxKey: 23, vi: 7, obvSma: 21 };
const RSI_LOW = 30;
const ADX_LOOK = 10, VI_WIN = 20, VI_LOOK = 5, OBV_CROSS_LOOK = 3, OBV_RANGE = 60, OBV_POS = 0.4;
const TARGET = 0.15, STOP = -0.10, COST = 0.002;
const RANDOM_PER_TRADE = 30, RANDOM_ENTRY_MULT = 10;
const GAP_LIMIT = 0.25, MIN_TL_VOL = 5_000_000, WARM = 80;

type TF = '1h' | '1d';
const CFG: Record<TF, { zone: number; maxHold: number; barsPerDay: number; split: string }> = {
  '1h': { zone: 10, maxHold: 40 * 9, barsPerDay: 9, split: '2025-03-15' },
  '1d': { zone: 5, maxHold: 60, barsPerDay: 1, split: '2024-03-01' },
};

type Piyasa = 'BIST' | 'US';
/** ABD: "yüksek hacimli" = 20 günlük medyan dolar hacmi ≥ $100M (kullanıcı talebi, 2026-09-11). */
const PIYASA: Record<Piyasa, { endeks: string; gunlukDir: string; saatlikDir: string; saatlikBpd: number; minHacim: number }> = {
  BIST: { endeks: INDEX, gunlukDir: '', saatlikDir: '1h', saatlikBpd: 9, minHacim: MIN_TL_VOL },
  US: { endeks: 'SPY', gunlukDir: '1d-us', saatlikDir: '1h-us', saatlikBpd: 7, minHacim: 100_000_000 },
};

interface Bar { key: string; day: string; open: number; high: number; low: number; close: number; volume: number }

// ── Veri çekme ───────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchChart(ySym: string, gunluk = false): Promise<Bar[]> {
  let son: Error | null = null;
  for (const host of ['query1', 'query2']) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${ySym}?range=${gunluk ? '5y' : '730d'}&interval=${gunluk ? '1d' : '60m'}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(45_000),
      });
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as any;
      const res = j?.chart?.result?.[0];
      const ts: number[] = res?.timestamp ?? [];
      const q = res?.indicators?.quote?.[0] ?? {};
      const out: Bar[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
        if (o == null || h == null || l == null || c == null || c <= 0) continue;
        const iso = new Date(ts[i]! * 1000).toISOString();
        // Yarım kalan son mum saat başı :30'da değil (ör. 12:53) → atılır.
        if (!gunluk && iso.slice(14, 16) !== '30') continue;
        out.push({ key: gunluk ? iso.slice(0, 10) : iso.slice(0, 16), day: iso.slice(0, 10), open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
      }
      return out;
    } catch (e) { son = e as Error; }
  }
  throw son ?? new Error('bilinmeyen hata');
}

async function fetchAll(piyasa: Piyasa) {
  // [sembol, yahoo sembolü, klasör, günlük mü]
  type Hedef = [string, string, string, boolean];
  const hedefler: Hedef[] = piyasa === 'BIST'
    ? [
      [INDEX, `${INDEX}.IS`, '1h', false],
      ...Array.from(new Set(BIST_SYMBOLS as readonly string[])).map((s): Hedef => [s, `${s}.IS`, '1h', false]),
      ['VRT', 'VRT', '1h-us', false],
    ]
    : ['SPY', ...new Set(US_SYMBOL_LIST)].flatMap((s): Hedef[] => [[s, s, '1d-us', true], [s, s, '1h-us', false]]);
  let ardisikHata = 0, cekilen = 0, atlanan = 0;
  for (const [i, [sym, ySym, dir, gunluk]] of hedefler.entries()) {
    const klasor = path.join(ROOT, dir);
    fs.mkdirSync(klasor, { recursive: true });
    const file = path.join(klasor, `${sym}.json`);
    if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 24 * 3600_000) { atlanan++; continue; }
    try {
      fs.writeFileSync(file, JSON.stringify(await fetchChart(ySym, gunluk)));
      cekilen++; ardisikHata = 0;
    } catch (e) {
      ardisikHata++;
      console.log(`  ${sym} HATA: ${(e as Error).message}`);
      if (ardisikHata >= 8) { console.error('⛔ art arda 8 hata — DURULDU (idempotent, sonra tekrar koş).'); process.exitCode = 2; return; }
    }
    if ((i + 1) % 50 === 0) console.log(`[${i + 1}/${hedefler.length}] çekilen ${cekilen} · önbellekte ${atlanan}`);
    await sleep(350 + Math.random() * 450);
  }
  console.log(`BİTTİ — çekilen ${cekilen} · önbellekte ${atlanan}`);
}

// ── Göstergeler ──────────────────────────────────────────────────────────────

function wilderRSI(c: number[], p = 14): Float64Array {
  const out = new Float64Array(c.length).fill(NaN);
  if (c.length <= p) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = c[i]! - c[i - 1]!; if (d > 0) g += d; else l -= d; }
  g /= p; l /= p;
  out[p] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i]! - c[i - 1]!;
    g = (g * (p - 1) + Math.max(d, 0)) / p;
    l = (l * (p - 1) + Math.max(-d, 0)) / p;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}

function lastTrue(a: ArrayLike<number>): Int32Array {
  const out = new Int32Array(a.length);
  let son = -1_000_000;
  for (let i = 0; i < a.length; i++) { if (a[i]) son = i; out[i] = son; }
  return out;
}

function medyan(a: number[]): number {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

interface Pre {
  sym: string; n: number; keys: string[]; days: string[];
  o: number[]; h: number[]; l: number[]; c: number[];
  rsi: Float64Array;
  lAdxDown: Int32Array; lAdxUp: Int32Array; lViUp: Int32Array; lViDown: Int32Array; lObvUp: Int32Array; lObvDown: Int32Array; lObvKesUp: Int32Array; lObvKesDown: Int32Array;
  rsiCache: Map<number, { low: Int32Array; high: Int32Array }>;
  liquid: Uint8Array; gapPref: Int32Array;
  /** Ham seriler — DURUM tanımı (giriş anında eğim) ve siyah/beyaz kesişim çıkışı için. */
  pdi: number[]; mdi: number[]; adx: number[]; vip: number[]; vim: number[];
}

function precompute(sym: string, bars: Bar[], liquidDays: Set<string> | null): Pre | null {
  const n = bars.length;
  if (n < 300) return null;
  const o = bars.map((b) => b.open), h = bars.map((b) => b.high), l = bars.map((b) => b.low), c = bars.map((b) => b.close), v = bars.map((b) => b.volume);
  const rsi = wilderRSI(c, TV.rsi);
  const { plusDi, minusDi, adx } = calculateADX(h, l, c, TV.di);
  const { viPlus, viMinus } = calculateVortex(h, l, c, TV.vi);
  const obv = calculateOBV(c, v);
  const obvSma = calculateSMA(obv, TV.obvSma);

  const adxDown = new Uint8Array(n), adxUp = new Uint8Array(n), viUp = new Uint8Array(n), viDown = new Uint8Array(n), obvUp = new Uint8Array(n), obvDown = new Uint8Array(n);
  const obvKesUp = new Uint8Array(n), obvKesDown = new Uint8Array(n);
  for (let t = OBV_RANGE; t < n; t++) {
    if (Number.isFinite(adx[t - ADX_LOOK]) && Number.isFinite(adx[t])) {
      let p = t - ADX_LOOK;
      for (let j = t - ADX_LOOK; j <= t; j++) if (adx[j]! > adx[p]!) p = j;
      if (p > t - ADX_LOOK && p < t && adx[t]! < adx[t - 1]! && adx[p]! >= TV.adxKey) {
        if (minusDi[p]! > plusDi[p]!) adxDown[t] = 1;
        if (plusDi[p]! > minusDi[p]!) adxUp[t] = 1;
      }
    }
    if (Number.isFinite(viPlus[t - VI_WIN + 1])) {
      let mn = t - VI_WIN + 1, mx = mn;
      for (let j = t - VI_WIN + 1; j <= t; j++) { if (viPlus[j]! < viPlus[mn]!) mn = j; if (viPlus[j]! > viPlus[mx]!) mx = j; }
      if (t - mn >= 1 && t - mn <= VI_LOOK && viPlus[t]! > viPlus[t - 1]!) viUp[t] = 1;
      if (t - mx >= 1 && t - mx <= VI_LOOK && viPlus[t]! < viPlus[t - 1]!) viDown[t] = 1;
    }
    let altta = false, ustte = false;
    for (let j = t - OBV_CROSS_LOOK; j < t; j++) { if (obv[j]! <= obvSma[j]!) altta = true; if (obv[j]! >= obvSma[j]!) ustte = true; }
    let oMn = Infinity, oMx = -Infinity;
    for (let j = t - OBV_RANGE + 1; j <= t; j++) { oMn = Math.min(oMn, obv[j]!); oMx = Math.max(oMx, obv[j]!); }
    const pos = oMx > oMn ? (obv[t]! - oMn) / (oMx - oMn) : NaN;
    if (obv[t]! > obvSma[t]! && altta && pos <= OBV_POS) obvUp[t] = 1;
    if (obv[t]! < obvSma[t]! && ustte && pos >= 1 - OBV_POS) obvDown[t] = 1;
    // Konum şartı OLMADAN kesişim — SIRALI tanımın tetiği (kalibrasyonda konum
    // şartı kullanıcının Haziran dairesini eliyordu).
    if (obv[t]! > obvSma[t]! && altta) obvKesUp[t] = 1;
    if (obv[t]! < obvSma[t]! && ustte) obvKesDown[t] = 1;
  }

  const gapPref = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) gapPref[i + 1] = gapPref[i]! + (i > 0 && Math.abs(c[i]! / c[i - 1]! - 1) > GAP_LIMIT ? 1 : 0);
  const liquid = new Uint8Array(n);
  for (let i = 0; i < n; i++) liquid[i] = !liquidDays || liquidDays.has(bars[i]!.day) ? 1 : 0;

  return {
    sym, n, keys: bars.map((b) => b.key), days: bars.map((b) => b.day), o, h, l, c, rsi,
    lAdxDown: lastTrue(adxDown), lAdxUp: lastTrue(adxUp), lViUp: lastTrue(viUp), lViDown: lastTrue(viDown),
    lObvUp: lastTrue(obvUp), lObvDown: lastTrue(obvDown), lObvKesUp: lastTrue(obvKesUp), lObvKesDown: lastTrue(obvKesDown),
    rsiCache: new Map(), liquid, gapPref,
    pdi: plusDi, mdi: minusDi, adx, vip: viPlus, vim: viMinus,
  };
}

/**
 * tip 'bolge'  → dört koşulun her biri son `zone` mumda (İLK tanım).
 * tip 'sirali' → tetik OBV'nin SMA21'i kestiği mum; son `zone` mumda (5 iş günü)
 *   RSI dibi + ADX tepeden dönüş + VI+ dipten dönüş olmuş olmalı.
 *
 * ⚠️ SIRALI NEDEN VAR (2026-09-11 kalibrasyonu): 'bolge' kullanıcının VRT 1s
 * grafiğinde çizdiği üç dip dairesinin HİÇBİRİNİ bulmadı. Günlük koşul dökümü
 * (`diag`) koşulların kullanıcının tarif ettiği SIRAYLA ama 3-4 güne yayılarak
 * geldiğini gösterdi (RSI dibi → ADX dönüşü/VI+ → en son OBV yeşil). 'sirali'
 * üç dairenin üçünü de yakalar, henüz OBV dönmemiş Eylül dairesini doğru şekilde
 * yakalamaz. Tanım VRT'ye (ABD) bakılarak kuruldu → BIST ölçümü bağımsız testtir.
 */
/**
 * tip 'durum' → SIRALI + giriş anında HEPSİ HÂLÂ dönmüş olmalı (kullanıcı düzeltmesi,
 *   2026-09-11): ADX düşüyor, −DI düşüyor, VI+ yükseliyor, VI− düşüyor (son `egim`
 *   mumda). Kullanıcı: VRT 21 Tem'de RSI dipteydi ama ADX yükseliyor ve VI düşen tepe
 *   yapıyordu → "düşüş bitmemiş", kriter dışı. `egim` = eğimin ölçüldüğü mum sayısı.
 */
interface Kural { tip: 'bolge' | 'sirali' | 'durum'; zone: number; rsiLow: number; egim?: number }

function bolgeler(p: Pre, K: Kural) {
  let r = p.rsiCache.get(K.rsiLow);
  if (!r) {
    r = { low: lastTrue(Array.from(p.rsi, (x) => (x <= K.rsiLow ? 1 : 0))), high: lastTrue(Array.from(p.rsi, (x) => (x >= 100 - K.rsiLow ? 1 : 0))) };
    p.rsiCache.set(K.rsiLow, r);
  }
  const R = r;
  const icinde = (a: Int32Array, j: number) => j - a[j]! < K.zone;
  if (K.tip === 'durum') {
    const S = K.egim ?? 3;
    const dusuyor = (a: number[], j: number) => j >= S && a[j]! < a[j - S]!;
    const yukseliyor = (a: number[], j: number) => j >= S && a[j]! > a[j - S]!;
    return {
      dip: (j: number) => p.lObvKesUp[j] === j && icinde(R.low, j) && icinde(p.lAdxDown, j) && icinde(p.lViUp, j)
        && dusuyor(p.adx, j) && dusuyor(p.mdi, j) && yukseliyor(p.vip, j) && dusuyor(p.vim, j),
      tepe: (j: number) => p.lObvKesDown[j] === j && icinde(R.high, j) && icinde(p.lAdxUp, j) && icinde(p.lViDown, j)
        && dusuyor(p.adx, j) && dusuyor(p.pdi, j) && dusuyor(p.vip, j) && yukseliyor(p.vim, j),
    };
  }
  if (K.tip === 'sirali') {
    return {
      dip: (j: number) => p.lObvKesUp[j] === j && icinde(R.low, j) && icinde(p.lAdxDown, j) && icinde(p.lViUp, j),
      tepe: (j: number) => p.lObvKesDown[j] === j && icinde(R.high, j) && icinde(p.lAdxUp, j) && icinde(p.lViDown, j),
    };
  }
  return {
    dip: (j: number) => icinde(R.low, j) && icinde(p.lAdxDown, j) && icinde(p.lViUp, j) && icinde(p.lObvUp, j),
    tepe: (j: number) => icinde(R.high, j) && icinde(p.lAdxUp, j) && icinde(p.lViDown, j) && icinde(p.lObvDown, j),
  };
}

// ── İşlem simülasyonu ────────────────────────────────────────────────────────

type Cikis = 'tepe' | 'rsi70' | 'hedefstop' | 'di' | 'vi' | 'herhangi';
const CIKIS_ADI: Record<Cikis, string> = {
  tepe: 'tepe bölgesi (4\'lü ayna)', rsi70: 'RSI ≥ 70', hedefstop: '+%15 hedef / −%10 stop',
  // Kullanıcı: "siyahlar beyazları kesmeye başlamış → çıkış sinyali" (VRT Mayıs örneği)
  di: 'siyah kesti: −DI > +DI', vi: 'siyah kesti: VI− > VI+', herhangi: 'siyah kesti: DI veya VI',
};

interface CikisSonucu { son: number; px: number; sonrakiAcilis: boolean; sureDoldu: boolean; mfe: number; mae: number }

function cikisBul(p: Pre, e: number, kural: Cikis, K: Kural, z: ReturnType<typeof bolgeler>, maxHold: number): CikisSonucu | null {
  const giris = p.o[e]!;
  let mx = -Infinity, mn = Infinity;
  const bitis = e + maxHold - 1;
  for (let k = e; k < p.n; k++) {
    mx = Math.max(mx, p.h[k]!); mn = Math.min(mn, p.l[k]!);
    const sonuc = (px: number, sonrakiAcilis: boolean, sureDoldu = false): CikisSonucu =>
      ({ son: k, px, sonrakiAcilis, sureDoldu, mfe: mx / giris - 1, mae: mn / giris - 1 });
    if (kural === 'hedefstop') {
      const stopPx = giris * (1 + STOP), hedefPx = giris * (1 + TARGET);
      if (p.l[k]! <= stopPx) return sonuc(Math.min(p.o[k]!, stopPx), false);
      if (p.h[k]! >= hedefPx) return sonuc(Math.max(p.o[k]!, hedefPx), false);
    } else if (kural === 'di' || kural === 'vi' || kural === 'herhangi') {
      // Kesişim OLAYI (durum değil): girişte siyah zaten üstteyse hemen çıkılmaz,
      // beyaz öne geçip siyah yeniden yukarı kesince çıkılır.
      const diKes = p.mdi[k]! > p.pdi[k]! && p.mdi[k - 1]! <= p.pdi[k - 1]!;
      const viKes = p.vim[k]! > p.vip[k]! && p.vim[k - 1]! <= p.vip[k - 1]!;
      const sinyal = kural === 'di' ? diKes : kural === 'vi' ? viKes : diKes || viKes;
      if (sinyal) return k + 1 < p.n ? sonuc(p.o[k + 1]!, true) : null;
    } else {
      const sinyal = kural === 'tepe' ? z.tepe(k) : p.rsi[k]! >= 100 - K.rsiLow;
      if (sinyal) return k + 1 < p.n ? sonuc(p.o[k + 1]!, true) : null;
    }
    if (k === bitis) return sonuc(p.c[k]!, false, true);
  }
  return null; // veri bitti, işlem hâlâ açık → sayılmaz
}

type IdxMap = Map<string, { open: number; close: number }>;

/** XU100'ün aynı pencerede getirisi (açılış yoksa önceki kapanış). */
function endeksGetirisi(idx: IdxMap | null, p: Pre, e: number, son: number, sonrakiAcilis: boolean): number | null {
  if (!idx) return null;
  const girisBar = idx.get(p.keys[e]!), oncekiBar = e > 0 ? idx.get(p.keys[e - 1]!) : undefined;
  const g = girisBar && girisBar.open > 0 ? girisBar.open : oncekiBar?.close;
  let x: number | undefined;
  if (sonrakiAcilis) { const b = idx.get(p.keys[son + 1]!); x = b && b.open > 0 ? b.open : idx.get(p.keys[son]!)?.close; }
  else x = idx.get(p.keys[son]!)?.close;
  return g && x ? x / g - 1 : null;
}

interface Islem {
  sym: string; day: string; key: string;
  ret: number; exc: number | null; mfe: number; mae: number; bar: number; sureDoldu: boolean;
  rRet: number; rMfe: number; rMfe15: number;
}

interface RgIslem { ret: number; exc: number | null; bar: number; sureDoldu: boolean; day: string }

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
const tohum = (s: string) => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7);

function temiz(p: Pre, bas: number, son: number) {
  return p.gapPref[Math.min(p.n, son + 2)]! - p.gapPref[Math.max(0, bas - 60)]! === 0;
}

function simule(pres: Pre[], idx: IdxMap | null, K: Kural, kural: Cikis, tf: TF) {
  const { maxHold } = CFG[tf];
  const islemler: Islem[] = [];
  const rastgeleGiris: RgIslem[] = [];
  for (const p of pres) {
    const z = bolgeler(p, K);
    const r = rng(tohum(p.sym + kural + K.zone + K.rsiLow));
    let sembolIslem = 0;
    let t = WARM;
    while (t < p.n - 2) {
      if (!(z.dip(t) && p.liquid[t])) { t++; continue; }
      const e = t + 1;
      const cx = cikisBul(p, e, kural, K, z, maxHold);
      if (!cx) break;
      if (temiz(p, t, cx.son)) {
        const ret = cx.px / p.o[e]! - 1;
        const bar = cx.son - e + 1;
        // Rastgele eş: aynı hisse, aynı tutma süresi, aynı çıkış fiyat türü
        let rS = 0, rM = 0, r15 = 0, rn = 0;
        for (let deneme = 0; deneme < RANDOM_PER_TRADE * 3 && rn < RANDOM_PER_TRADE; deneme++) {
          const ri = WARM + Math.floor(r() * (p.n - bar - 2 - WARM));
          if (ri < WARM || !p.liquid[ri - 1] || !temiz(p, ri, ri + bar)) continue;
          const cikisPx = cx.sonrakiAcilis ? p.o[ri + bar]! : p.c[ri + bar - 1]!;
          let mx = -Infinity;
          for (let j = ri; j < ri + bar; j++) mx = Math.max(mx, p.h[j]!);
          rS += cikisPx / p.o[ri]! - 1; rM += mx / p.o[ri]! - 1; r15 += mx / p.o[ri]! - 1 >= TARGET ? 1 : 0; rn++;
        }
        if (rn > 0) {
          islemler.push({
            sym: p.sym, day: p.days[t]!, key: p.keys[t]!, ret, exc: endeksGetirisi(idx, p, e, cx.son, cx.sonrakiAcilis),
            mfe: cx.mfe, mae: cx.mae, bar, sureDoldu: cx.sureDoldu, rRet: rS / rn, rMfe: rM / rn, rMfe15: r15 / rn,
          });
          sembolIslem++;
        }
      }
      t = cx.son + 1;
    }
    // Rastgele giriş + AYNI çıkış kuralı (girişin katkısını ayırır)
    for (let k = 0; k < sembolIslem * RANDOM_ENTRY_MULT; k++) {
      const ri = WARM + Math.floor(r() * (p.n - 2 - WARM));
      if (!p.liquid[ri - 1]) continue;
      // Çıkış sinyali giriş anında ZATEN açıksa rastgele işlem ertesi mum ~%0 ile
      // kapanır ve rastgele ortalamayı yapay düşürür (dip girişinde bu hiç olmaz).
      if (kural === 'tepe' && z.tepe(ri - 1)) continue;
      if (kural === 'rsi70' && p.rsi[ri - 1]! >= 100 - K.rsiLow) continue;
      const cx = cikisBul(p, ri, kural, K, z, maxHold);
      if (!cx || !temiz(p, ri, cx.son)) continue;
      rastgeleGiris.push({
        ret: cx.px / p.o[ri]! - 1, exc: endeksGetirisi(idx, p, ri, cx.son, cx.sonrakiAcilis),
        bar: cx.son - ri + 1, sureDoldu: cx.sureDoldu, day: p.days[ri]!,
      });
    }
  }
  return { islemler, rastgeleGiris };
}

// ── Rapor ────────────────────────────────────────────────────────────────────

const pct = (x: number, d = 1) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}` : '—');
const yuzde = (x: number) => `%${Math.round(x * 100)}`;
const ort = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

function farkGA(islemler: Islem[]): [number, number, number] {
  const gunler = new Map<string, number[]>();
  for (const i of islemler) { const a = gunler.get(i.day); const d = i.ret - i.rRet; if (a) a.push(d); else gunler.set(i.day, [d]); }
  const g = [...gunler.values()].map(ort);
  const r = rng(99);
  const b: number[] = [];
  for (let k = 0; k < 1000; k++) { let s = 0; for (let j = 0; j < g.length; j++) s += g[Math.floor(r() * g.length)]!; b.push(s / g.length); }
  b.sort((x, y) => x - y);
  return [ort(g), b[25]!, b[974]!];
}

/**
 * GİRİŞ KATKISI = strateji ort. getiri − (rastgele giriş + AYNI çıkış kuralı) ort. getiri.
 *
 * ⚠️ ANA ÖLÇÜT BU. "Aynı süre rastgele" (farkGA) yola bağlı çıkışlarda YANLIDIR:
 * hedef/stop veya RSI≥70 çıkışında tutma süresi sonucun kendisiyle belirlenir
 * (hedefe vurunca kapanır) ve rastgele eşe bu süre hazır verilir. Rastgele
 * girişe aynı çıkış kuralını uygulamak bu yanlılığı taşımaz.
 * Strateji tarafı tarih-kümeli, rastgele taraf basit bootstrap.
 *
 * `alan = 'exc'` → endekse göre fazla getiri üzerinden. ⚠️ Enflasyonlu piyasada
 * nominal getiri tutma SÜRESİYLE kendiliğinden büyür; dipten giren işlem RSI 70'e
 * daha geç ulaştığı için daha uzun tutulur ve yalnız bu yüzden puan kazanır.
 * Fazla getiri bu sürüklenmeyi çıkarır — iki ölçüt ayrışıyorsa fazla getiriye güven.
 */
function katkiGA(I: Islem[], RG: RgIslem[], alan: 'ret' | 'exc' = 'ret'): [number, number, number] {
  const al = (x: { ret: number; exc: number | null }) => (alan === 'ret' ? x.ret : x.exc);
  const Iv = I.filter((i) => al(i) != null);
  const rr = RG.map(al).filter((x): x is number => x != null);
  if (Iv.length < 10 || rr.length < 10) return [NaN, NaN, NaN];
  const gunler = new Map<string, number[]>();
  for (const i of Iv) { const v = al(i)!; const a = gunler.get(i.day); if (a) a.push(v); else gunler.set(i.day, [v]); }
  const g = [...gunler.values()];
  const nokta = ort(Iv.map((i) => al(i)!)) - ort(rr);
  const r = rng(7);
  const b: number[] = [];
  for (let k = 0; k < 1000; k++) {
    let s = 0, c = 0;
    for (let j = 0; j < g.length; j++) { for (const x of g[Math.floor(r() * g.length)]!) { s += x; c++; } }
    let s2 = 0;
    for (let j = 0; j < rr.length; j++) s2 += rr[Math.floor(r() * rr.length)]!;
    b.push(s / c - s2 / rr.length);
  }
  b.sort((x, y) => x - y);
  return [nokta, b[25]!, b[974]!];
}

function rapor(baslik: string, sim: ReturnType<typeof simule>, tf: TF, hisseYil: number) {
  const { islemler: I, rastgeleGiris: RG } = sim;
  const bpd = CFG[tf].barsPerDay;
  console.log(`\n▶ ${baslik}`);
  if (I.length < 10) { console.log(`  yetersiz işlem (${I.length})`); return; }
  const exc = I.map((i) => i.exc).filter((x): x is number => x != null);
  const [f, lo, hi] = farkGA(I);
  console.log(`  işlem ${I.length} · hisse başına yılda ${(I.length / hisseYil).toFixed(2)} · ort. süre ${(ort(I.map((i) => i.bar)) / bpd).toFixed(1)} gün · ${yuzde(I.filter((i) => i.sureDoldu).length / I.length)} süre dolunca çıktı`);
  console.log(`  STRATEJİ  kazanan ${yuzde(I.filter((i) => i.ret - COST > 0).length / I.length)} · ort ${pct(ort(I.map((i) => i.ret)))}% (net ${pct(ort(I.map((i) => i.ret - COST)))}) · medyan ${pct(medyan(I.map((i) => i.ret)))}% · endekse göre ${pct(ort(exc))} · işlem içi tepe ort ${pct(ort(I.map((i) => i.mfe)))}% · +%15 gördü ${yuzde(I.filter((i) => i.mfe >= TARGET).length / I.length)} · −%10 dip ${yuzde(I.filter((i) => i.mae <= STOP).length / I.length)}`);
  console.log(`  RASTGELE  (aynı hisse · aynı süre) ort ${pct(ort(I.map((i) => i.rRet)))}% · tepe ort ${pct(ort(I.map((i) => i.rMfe)))}% · +%15 gördü ${yuzde(ort(I.map((i) => i.rMfe15)))}`);
  console.log(`  FARK      ${pct(f)} puan [${pct(lo)}, ${pct(hi)}] (tarih-kümeli 95% GA) · işlemlerin ${yuzde(I.filter((i) => i.ret > i.rRet).length / I.length)}'i kendi rastgelesini geçti`);
  if (RG.length) console.log(`  RASTGELE GİRİŞ + AYNI ÇIKIŞ  ort ${pct(ort(RG.map((x) => x.ret)))}% · kazanan ${yuzde(RG.filter((x) => x.ret - COST > 0).length / RG.length)} · ort. süre ${(ort(RG.map((x) => x.bar)) / bpd).toFixed(1)} gün · ${yuzde(RG.filter((x) => x.sureDoldu).length / RG.length)} süre doldu (n=${RG.length})`);
  const [k, klo, khi] = katkiGA(I, RG);
  const [kx, kxlo, kxhi] = katkiGA(I, RG, 'exc');
  console.log(`  ★ GİRİŞ KATKISI  nominal ${pct(k)} puan [${pct(klo)}, ${pct(khi)}] · endekse göre ${pct(kx)} puan [${pct(kxlo)}, ${pct(kxhi)}]  ← ana ölçüt`);
}

const satirKatki = (etiket: string, I: Islem[], RG: RgIslem[]) => {
  if (I.length < 10) return `  ${etiket} · yetersiz (${I.length})`;
  const [k, lo, hi] = katkiGA(I, RG);
  const [kx, lox, hix] = katkiGA(I, RG, 'exc');
  return `  ${etiket} · n=${String(I.length).padStart(5)} · strateji ${pct(ort(I.map((i) => i.ret)))}% · rastgele giriş ${pct(ort(RG.map((x) => x.ret)))}% · KATKI ${pct(k)} [${pct(lo)}, ${pct(hi)}] · endekse göre ${pct(kx)} [${pct(lox)}, ${pct(hix)}]`;
};

function yukle(dir: string): Map<string, Bar[]> {
  const out = new Map<string, Bar[]>();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const ham = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Array<Partial<Bar> & { date?: string }>;
    out.set(f.replace('.json', ''), ham.map((b) => ({
      key: b.key ?? b.date!, day: b.day ?? b.date!, open: b.open!, high: b.high!, low: b.low!, close: b.close!, volume: b.volume ?? 0,
    })));
  }
  return out;
}

function likitGunler(daily: Bar[] | undefined, min: number): Set<string> | null {
  if (!daily) return null;
  const s = new Set<string>();
  const tl = daily.map((b) => b.close * b.volume);
  for (let i = 19; i < daily.length; i++) if (medyan(tl.slice(i - 19, i + 1)) >= min) s.add(daily[i]!.day);
  return s;
}

function analyze(tf: TF, piyasa: Piyasa) {
  const P = PIYASA[piyasa];
  if (tf === '1h') { CFG['1h'].barsPerDay = P.saatlikBpd; CFG['1h'].maxHold = 40 * P.saatlikBpd; }
  const cfg = CFG[tf];
  const gunluk = yukle(path.join(ROOT, P.gunlukDir));
  const veri = tf === '1d' ? gunluk : yukle(path.join(ROOT, P.saatlikDir));
  const idxBars = veri.get(P.endeks);
  if (!idxBars) throw new Error(`${P.endeks} önbellekte yok`);
  const idx: IdxMap = new Map(idxBars.map((b) => [b.key, { open: b.open, close: b.close }]));

  const pres: Pre[] = [];
  let toplamBar = 0;
  for (const [sym, bars] of veri) {
    if (sym === P.endeks) continue;
    const likit = likitGunler(gunluk.get(sym), P.minHacim);
    if (!likit) continue; // likidite ölçülemeyen sembol ölçülmez
    const p = precompute(sym, bars, likit);
    if (!p) continue;
    pres.push(p);
    toplamBar += p.liquid.reduce((a, x) => a + x, 0);
  }
  const hisseYil = toplamBar / (252 * cfg.barsPerDay);
  const EGIM = tf === '1h' ? 3 : 1;
  const K: Kural = { tip: 'durum', zone: 5 * cfg.barsPerDay, rsiLow: RSI_LOW, egim: EGIM };
  console.log(`\n══════ ${piyasa} ${tf} · endeks ${P.endeks} · ${pres.length} hisse · likit hisse-yıl ${hisseYil.toFixed(0)} · ${idxBars[0]!.day} → ${idxBars[idxBars.length - 1]!.day} ══════`);
  console.log(`DURUM: OBV yeşile döner + son 5 iş günü (${K.zone} mum) içinde RSI≤30, ADX tepeden dönüş (−DI), VI+ dipten dönüş + girişte ADX↓ −DI↓ VI+↑ VI−↓ (son ${EGIM} mum) · en uzun tutma ${cfg.maxHold / cfg.barsPerDay} gün · TV ayarları RSI14 / DMI14 anahtar 23 / VI7 / OBV-SMA21`);

  console.log('\n═══ A. ANA SONUÇ — aynı dip girişleri, farklı çıkışlar ═══');
  const sims = new Map<Cikis, ReturnType<typeof simule>>();
  const CIKISLAR: Cikis[] = ['herhangi', 'di', 'vi', 'tepe'];
  for (const kural of CIKISLAR) {
    const s = simule(pres, idx, K, kural, tf);
    sims.set(kural, s);
    rapor(`ÇIKIŞ: ${CIKIS_ADI[kural]}`, s, tf, hisseYil);
  }

  console.log(`\n═══ B. ÖRNEKLEM İÇİ / DIŞI (ayrım ${cfg.split}) — KATKI = strateji − rastgele giriş (aynı çıkış) ═══`);
  for (const kural of CIKISLAR) {
    const { islemler: I, rastgeleGiris: RG } = sims.get(kural)!;
    for (const [ad, f] of [['İÇİ ', (d: string) => d < cfg.split], ['DIŞI', (d: string) => d >= cfg.split]] as const) {
      console.log(satirKatki(`${CIKIS_ADI[kural].padEnd(26)} ${ad}`, I.filter((i) => f(i.day)), RG.filter((x) => f(x.day))));
    }
  }

  console.log('\n═══ C. YIL YIL — KATKI ═══');
  for (const kural of CIKISLAR) {
    const { islemler: I, rastgeleGiris: RG } = sims.get(kural)!;
    for (const y of [...new Set(I.map((i) => i.day.slice(0, 4)))].sort()) {
      console.log(satirKatki(`${CIKIS_ADI[kural].padEnd(26)} ${y}`, I.filter((i) => i.day.startsWith(y)), RG.filter((x) => x.day.startsWith(y))));
    }
  }

  console.log('\n═══ D. SAĞLAMLIK (seçim için DEĞİL) — pencere (iş günü) × RSI eşiği · KATKI ═══');
  for (const kural of CIKISLAR.slice(0, 2)) {
    let pozitif = 0, anlamli = 0, pozitifX = 0, anlamliX = 0, toplam = 0;
    for (const gun of [3, 5, 8]) for (const rsiLow of [25, 30, 35]) {
      const { islemler: I, rastgeleGiris: RG } = simule(pres, idx, { tip: 'durum', zone: gun * cfg.barsPerDay, rsiLow, egim: EGIM }, kural, tf);
      const etiket = `${CIKIS_ADI[kural].padEnd(26)} pencere ${gun}g RSI ${rsiLow}`;
      if (I.length < 30) { console.log(`  ${etiket} · yetersiz (${I.length})`); continue; }
      const [k, lo] = katkiGA(I, RG);
      const [kx, lox] = katkiGA(I, RG, 'exc');
      toplam++; if (k > 0) pozitif++; if (lo > 0) anlamli++; if (kx > 0) pozitifX++; if (lox > 0) anlamliX++;
      console.log(satirKatki(etiket, I, RG));
    }
    console.log(`  → ${CIKIS_ADI[kural]}: ${toplam} varyant · nominal katkı pozitif ${pozitif} (anlamlı ${anlamli}) · endekse göre pozitif ${pozitifX} (anlamlı ${anlamliX})`);
  }
}

/** Tek sembol: dip/tepe bölgelerinin başladığı mumlar + işlemler (TRT saati). */
function trades(dir: string, sym: string) {
  const bars = yukle(path.join(ROOT, dir)).get(sym);
  if (!bars) throw new Error(`${dir}/${sym} önbellekte yok`);
  const p = precompute(sym, bars, null)!;
  const tf: TF = dir.startsWith('1h') ? '1h' : '1d';
  const bpd = dir === '1h-us' ? 7 : CFG[tf].barsPerDay; // ABD seansı günde 7 saatlik mum
  const K: Kural = { tip: 'durum', zone: 5 * bpd, rsiLow: RSI_LOW, egim: tf === '1h' ? 3 : 1 };
  const z = bolgeler(p, K);
  const trt = (key: string) => {
    if (key.length <= 10) return key;
    const d = new Date(`${key}:00Z`); d.setUTCHours(d.getUTCHours() + 3);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  };
  const son = p.n - 1;
  const basla = Math.max(WARM, p.n - 900);
  console.log(`\n${sym} (${dir}) · ${p.n} mum · son fiyat ${p.c[son]!.toFixed(2)} · liste ${trt(p.keys[basla]!)} → ${trt(p.keys[son]!)}`);
  console.log('\nBÖLGE BAŞLANGIÇLARI (koşulların hepsi ilk kez hizalandığı mum):');
  for (let j = basla; j <= son; j++) {
    for (const [ad, f] of [['DİP ', z.dip], ['TEPE', z.tepe]] as const) {
      if (f(j) && !f(j - 1)) {
        let mx = -Infinity, mn = Infinity;
        for (let k = j + 1; k <= Math.min(son, j + 15 * CFG[tf].barsPerDay); k++) { mx = Math.max(mx, p.h[k]!); mn = Math.min(mn, p.l[k]!); }
        const ileri = j < son ? `sonraki 15 gün: en yüksek ${pct(mx / p.c[j]! - 1)}% · en düşük ${pct(mn / p.c[j]! - 1)}%` : '(son mum)';
        console.log(`  ${ad} ${trt(p.keys[j]!)} · kapanış ${p.c[j]!.toFixed(2)} · RSI ${p.rsi[j]!.toFixed(1)} · ${ileri}`);
      }
    }
  }
  for (const kural of ['herhangi', 'di', 'vi'] as Cikis[]) {
    console.log(`\nİŞLEMLER — çıkış: ${CIKIS_ADI[kural]}`);
    let t = basla;
    while (t < p.n - 2) {
      if (!z.dip(t)) { t++; continue; }
      const cx = cikisBul(p, t + 1, kural, K, z, CFG[tf].maxHold);
      if (!cx) { console.log(`  giriş ${trt(p.keys[t + 1]!)} @ ${p.o[t + 1]!.toFixed(2)} · AÇIK (henüz çıkış yok)`); break; }
      console.log(`  giriş ${trt(p.keys[t + 1]!)} @ ${p.o[t + 1]!.toFixed(2)} → çıkış ${trt(p.keys[cx.sonrakiAcilis ? cx.son + 1 : cx.son]!)} @ ${cx.px.toFixed(2)} · ${pct(cx.px / p.o[t + 1]! - 1)}% · işlem içi tepe ${pct(cx.mfe)}% / dip ${pct(cx.mae)}%${cx.sureDoldu ? ' · SÜRE DOLDU' : ''}`);
      t = cx.son + 1;
    }
  }
}

/**
 * TANIM KALİBRASYONU — "kodun gördüğü" ile "kullanıcının grafikte gördüğü" aynı mı?
 * (1) Tek mumda gösterge değerleri (TradingView imleç değerleriyle karşılaştırmak için)
 * (2) Gün gün her koşulun kaç mumda doğru olduğu → hangi koşul bölgeyi engelliyor.
 */
function diag(dir: string, sym: string, from: string, kalibKey?: string) {
  const bars = yukle(path.join(ROOT, dir)).get(sym);
  if (!bars) throw new Error(`${dir}/${sym} önbellekte yok`);
  const h = bars.map((b) => b.high), l = bars.map((b) => b.low), c = bars.map((b) => b.close), v = bars.map((b) => b.volume);
  const rsi = wilderRSI(c, TV.rsi);
  const dmi = calculateADX(h, l, c, TV.di);
  const vx = calculateVortex(h, l, c, TV.vi);
  const obv = calculateOBV(c, v);
  const sma = calculateSMA(obv, TV.obvSma);
  const p = precompute(sym, bars, null)!;
  const tf: TF = dir.startsWith('1h') ? '1h' : '1d';
  const bpd = dir === '1h-us' ? 7 : CFG[tf].barsPerDay;
  const z = bolgeler(p, { tip: 'bolge', zone: CFG[tf].zone, rsiLow: RSI_LOW });
  const zS = bolgeler(p, { tip: 'sirali', zone: 5 * bpd, rsiLow: RSI_LOW });
  const trt = (key: string) => {
    if (key.length <= 10) return key;
    const d = new Date(`${key}:00Z`); d.setUTCHours(d.getUTCHours() + 3);
    return d.toISOString().slice(0, 16).replace('T', ' ');
  };
  const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—');

  if (kalibKey) {
    const i0 = bars.findIndex((b) => b.key === kalibKey);
    console.log(`\nKALİBRASYON (TRT saati · TradingView imleç değerleriyle karşılaştır)`);
    for (let i = Math.max(0, i0 - 2); i <= Math.min(bars.length - 1, i0 + 2) && i0 >= 0; i++) {
      console.log(`  ${trt(bars[i]!.key)} · kapanış ${f2(c[i]!)} · RSI ${f2(rsi[i]!)} · ADX ${f2(dmi.adx[i]!)} +DI ${f2(dmi.plusDi[i]!)} −DI ${f2(dmi.minusDi[i]!)} · VI+ ${(vx.viPlus[i] ?? NaN).toFixed(4)} VI− ${f2(vx.viMinus[i]!)} · OBV−SMA ${((obv[i]! - sma[i]!) / 1e6).toFixed(2)}M (${obv[i]! > sma[i]! ? 'yeşil' : 'kırmızı'})`);
    }
    if (i0 < 0) console.log(`  ${kalibKey} anahtarı bulunamadı`);
  }

  console.log(`\nGÜN GÜN (${from} → ) · sayılar = o gün koşulun doğru olduğu mum sayısı · bölge = son ${CFG[tf].zone} mum`);
  console.log('  gün          kapanış  RSImin RSImax | RSI≤30 ADX↓(−DI) VI+dip↑ OBVkesti↑ OBV↑altta | DİP-bölge TEPE-bölge | SIRALI-dip SIRALI-tepe');
  const gunler = new Map<string, number[]>();
  bars.forEach((b, i) => { const d = trt(b.key).slice(0, 10); if (d >= from) { const a = gunler.get(d); if (a) a.push(i); else gunler.set(d, [i]); } });
  for (const [d, idx] of gunler) {
    let rsiMin = Infinity, rsiMax = -Infinity, nR = 0, nA = 0, nV = 0, nOk = 0, nO = 0, nDip = 0, nTepe = 0, nSD = 0, nST = 0;
    for (const j of idx) {
      rsiMin = Math.min(rsiMin, rsi[j]!); rsiMax = Math.max(rsiMax, rsi[j]!);
      if (rsi[j]! <= RSI_LOW) nR++;
      if (p.lAdxDown[j] === j) nA++;
      if (p.lViUp[j] === j) nV++;
      let alttaydi = false;
      for (let k = j - OBV_CROSS_LOOK; k < j; k++) if (k >= 0 && obv[k]! <= sma[k]!) alttaydi = true;
      if (obv[j]! > sma[j]! && alttaydi) nOk++;
      if (p.lObvUp[j] === j) nO++;
      if (z.dip(j)) nDip++;
      if (z.tepe(j)) nTepe++;
      if (zS.dip(j)) nSD++;
      if (zS.tepe(j)) nST++;
    }
    const son = idx[idx.length - 1]!;
    console.log(`  ${d}  ${f2(c[son]!).padStart(8)}  ${f2(rsiMin).padStart(6)} ${f2(rsiMax).padStart(6)} | ${String(nR).padStart(6)} ${String(nA).padStart(9)} ${String(nV).padStart(7)} ${String(nOk).padStart(9)} ${String(nO).padStart(10)} | ${String(nDip).padStart(9)} ${String(nTepe).padStart(10)} | ${String(nSD).padStart(10)} ${String(nST).padStart(11)}`);
  }
}

const [mode, a1, a2] = process.argv.slice(2);
if (mode === 'diag' && a1 && a2) { diag(a1, a2, process.argv[5] ?? '2026-06-01', process.argv[6]); process.exit(0); }
if (mode === 'fetch') fetchAll(a1 === 'US' ? 'US' : 'BIST').catch((e) => { console.error('BAŞARISIZ:', e); process.exit(1); });
else if (mode === 'analyze' && (a1 === '1h' || a1 === '1d')) analyze(a1, a2 === 'US' ? 'US' : 'BIST');
else if (mode === 'trades' && a1 && a2) trades(a1, a2);
else console.log('kullanım: fetch | analyze 1h|1d | trades <klasör> <SEMBOL>');
