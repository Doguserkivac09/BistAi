/**
 * Dip giriş kurulumu — GERİYE DÖNÜK ÖLÇÜM (alfa iddiası; ölçülmeden yayınlanmaz).
 *
 * İDDİA (kullanıcı, VRT 1s grafiğinden): şu dört koşul AYNI ANDA hizalandığında
 * iyi bir giriş noktası oluşur; tam tersi hizalanma kâr alma bölgesidir.
 *   1. RSI dipte
 *   2. ADX zirve yapmış ve düşüyor (düşüş trendi güç kaybediyor)
 *   3. VI+ en dipte ve yükselişe başlamış
 *   4. OBV aşağılarda yeşile dönmüş (EMA'sının üstüne çıkmış)
 *
 * ⚠️ TANIMLAR SONUÇLARA BAKMADAN ÖNCE SABİTLENDİ (PRIMARY). Eşik ızgarası yalnız
 * SAĞLAMLIK içindir — "en iyi" varyant seçilip yayınlanmaz; seçilirse bu ölçüm
 * geçmişe uydurma (overfit) olur.
 *
 * ⚠️ ASIL KARŞILAŞTIRMA "tüm günler" DEĞİL, "RSI tek başına"dır. Dört koşulun
 * değeri, naif dip alımına (RSI ≤ 30 → al) göre ne kattığıdır. Taban oranı
 * geçip RSI'ı geçemeyen kurulum = üç gereksiz koşul.
 *
 * ⚠️ LOOK-AHEAD YOK: sinyal t kapanışında bilinenle üretilir, giriş t+1 AÇILIŞ.
 * Haftalık izin yalnız TAMAMLANMIŞ önceki haftadan okunur.
 *
 * ⚠️ BAĞIMSIZ DEĞİL: çöküş günlerinde onlarca hisse aynı gün tetiklenir. Karar
 * TARİH-KÜMELİ ortalamaya (önce gün içi ortalama, sonra günler arası) ve
 * tarihler üzerinden bootstrap güven aralığına göre verilir.
 *
 * ⚠️ BİLİNEN SINIRLAR: (a) survivorship — evren bugünkü semboller, işlemden
 * kalkanlar yok; (b) Yahoo BIST bedelsiz/bölünme düzeltmesini bazen kaçırır →
 * |günlük| > %25 hareket içeren pencereler ELENİR; (c) komisyon/kayma yok.
 *
 * ── SONUÇ (2026-09-11, günlük, 587 hisse, 486.697 hisse-gün, 2022-04 → 2026-08) ──
 * KÜME20 = XU100'e göre tarih-kümeli 20 günlük fazla getiri [95% GA]
 *   taban (tüm günler)            +0,7 [+0,5,+1,0]
 *   RSI≤30 tek başına             −2,1 [−3,1,−1,1]   ← naif dip alımı endeksin GERİSİNDE
 *   4'lü kurulum (aynı mum)       −3,6 [−7,2,−0,1]   n=70, RSI'dan da kötü
 *   RSI≤30 son 5 mum (bölge taban) −2,0 [−2,9,−1,1]
 *   4'lü BÖLGE                    −1,4 [−3,2,+0,5]   n=331, yılda hisse başı 0,17
 *     örneklem içi +0,1 (RSI −2,7) · örneklem DIŞI −1,9 (RSI −1,6) → üstünlük dışarıda KAYBOLUYOR
 *   haftalık izin: günlük RSI dibiyle haftalık yükseliş neredeyse hiç çakışmıyor (n=8)
 *   kâr alma aynası (4'lü bölge)  +1,7 [−0,1,+3,7]   ← sonrasında düşüş YOK, taban üstü
 * KARAR: ❌ YAYINLANMAZ — ne endeksi ne tabanı geçiyor; RSI'a üstünlüğü örneklem dışında yok.
 *
 * POST-HOC (F bölümü, yayın için DEĞİL): RSI≥70 + ADX zirve (+DI baskın) düşüyor +
 * VI+ tepeden dönüş → +3,9 [+2,4,+5,5], iki yarıda da pozitif (+2,5 / +4,9), her
 * yıl ≥0. Ama isabet ~%50, kötü %41-48 → ortalamayı sağ kuyruk taşıyor. Aynı veride
 * bulunduğu için kanıt değil; ancak önceden kayıtlı yeni bir ölçümle doğrulanabilir.
 *
 * Kullanım:
 *   npx tsx scripts/setup-backtest.ts fetch      # 5y günlük veri → disk önbelleği (tek sefer, ~12 dk)
 *   npx tsx scripts/setup-backtest.ts analyze    # ölçüm (ağ YOK, tekrar koşulabilir)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BIST_SYMBOLS } from '../types';
import { calculateADX, calculateEMA, calculateOBV, calculateRSI, calculateVortex } from '../lib/indicators';

const CACHE_DIR = process.env.SETUP_CACHE ?? path.join(os.tmpdir(), 'bistai-setup-backtest');
const INDEX = 'XU100';

const HORIZONS = [5, 10, 20] as const;
/** Aynı hissede tetikten sonra bu kadar mum yeni epizot sayılmaz. */
const COOLDOWN = 10;
/** 20 günlük medyan TL hacim eşiği — sığ hisselerde backtest gerçekçi değil. */
const MIN_TL_VOL = 5_000_000;
/** Bu büyüklükte tek günlük kapanış hareketi = muhtemel düzeltilmemiş kurumsal işlem. */
const GAP_LIMIT = 0.25;
/** Örneklem içi / dışı ayrımı (5 yılın yaklaşık ortası). */
const SPLIT_DATE = '2024-03-01';
const BAD_MAE = -0.10;
const GOOD_MFE = 0.10;

// ── PRIMARY tanım (sabit) ────────────────────────────────────────────────────
interface Params {
  rsiMax: number;        // RSI "dipte": son 3 mumun en düşüğü ≤ bu
  adxPeakMin: number;    // zirve anlamlı bir trend olmalı
  requireDownDi: boolean; // zirvede −DI > +DI (tükenen şey DÜŞÜŞ trendi)
  obvPosMax: number;     // OBV "aşağılarda": 60 mumluk aralıktaki konumu ≤ bu
  rsi: 'wilder' | 'cutler';
}
const PRIMARY: Params = { rsiMax: 30, adxPeakMin: 25, requireDownDi: true, obvPosMax: 0.4, rsi: 'wilder' };
// Pencere sabitleri (ızgaraya dahil değil):
const RSI_LOOK = 3;       // RSI dibi son 3 mum içinde
const ADX_LOOK = 10;      // ADX zirvesi son 10 mum içinde (pencere başında değil)
const VI_WIN = 20;        // VI+ "en dip" = son 20 mumun minimumu …
const VI_LOOK = 5;        // … ve bu minimum 1-5 mum önce
const OBV_EMA = 21;
const OBV_CROSS_LOOK = 3; // OBV EMA'yı son 3 mum içinde yukarı kesmiş
const OBV_RANGE = 60;

// ── Veri çekme ───────────────────────────────────────────────────────────────

interface Candle { date: string; open: number; high: number; low: number; close: number; volume: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchDaily(sym: string): Promise<Candle[]> {
  const ySym = `${sym}.IS`;
  let son: Error | null = null;
  for (const host of ['query1', 'query2']) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${ySym}?range=5y&interval=1d`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(30_000),
      });
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json() as any;
      const res = j?.chart?.result?.[0];
      const ts: number[] = res?.timestamp ?? [];
      const q = res?.indicators?.quote?.[0] ?? {};
      const out: Candle[] = [];
      for (let i = 0; i < ts.length; i++) {
        const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
        if (o == null || h == null || l == null || c == null || c <= 0) continue;
        out.push({ date: new Date(ts[i]! * 1000).toISOString().slice(0, 10), open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
      }
      return out;
    } catch (e) { son = e as Error; }
  }
  throw son ?? new Error('bilinmeyen hata');
}

async function fetchAll() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const semboller = [INDEX, ...Array.from(new Set(BIST_SYMBOLS as readonly string[]))];
  console.log(`önbellek: ${CACHE_DIR} · ${semboller.length} sembol`);
  let ardisikHata = 0, cekilen = 0, atlanan = 0, bos = 0;
  for (const [i, sym] of semboller.entries()) {
    const file = path.join(CACHE_DIR, `${sym}.json`);
    if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 24 * 3600_000) { atlanan++; continue; }
    try {
      const candles = await fetchDaily(sym);
      fs.writeFileSync(file, JSON.stringify(candles));
      if (candles.length === 0) bos++; else cekilen++;
      ardisikHata = 0;
    } catch (e) {
      ardisikHata++;
      console.log(`  ${sym} HATA: ${(e as Error).message}`);
      // Engelde ısrar etme (TEFAS dersi): art arda hata = dur.
      if (ardisikHata >= 8) {
        console.error('⛔ art arda 8 hata — DURULDU. Bir süre bekleyip tekrar koş (idempotent).');
        process.exitCode = 2;
        return;
      }
    }
    if ((i + 1) % 50 === 0) console.log(`[${i + 1}/${semboller.length}] çekilen ${cekilen} · boş ${bos} · önbellekte ${atlanan}`);
    await sleep(350 + Math.random() * 450);
  }
  console.log(`BİTTİ — çekilen ${cekilen} · boş ${bos} · önbellekte ${atlanan}`);
}

// ── Gösterge yardımcıları ────────────────────────────────────────────────────

/** Wilder RSI — TradingView/Matriks ile aynı. (lib'deki calculateRSI basit ortalamadır.) */
function wilderRSI(c: number[], p = 14): number[] {
  const out = new Array(c.length).fill(NaN);
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

function haftaAnahtari(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const gun = (d.getUTCDay() + 6) % 7; // Pzt = 0
  d.setUTCDate(d.getUTCDate() - gun);
  return d.toISOString().slice(0, 10);
}

function medyan(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

// ── Sembol başına ön hesap ───────────────────────────────────────────────────

interface Pre {
  sym: string;
  n: number;
  dates: string[];
  eligible: Uint8Array;
  rsiMinW: Float64Array; rsiMaxW: Float64Array; rsiMinC: Float64Array; rsiMaxC: Float64Array;
  adxTurn: Uint8Array; adxPeak: Float64Array; peakDownDi: Uint8Array; peakUpDi: Uint8Array;
  viUp: Uint8Array; viDown: Uint8Array;
  obvUp: Uint8Array; obvDown: Uint8Array; obvPos: Float64Array;
  gateTrend: Uint8Array; gateDi: Uint8Array;
  exc: Record<number, Float64Array>; ret20: Float64Array; mae: Float64Array; mfe: Float64Array;
}

function precompute(sym: string, cs: Candle[], idx: Map<string, { open: number; close: number }>, idxDates: string[]): Pre | null {
  const n = cs.length;
  if (n < 300) return null;
  const o = cs.map((x) => x.open), h = cs.map((x) => x.high), l = cs.map((x) => x.low), c = cs.map((x) => x.close), v = cs.map((x) => x.volume);
  const dates = cs.map((x) => x.date);

  const rsiW = wilderRSI(c);
  const rsiC = calculateRSI(c);
  const { plusDi, minusDi, adx } = calculateADX(h, l, c, 14);
  const { viPlus } = calculateVortex(h, l, c, 14);
  const obv = calculateOBV(c, v);
  const obvEma = calculateEMA(obv, OBV_EMA);

  // Haftalık mumlar (izin katmanı)
  const wkOf = new Int32Array(n);
  const wC: number[] = [], wH: number[] = [], wL: number[] = [];
  let sonAnahtar = '';
  for (let i = 0; i < n; i++) {
    const k = haftaAnahtari(dates[i]!);
    if (k !== sonAnahtar) { wC.push(c[i]!); wH.push(h[i]!); wL.push(l[i]!); sonAnahtar = k; }
    const w = wC.length - 1;
    wC[w] = c[i]!; wH[w] = Math.max(wH[w]!, h[i]!); wL[w] = Math.min(wL[w]!, l[i]!);
    wkOf[i] = w;
  }
  const wEma = calculateEMA(wC, 20);
  const wAdx = calculateADX(wH, wL, wC, 14);

  const pre: Pre = {
    sym, n, dates,
    eligible: new Uint8Array(n),
    rsiMinW: new Float64Array(n).fill(NaN), rsiMaxW: new Float64Array(n).fill(NaN),
    rsiMinC: new Float64Array(n).fill(NaN), rsiMaxC: new Float64Array(n).fill(NaN),
    adxTurn: new Uint8Array(n), adxPeak: new Float64Array(n).fill(NaN), peakDownDi: new Uint8Array(n), peakUpDi: new Uint8Array(n),
    viUp: new Uint8Array(n), viDown: new Uint8Array(n),
    obvUp: new Uint8Array(n), obvDown: new Uint8Array(n), obvPos: new Float64Array(n).fill(NaN),
    gateTrend: new Uint8Array(n), gateDi: new Uint8Array(n),
    exc: { 5: new Float64Array(n).fill(NaN), 10: new Float64Array(n).fill(NaN), 20: new Float64Array(n).fill(NaN) },
    ret20: new Float64Array(n).fill(NaN), mae: new Float64Array(n).fill(NaN), mfe: new Float64Array(n).fill(NaN),
  };

  // Kurumsal işlem kirliliği (prefix sum)
  const gapPref = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) gapPref[i + 1] = gapPref[i]! + (i > 0 && Math.abs(c[i]! / c[i - 1]! - 1) > GAP_LIMIT ? 1 : 0);

  const tlVol = c.map((x, i) => x * v[i]!);
  const idxPos = new Map(idxDates.map((d, i) => [d, i]));

  for (let t = 60; t < n; t++) {
    // RSI pencereleri
    let mnW = Infinity, mxW = -Infinity, mnC = Infinity, mxC = -Infinity;
    for (let j = t - RSI_LOOK + 1; j <= t; j++) {
      mnW = Math.min(mnW, rsiW[j]!); mxW = Math.max(mxW, rsiW[j]!);
      mnC = Math.min(mnC, rsiC[j]!); mxC = Math.max(mxC, rsiC[j]!);
    }
    pre.rsiMinW[t] = mnW; pre.rsiMaxW[t] = mxW; pre.rsiMinC[t] = mnC; pre.rsiMaxC[t] = mxC;

    // ADX: zirve son ADX_LOOK içinde (pencere başında değil, bugün değil) ve düşüyor
    if (Number.isFinite(adx[t - ADX_LOOK]) && Number.isFinite(adx[t])) {
      let pIdx = t - ADX_LOOK;
      for (let j = t - ADX_LOOK; j <= t; j++) if (adx[j]! > adx[pIdx]!) pIdx = j;
      if (pIdx > t - ADX_LOOK && pIdx < t && adx[t]! < adx[t - 1]!) {
        pre.adxTurn[t] = 1;
        pre.adxPeak[t] = adx[pIdx]!;
        pre.peakDownDi[t] = minusDi[pIdx]! > plusDi[pIdx]! ? 1 : 0;
        pre.peakUpDi[t] = plusDi[pIdx]! > minusDi[pIdx]! ? 1 : 0;
      }
    }

    // VI+: son VI_WIN mumun dibi 1..VI_LOOK mum önce + yükseliyor (ayna: tepe + düşüyor)
    if (Number.isFinite(viPlus[t - VI_WIN + 1])) {
      let mnI = t - VI_WIN + 1, mxI = mnI;
      for (let j = t - VI_WIN + 1; j <= t; j++) {
        if (viPlus[j]! < viPlus[mnI]!) mnI = j;
        if (viPlus[j]! > viPlus[mxI]!) mxI = j;
      }
      const dMin = t - mnI, dMax = t - mxI;
      if (dMin >= 1 && dMin <= VI_LOOK && viPlus[t]! > viPlus[t - 1]!) pre.viUp[t] = 1;
      if (dMax >= 1 && dMax <= VI_LOOK && viPlus[t]! < viPlus[t - 1]!) pre.viDown[t] = 1;
    }

    // OBV: EMA'yı son OBV_CROSS_LOOK içinde kesmiş + 60 mumluk aralıktaki konum
    let altta = false, ustte = false;
    for (let j = t - OBV_CROSS_LOOK; j < t; j++) { if (obv[j]! <= obvEma[j]!) altta = true; if (obv[j]! >= obvEma[j]!) ustte = true; }
    if (obv[t]! > obvEma[t]! && altta) pre.obvUp[t] = 1;
    if (obv[t]! < obvEma[t]! && ustte) pre.obvDown[t] = 1;
    let oMn = Infinity, oMx = -Infinity;
    for (let j = t - OBV_RANGE + 1; j <= t; j++) { oMn = Math.min(oMn, obv[j]!); oMx = Math.max(oMx, obv[j]!); }
    if (oMx > oMn) pre.obvPos[t] = (obv[t]! - oMn) / (oMx - oMn);

    // Haftalık izin — yalnız TAMAMLANMIŞ önceki hafta
    const pw = wkOf[t]! - 1;
    if (pw >= 20 && wC[pw]! > wEma[pw]!) pre.gateTrend[t] = 1;
    if (pw >= 28 && wAdx.plusDi[pw]! > wAdx.minusDi[pw]!) pre.gateDi[t] = 1;

    // Uygunluk + sonuçlar
    if (t < 150 || t + 20 >= n) continue;
    if (medyan(tlVol.slice(t - 19, t + 1)) < MIN_TL_VOL) continue;
    if (gapPref[Math.min(n, t + 22)]! - gapPref[Math.max(0, t - 60)]! > 0) continue;
    const giris = o[t + 1]!;
    if (!(giris > 0)) continue;
    const it = idxPos.get(dates[t]!);
    if (it == null) continue;
    let tamam = true;
    for (const hz of HORIZONS) {
      const ix0 = idx.get(dates[t + 1]!), ixH = idx.get(dates[t + hz]!);
      if (!ix0 || !ixH) { tamam = false; break; }
      const idxGiris = ix0.open > 0 ? ix0.open : idx.get(dates[t]!)!.close;
      pre.exc[hz]![t] = (c[t + hz]! / giris - 1) - (ixH.close / idxGiris - 1);
    }
    if (!tamam) continue;
    let mn = Infinity, mx = -Infinity;
    for (let j = t + 1; j <= t + 20; j++) { mn = Math.min(mn, l[j]!); mx = Math.max(mx, h[j]!); }
    pre.ret20[t] = c[t + 20]! / giris - 1;
    pre.mae[t] = mn / giris - 1;
    pre.mfe[t] = mx / giris - 1;
    pre.eligible[t] = 1;
  }
  return pre;
}

// ── Sinyal tanımları ─────────────────────────────────────────────────────────

type Pred = (p: Pre, t: number) => boolean;

const rsiDip = (P: Params): Pred => (p, t) => (P.rsi === 'wilder' ? p.rsiMinW[t]! : p.rsiMinC[t]!) <= P.rsiMax;
const rsiTepe = (P: Params): Pred => (p, t) => (P.rsi === 'wilder' ? p.rsiMaxW[t]! : p.rsiMaxC[t]!) >= 100 - P.rsiMax;
const adxDusus = (P: Params): Pred => (p, t) => p.adxTurn[t] === 1 && p.adxPeak[t]! >= P.adxPeakMin && (!P.requireDownDi || p.peakDownDi[t] === 1);
const adxYukselis = (P: Params): Pred => (p, t) => p.adxTurn[t] === 1 && p.adxPeak[t]! >= P.adxPeakMin && (!P.requireDownDi || p.peakUpDi[t] === 1);
const viDip: Pred = (p, t) => p.viUp[t] === 1;
const viTepe: Pred = (p, t) => p.viDown[t] === 1;
const obvDip = (P: Params): Pred => (p, t) => p.obvUp[t] === 1 && p.obvPos[t]! <= P.obvPosMax;
const obvTepe = (P: Params): Pred => (p, t) => p.obvDown[t] === 1 && p.obvPos[t]! >= 1 - P.obvPosMax;
const hepsi = (...ps: Pred[]): Pred => (p, t) => ps.every((f) => f(p, t));
const kurulum = (P: Params): Pred => hepsi(rsiDip(P), adxDusus(P), viDip, obvDip(P));
const cikisKurulumu = (P: Params): Pred => hepsi(rsiTepe(P), adxYukselis(P), viTepe, obvTepe(P));

/**
 * BÖLGE tanımı (ek, PRIMARY'yi silmez). Kısmi veride "aynı mum" tanımı hisse
 * başına yılda ~0,02 tetik verdi — ölçülemeyecek kadar seyrek. Kullanıcının
 * grafiğindeki kırmızı alanlar da tek mum değil bölgedir: koşullar ARDIŞIK gelir
 * (önce RSI dibi, sonra ADX dönüşü, sonra VI+/OBV). Karar SIKLIĞA bakılarak
 * verildi, getiriye değil. Adil kıyas için taban da "son ZONE mumda RSI dibi".
 */
const ZONE = 5;
const pencerede = (f: Pred, z = ZONE): Pred => (p, t) => {
  for (let j = Math.max(0, t - z + 1); j <= t; j++) if (f(p, j)) return true;
  return false;
};
const bolge = (P: Params): Pred => hepsi(pencerede(rsiDip(P)), pencerede(adxDusus(P)), pencerede(viDip), pencerede(obvDip(P)));
const cikisBolgesi = (P: Params): Pred => hepsi(pencerede(rsiTepe(P)), pencerede(adxYukselis(P)), pencerede(viTepe), pencerede(obvTepe(P)));

interface Obs { date: string; e5: number; e10: number; e20: number; r20: number; mae: number; mfe: number }

function epizotlar(pres: Pre[], pred: Pred | null, filtre?: (d: string) => boolean): Obs[] {
  const out: Obs[] = [];
  for (const p of pres) {
    let son = -Infinity;
    for (let t = 0; t < p.n; t++) {
      if (!p.eligible[t]) continue;
      if (filtre && !filtre(p.dates[t]!)) continue;
      if (pred) {
        if (!pred(p, t)) continue;
        if (t - son < COOLDOWN) continue;
        son = t;
      }
      out.push({ date: p.dates[t]!, e5: p.exc[5]![t]!, e10: p.exc[10]![t]!, e20: p.exc[20]![t]!, r20: p.ret20[t]!, mae: p.mae[t]!, mfe: p.mfe[t]! });
    }
  }
  return out;
}

// ── İstatistik ───────────────────────────────────────────────────────────────

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

interface Stat { n: number; tarih: number; e5: number; e10: number; e20: number; med20: number; kume20: number; ciLo: number; ciHi: number; isabet: number; kotu: number; iyi: number; r20: number }

function istat(obs: Obs[]): Stat | null {
  if (obs.length === 0) return null;
  const ort = (f: (o: Obs) => number) => obs.reduce((a, o) => a + f(o), 0) / obs.length;
  const gunler = new Map<string, number[]>();
  for (const o of obs) { const a = gunler.get(o.date); if (a) a.push(o.e20); else gunler.set(o.date, [o.e20]); }
  const gunOrt = [...gunler.values()].map((a) => a.reduce((x, y) => x + y, 0) / a.length);
  const kume = gunOrt.reduce((a, b) => a + b, 0) / gunOrt.length;
  const r = rng(42);
  const boots: number[] = [];
  for (let b = 0; b < 1000; b++) {
    let s = 0;
    for (let k = 0; k < gunOrt.length; k++) s += gunOrt[Math.floor(r() * gunOrt.length)]!;
    boots.push(s / gunOrt.length);
  }
  boots.sort((x, y) => x - y);
  return {
    n: obs.length, tarih: gunler.size,
    e5: ort((o) => o.e5), e10: ort((o) => o.e10), e20: ort((o) => o.e20),
    med20: medyan(obs.map((o) => o.e20)),
    kume20: kume, ciLo: boots[25]!, ciHi: boots[974]!,
    isabet: obs.filter((o) => o.e20 > 0).length / obs.length,
    kotu: obs.filter((o) => o.mae <= BAD_MAE).length / obs.length,
    iyi: obs.filter((o) => o.mfe >= GOOD_MFE).length / obs.length,
    r20: ort((o) => o.r20),
  };
}

const pct = (x: number, d = 1) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(d)}`;

function satir(ad: string, s: Stat | null): string {
  if (!s) return `${ad.padEnd(34)} — tetiklenmedi`;
  return [
    ad.padEnd(34),
    String(s.n).padStart(6), String(s.tarih).padStart(5),
    pct(s.e5).padStart(6), pct(s.e10).padStart(6), pct(s.e20).padStart(6),
    pct(s.kume20).padStart(6), `[${pct(s.ciLo)},${pct(s.ciHi)}]`.padStart(15),
    `${(s.isabet * 100).toFixed(0)}%`.padStart(5),
    `${(s.kotu * 100).toFixed(0)}%`.padStart(5), `${(s.iyi * 100).toFixed(0)}%`.padStart(5),
    pct(s.r20).padStart(6),
  ].join(' ');
}

const BASLIK = [
  'grup'.padEnd(34), 'epizot'.padStart(6), 'tarih'.padStart(5),
  'XS5%'.padStart(6), 'XS10%'.padStart(6), 'XS20%'.padStart(6),
  'KÜME20'.padStart(6), '95% GA'.padStart(15), 'isbt'.padStart(5), 'kötü'.padStart(5), 'iyi'.padStart(5), 'ham20'.padStart(6),
].join(' ');

// ── Analiz ───────────────────────────────────────────────────────────────────

function analyze() {
  const idxCs: Candle[] = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, `${INDEX}.json`), 'utf8'));
  const idx = new Map(idxCs.map((x) => [x.date, { open: x.open, close: x.close }]));
  const idxDates = idxCs.map((x) => x.date);

  const pres: Pre[] = [];
  let okunan = 0;
  for (const f of fs.readdirSync(CACHE_DIR)) {
    if (!f.endsWith('.json') || f === `${INDEX}.json`) continue;
    const cs: Candle[] = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, f), 'utf8'));
    okunan++;
    const p = precompute(f.replace('.json', ''), cs, idx, idxDates);
    if (p) pres.push(p);
  }
  const uygunGun = pres.reduce((a, p) => a + p.eligible.reduce((x, y) => x + y, 0), 0);
  console.log(`\nokunan ${okunan} sembol · ölçülen ${pres.length} · uygun hisse-gün ${uygunGun.toLocaleString('tr-TR')}`);
  console.log(`dönem ${idxDates[150]} → ${idxDates[idxDates.length - 21]} · giriş t+1 açılış · XS = XU100'e göre fazla getiri`);
  console.log(`KÜME20 = tarih-kümeli 20g fazla getiri (karar ölçütü) · kötü = 20g içinde ≤%${BAD_MAE * 100} dip · iyi = ≥+%${GOOD_MFE * 100} tepe\n`);

  const P = PRIMARY;
  const ep = (pred: Pred | null, filtre?: (d: string) => boolean) => istat(epizotlar(pres, pred, filtre));
  const siklik = (s: Stat | null) => s ? `${(s.n / (uygunGun / 252) * pres.length / pres.length).toFixed(3)}` : '—';

  console.log('═══ A. DİP GİRİŞ KURULUMU (PRIMARY: RSI≤30 · ADX zirve≥25 −DI baskın düşüyor · VI+ dipten dönüş · OBV alt %40\'ta EMA21 üstü) ═══');
  console.log(BASLIK);
  const taban = ep(null);
  const rsiTek = ep(rsiDip(P));
  const S = ep(kurulum(P));
  const satirlar: Array<[string, Stat | null]> = [
    ['taban: tüm uygun günler', taban],
    ['RSI≤30 tek başına (naif dip)', rsiTek],
    ['RSI + ADX', ep(hepsi(rsiDip(P), adxDusus(P)))],
    ['RSI + VI+', ep(hepsi(rsiDip(P), viDip))],
    ['RSI + OBV', ep(hepsi(rsiDip(P), obvDip(P)))],
    ['RSI + ADX + VI+', ep(hepsi(rsiDip(P), adxDusus(P), viDip))],
    ['★ 4\'lü KURULUM', S],
    ['★ kurulum + haftalık trend izni', ep(hepsi(kurulum(P), (p, t) => p.gateTrend[t] === 1))],
    ['★ kurulum + haftalık DI izni', ep(hepsi(kurulum(P), (p, t) => p.gateDi[t] === 1))],
    ['kurulum, haftalık trend AYKIRI', ep(hepsi(kurulum(P), (p, t) => p.gateTrend[t] === 0))],
    ['RSI≤30 ama kurulum YOK', ep(hepsi(rsiDip(P), (p, t) => !kurulum(P)(p, t)))],
    ['kurulum, −DI şartı olmadan', ep(kurulum({ ...P, requireDownDi: false }))],
    ['kurulum, lib RSI (Cutler)', ep(kurulum({ ...P, rsi: 'cutler' }))],
    ['RSI≤30 tek, lib RSI (Cutler)', ep(rsiDip({ ...P, rsi: 'cutler' }))],
    ['ADX+VI+OBV (RSI şartı YOK)', ep(hepsi(adxDusus(P), viDip, obvDip(P)))],
    ['── BÖLGE (her koşul son 5 mumda) ──', null],
    ['RSI≤30 son 5 mumda (bölge tabanı)', ep(pencerede(rsiDip(P)))],
    ['RSI + ADX bölge', ep(hepsi(pencerede(rsiDip(P)), pencerede(adxDusus(P))))],
    ['RSI + VI+ bölge', ep(hepsi(pencerede(rsiDip(P)), pencerede(viDip)))],
    ['RSI + OBV bölge', ep(hepsi(pencerede(rsiDip(P)), pencerede(obvDip(P))))],
    ['◆ 4\'lü BÖLGE', ep(bolge(P))],
    ['◆ bölge + haftalık trend izni', ep(hepsi(bolge(P), (p, t) => p.gateTrend[t] === 1))],
    ['◆ bölge + haftalık DI izni', ep(hepsi(bolge(P), (p, t) => p.gateDi[t] === 1))],
    ['bölge, haftalık trend AYKIRI', ep(hepsi(bolge(P), (p, t) => p.gateTrend[t] === 0))],
    ['RSI bölge ama 4\'lü bölge YOK', ep(hepsi(pencerede(rsiDip(P)), (p, t) => !bolge(P)(p, t)))],
    ['bölge, −DI şartı olmadan', ep(bolge({ ...P, requireDownDi: false }))],
    ['bölge, lib RSI (Cutler)', ep(bolge({ ...P, rsi: 'cutler' }))],
  ];
  for (const [ad, s] of satirlar) console.log(ad.startsWith('──') ? ad : satir(ad, s));
  const B = ep(bolge(P));
  const hy = uygunGun / 252;
  console.log(`\nsıklık (hisse başına yılda) — 4'lü mum: ${S ? (S.n / hy).toFixed(2) : '—'} · 4'lü bölge: ${B ? (B.n / hy).toFixed(2) : '—'} · RSI tek: ${rsiTek ? (rsiTek.n / hy).toFixed(2) : '—'} (uygun hisse-yıl ${hy.toFixed(0)})`);
  void siklik;

  console.log('\n═══ B. YIL YIL (KÜME20 · epizot) ═══');
  const yillar = [...new Set(idxDates.map((d) => d.slice(0, 4)))];
  const yilGruplar: Array<[string, Pred | null]> = [
    ['taban', null], ['RSI tek', rsiDip(P)], ['4\'lü kurulum', kurulum(P)],
    ['RSI bölge tabanı', pencerede(rsiDip(P))], ['4\'lü bölge', bolge(P)],
    ['bölge+hft trend', hepsi(bolge(P), (p, t) => p.gateTrend[t] === 1)],
  ];
  console.log('grup'.padEnd(20) + yillar.map((y) => y.padStart(16)).join(''));
  for (const [ad, pred] of yilGruplar) {
    console.log(ad.padEnd(20) + yillar.map((y) => {
      const s = ep(pred, (d) => d.startsWith(y));
      return (s ? `${pct(s.kume20)} (${s.n})` : '—').padStart(16);
    }).join(''));
  }

  console.log(`\n═══ C. ÖRNEKLEM İÇİ / DIŞI (ayrım ${SPLIT_DATE}) ═══`);
  console.log(BASLIK);
  for (const [etiket, f] of [['İÇİ', (d: string) => d < SPLIT_DATE], ['DIŞI', (d: string) => d >= SPLIT_DATE]] as const) {
    console.log(satir(`${etiket} taban`, ep(null, f)));
    console.log(satir(`${etiket} RSI tek`, ep(rsiDip(P), f)));
    console.log(satir(`${etiket} 4'lü kurulum`, ep(kurulum(P), f)));
    console.log(satir(`${etiket} RSI bölge tabanı`, ep(pencerede(rsiDip(P)), f)));
    console.log(satir(`${etiket} 4'lü bölge`, ep(bolge(P), f)));
    console.log(satir(`${etiket} bölge + hft trend`, ep(hepsi(bolge(P), (p, t) => p.gateTrend[t] === 1), f)));
  }

  console.log('\n═══ D. SAĞLAMLIK IZGARASI (36 varyant · seçim için DEĞİL) ═══');
  console.log('rsi adx obvPos −DI |  n kurulum  KÜME20 | n RSI  KÜME20 | fark');
  let pozitif = 0, toplam = 0;
  const farklar: number[] = [];
  for (const rsiMax of [25, 30, 35]) for (const adxPeakMin of [20, 25, 30]) for (const obvPosMax of [0.3, 0.5]) for (const requireDownDi of [true, false]) {
    const V: Params = { ...P, rsiMax, adxPeakMin, obvPosMax, requireDownDi };
    // Izgara BÖLGE tanımıyla koşar (mum tanımı çoğu varyantta n<30 kalır).
    const s = ep(bolge(V));
    const b = ep(pencerede(rsiDip(V)));
    if (!s || !b || s.n < 30) {
      console.log(`${String(rsiMax).padStart(3)} ${String(adxPeakMin).padStart(3)} ${obvPosMax.toFixed(1).padStart(6)} ${requireDownDi ? ' ✓ ' : ' – '} | yetersiz (n=${s?.n ?? 0})`);
      continue;
    }
    toplam++;
    const fark = s.kume20 - b.kume20;
    farklar.push(fark);
    if (fark > 0) pozitif++;
    console.log(`${String(rsiMax).padStart(3)} ${String(adxPeakMin).padStart(3)} ${obvPosMax.toFixed(1).padStart(6)} ${requireDownDi ? ' ✓ ' : ' – '} | ${String(s.n).padStart(10)} ${pct(s.kume20).padStart(7)} | ${String(b.n).padStart(5)} ${pct(b.kume20).padStart(7)} | ${pct(fark).padStart(6)}`);
  }
  if (toplam) console.log(`→ 4'lü bölge, RSI bölge tabanını ${toplam} varyantın ${pozitif}'inde geçti · medyan fark ${pct(medyan(farklar))} puan`);

  console.log('\n═══ E. KÂR ALMA (AYNA) KURULUMU — işe yarıyorsa sonrası TABANDAN KÖTÜ olmalı ═══');
  console.log(BASLIK);
  console.log(satir('taban: tüm uygun günler', taban));
  console.log(satir('RSI≥70 tek başına', ep(rsiTepe(P))));
  console.log(satir('RSI + ADX(+DI baskın) + VI+ tepe', ep(hepsi(rsiTepe(P), adxYukselis(P), viTepe))));
  console.log(satir('★ 4\'lü çıkış kurulumu', ep(cikisKurulumu(P))));
  console.log(satir('çıkış kurulumu, +DI şartı yok', ep(cikisKurulumu({ ...P, requireDownDi: false }))));
  console.log(satir('RSI≥70 son 5 mumda (bölge tabanı)', ep(pencerede(rsiTepe(P)))));
  console.log(satir('◆ 4\'lü çıkış BÖLGESİ', ep(cikisBolgesi(P))));
  console.log(satir('çıkış bölgesi, +DI şartı yok', ep(cikisBolgesi({ ...P, requireDownDi: false }))));

  // ⚠️ POST-HOC: bu grup E bölümünün sonuçlarına BAKILDIKTAN sonra fark edildi
  // (kâr alma sanılan hizalanmanın ardından fiyat DÜŞMEYİP endeksi geçiyordu).
  // Aynı veride bulunan desen aynı veride kanıtlanamaz — burada yalnız "iki
  // yarıda ve yıllarda ayakta mı" bakılır; yayın ancak ÖNCEDEN kayıtlı yeni bir
  // ölçümle (farklı dönem / zaman dilimi) olur.
  console.log('\n═══ F. POST-HOC HİPOTEZ — trend devamı (YAYIN İÇİN DEĞİL) ═══');
  const devam = hepsi(rsiTepe(P), adxYukselis(P), viTepe);
  console.log(BASLIK);
  console.log(satir('tüm dönem', ep(devam)));
  console.log(satir('İÇİ (< 2024-03)', ep(devam, (d) => d < SPLIT_DATE)));
  console.log(satir('DIŞI (≥ 2024-03)', ep(devam, (d) => d >= SPLIT_DATE)));
  console.log(satir('DIŞI taban', ep(null, (d) => d >= SPLIT_DATE)));
  console.log(satir('DIŞI RSI≥70 tek', ep(rsiTepe(P), (d) => d >= SPLIT_DATE)));
  for (const y of yillar) console.log(satir(`yıl ${y}`, ep(devam, (d) => d.startsWith(y))));
}

const mode = process.argv[2];
if (mode === 'fetch') fetchAll().catch((e) => { console.error('BAŞARISIZ:', e); process.exit(1); });
else if (mode === 'analyze') analyze();
else console.log('kullanım: npx tsx scripts/setup-backtest.ts fetch|analyze');
