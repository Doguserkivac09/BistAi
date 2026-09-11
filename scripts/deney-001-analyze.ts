/**
 * DENEY-001 — analiz. Spesifikasyon: DENEY-001-CONFLUENCE-IC.md (kilit 267a17e).
 * Bu betik spesifikasyonu UYGULAR; hiçbir eşik/ufuk/dönem burada seçilmez.
 *
 * Uygulama ayrıntıları (spesifikasyonun tanımlamadığı, sonuca bakmadan sabitlenen):
 *  - Aday hisse-gün: t ≥ 251, t+21 ≤ n−1 (tüm ufuklar + temizlik penceresi hesaplanabilir)
 *  - Evren < 20 hisse olan günler IC hesabına girmez
 *  - Skor vektörü sabitse (o gün hiç sinyal yok) IC tanımsız → o gün atlanır (sayısı raporlanır)
 *  - Bariyer portföyü: eşit skorda 20g ortalama TL hacmi yüksek olan önce; tavan elemesinden
 *    SONRA 5'ten az hisse kalırsa dönem nakit
 *
 *   npx tsx scripts/deney-001-analyze.ts <önbellek> <panel> <çıktı-klasörü>
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { calculateRSIWilder } from '../lib/indicators';

const [CACHE, PANEL, OUT] = process.argv.slice(2);
/** Kilitli değer 20. Ortam değişkeni YALNIZ küçük hata ayıklama setinde kod yolunu çalıştırmak içindir. */
const MIN_EVREN = Number(process.env.DENEY_DEBUG_MIN_EVREN ?? 20);
if (!CACHE || !PANEL || !OUT) { console.error('kullanım: <önbellek> <panel> <çıktı>'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

// ── computeConfluence birebir kopyası (lib/signals.ts) — parite kontrolüyle doğrulanır ──
const CAT: Record<string, string> = {
  'RSI Uyumsuzluğu': 'momentum', 'RSI Seviyesi': 'momentum', 'MACD Kesişimi': 'trend', 'Trend Başlangıcı': 'trend',
  'Altın Çapraz': 'trend', 'Hacim Anomalisi': 'hacim', 'Para Akışı Uyumsuzluğu': 'hacim', 'Vortex Kesişimi': 'trend',
  'Destek/Direnç Kırılımı': 'yapı', 'Bollinger Sıkışması': 'yapı', 'Higher Lows': 'yapı',
  'Altın Çapraz Yaklaşıyor': 'trend', 'Trend Olgunlaşıyor': 'trend', 'Direnç Testi': 'yapı', 'MACD Daralıyor': 'trend',
  'Çift Dip': 'formasyon', 'Çift Tepe': 'formasyon', 'Bull Flag': 'formasyon', 'Bear Flag': 'formasyon',
  'Cup & Handle': 'formasyon', 'Ters Omuz-Baş-Omuz': 'formasyon', 'Yükselen Üçgen': 'formasyon',
};
const SEV: Record<string, number> = { güçlü: 35, orta: 22, zayıf: 12 };
const REL: Record<string, number> = {
  'RSI Uyumsuzluğu': 1.35, 'Trend Olgunlaşıyor': 0.40, 'MACD Daralıyor': 0.45,
  'Altın Çapraz Yaklaşıyor': 0.40, 'Yükselen Üçgen': 0.45, 'Hacim Anomalisi': 0.70,
};
const AILELER = ['momentum', 'trend', 'hacim', 'yapı', 'formasyon'];

type Sig = [string, string, string];
interface Kapali { sayi?: boolean; siddet?: boolean; tip?: boolean; uyum?: boolean; celiski?: boolean; kategori?: boolean }

function confluence(sigs: Sig[], k: Kapali = {}): { score: number; dom: string; domN: number } {
  const bull = sigs.filter((s) => s[1] === 'yukari');
  const bear = sigs.filter((s) => s[1] === 'asagi');
  const dom = bull.length > bear.length ? 'yukari' : bear.length > bull.length ? 'asagi' : bull.length > 0 ? 'yukari' : 'nötr';
  const domSigs = dom === 'yukari' ? bull : dom === 'asagi' ? bear : sigs;
  const conflicting = sigs.filter((s) => s[1] !== dom && s[1] !== 'nötr');
  const puan = (s: Sig) => (k.siddet ? 22 : (SEV[s[2]] ?? 12)) * (k.tip ? 1 : (REL[s[0]] ?? 1));
  let score = k.sayi ? Math.max(0, ...domSigs.map(puan)) : domSigs.reduce((a, s) => a + puan(s), 0);
  score = Math.min(80, score);
  if (conflicting.length === 0) {
    if (!k.uyum) score += sigs.length >= 2 ? 18 : 8;
  } else if (!k.celiski) {
    score -= conflicting.reduce((a, s) => a + (s[2] === 'güçlü' ? 10 : s[2] === 'orta' ? 6 : 3), 0);
  }
  if (!k.kategori) {
    const cats = new Set(domSigs.map((s) => CAT[s[0]] ?? 'diğer'));
    score += Math.min(22, (cats.size - 1) * 7);
  }
  return { score: Math.max(0, Math.min(100, Math.round(score))), dom, domN: domSigs.length };
}
const isaret = (dom: string) => (dom === 'yukari' ? 1 : dom === 'asagi' ? -1 : 0);

const SKOR_ADLARI = ['TAM', '−SAYI', '−ŞİDDET', '−TİP AĞIRLIĞI', '−UYUM', '−ÇELİŞKİ', '−KATEGORİ', 'KABA-1', 'KABA-2'] as const;
const KAPALI: Kapali[] = [{}, { sayi: true }, { siddet: true }, { tip: true }, { uyum: true }, { celiski: true }, { kategori: true }];
const NS = SKOR_ADLARI.length;
const BASE_ADLARI = ['MOM3A', 'MOM20', 'REV1H', 'RSI', 'RASTGELE'] as const;

// ── Yardımcılar ──
function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
function pctRank(v: Float64Array): Float64Array {
  const n = v.length; const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a]! - v[b]!);
  const r = new Float64Array(n);
  let i = 0;
  while (i < n) { let j = i; while (j + 1 < n && v[idx[j + 1]!] === v[idx[i]!]) j++; const avg = (i + j) / 2; for (let k = i; k <= j; k++) r[idx[k]!] = n > 1 ? avg / (n - 1) : 0.5; i = j + 1; }
  return r;
}
function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length; let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a[i]!; sb += b[i]!; }
  const ma = sa / n, mb = sb / n; let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const da = a[i]! - ma, db = b[i]! - mb; cov += da * db; va += da * da; vb += db * db; }
  return va > 1e-12 && vb > 1e-12 ? cov / Math.sqrt(va * vb) : NaN;
}
function resid1(y: ArrayLike<number>, x: ArrayLike<number>): Float64Array {
  const n = y.length; let sx = 0, sy = 0; for (let i = 0; i < n; i++) { sx += x[i]!; sy += y[i]!; }
  const mx = sx / n, my = sy / n; let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i]! - mx) * (y[i]! - my); sxx += (x[i]! - mx) ** 2; }
  const b = sxx > 1e-12 ? sxy / sxx : 0; const a = my - b * mx;
  const e = new Float64Array(n); for (let i = 0; i < n; i++) e[i] = y[i]! - (a + b * x[i]!); return e;
}
function residK(y: ArrayLike<number>, xs: ArrayLike<number>[]): Float64Array {
  const n = y.length, p = xs.length + 1;
  const X = (i: number, j: number) => (j === 0 ? 1 : xs[j - 1]![i]!);
  const A = Array.from({ length: p }, () => new Float64Array(p + 1));
  for (let i = 0; i < n; i++) for (let r = 0; r < p; r++) { const xr = X(i, r); for (let c = 0; c < p; c++) A[r]![c] += xr * X(i, c); A[r]![p] += xr * y[i]!; }
  for (let c = 0; c < p; c++) { let piv = c; for (let r = c + 1; r < p; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r; [A[c], A[piv]] = [A[piv]!, A[c]!]; const d = A[c]![c]!; if (Math.abs(d) < 1e-12) continue; for (let r = 0; r < p; r++) { if (r === c) continue; const f = A[r]![c]! / d; for (let k = c; k <= p; k++) A[r]![k] -= f * A[c]![k]!; } }
  const beta = A.map((row, i) => (Math.abs(row[i]!) > 1e-12 ? row[p]! / row[i]! : 0));
  const e = new Float64Array(n); for (let i = 0; i < n; i++) { let f = 0; for (let j = 0; j < p; j++) f += beta[j]! * X(i, j); e[i] = y[i]! - f; } return e;
}
const ort = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const medyan = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
function blokBootstrap(x: number[], seed: number, B = 2000, blok = 20): [number, number] {
  const n = x.length; if (n < blok * 2) return [NaN, NaN];
  const r = rng(seed); const means: number[] = [];
  for (let b = 0; b < B; b++) { let s = 0, c = 0; while (c < n) { const st = Math.floor(r() * (n - blok + 1)); for (let k = 0; k < blok && c < n; k++, c++) s += x[st + k]!; } means.push(s / n); }
  means.sort((a, b) => a - b); return [means[Math.floor(B * 0.025)]!, means[Math.floor(B * 0.975) - 1]!];
}

// ── Veri yükleme ──
interface Mum { date: string; open: number; high: number; low: number; close: number; volume: number }
function mumlar(f: string): Mum[] {
  const m = new Map<string, Mum>();
  for (const c of JSON.parse(fs.readFileSync(f, 'utf8')) as Mum[]) m.set(c.date, c);
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const xu = mumlar(path.join(CACHE, 'XU100.json'));
const xuIdx = new Map(xu.map((c, i) => [c.date, i]));
const xuSma200 = xu.map((_, i) => (i >= 199 ? ort(xu.slice(i - 199, i + 1).map((c) => c.close)) : NaN));
function rejim(d: string): 'boğa' | 'ayı' | 'yatay' | null {
  const i = xuIdx.get(d); if (i == null || i < 199 || i < 60) return null;
  const c = xu[i]!.close, r60 = c / xu[i - 60]!.close - 1;
  if (c > xuSma200[i]! && r60 > 0) return 'boğa';
  if (c < xuSma200[i]! && r60 < 0) return 'ayı';
  return 'yatay';
}

interface Obs {
  date: string; adv: number; R: [number, number, number]; RX: [number, number, number];
  base: Float64Array; scores: Float64Array; aile: number; sinyalli: boolean; tavan: boolean;
}
const gunler = new Map<string, Obs[]>();
const yilSifirHacim = new Map<number, [number, number]>();   // [toplam, sıfır]
const yilTemizlik = new Map<number, [number, number]>();     // [pencere-uygun, elenen]
let pariteKontrol = 0, pariteHata = 0;
const pariteOrnek: string[] = [];
const rnd = rng(20260911);
const semboller = fs.readdirSync(CACHE).filter((f) => f.endsWith('.json') && f !== '_manifest.json' && f !== 'XU100.json').sort();
let panelEksik = 0;

for (const f of semboller) {
  const bars = mumlar(path.join(CACHE, f));
  const n = bars.length; if (n < 300) continue;
  const pf = path.join(PANEL, f);
  if (!fs.existsSync(pf)) { panelEksik++; continue; }
  const panel = JSON.parse(fs.readFileSync(pf, 'utf8')) as { days: Record<string, [Sig[], number, string]> };
  const c = bars.map((b) => b.close), o = bars.map((b) => b.open), v = bars.map((b) => b.volume);
  const rsi = calculateRSIWilder(c, 14);
  const gapPref = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    gapPref[i + 1] = gapPref[i]! + (i > 0 && Math.abs(c[i]! / c[i - 1]! - 1) > 0.25 ? 1 : 0);
    const y = Number(bars[i]!.date.slice(0, 4)); const z = yilSifirHacim.get(y) ?? [0, 0]; z[0]++; if (!v[i]) z[1]++; yilSifirHacim.set(y, z);
  }
  const tlPref = new Float64Array(n + 1); for (let i = 0; i < n; i++) tlPref[i + 1] = tlPref[i]! + c[i]! * v[i]!;
  for (let t = 251; t + 21 <= n - 1; t++) {
    const d = bars[t]!.date; const y = Number(d.slice(0, 4));
    const tz = yilTemizlik.get(y) ?? [0, 0]; tz[0]++;
    // gapPref[i+1] = i. gündeki (i−1 → i) değişim bayrağını içerir → [t−60, t+21] = gapPref[t+22] − gapPref[t−60]
    const temiz = gapPref[t + 22]! - gapPref[t - 60]! === 0;
    if (!temiz) { tz[1]++; yilTemizlik.set(y, tz); continue; }
    yilTemizlik.set(y, tz);
    if (!(o[t + 1]! > 0)) continue;
    const R: [number, number, number] = [c[t + 5]! / o[t + 1]! - 1, c[t + 10]! / o[t + 1]! - 1, c[t + 20]! / o[t + 1]! - 1];
    const xi = xuIdx.get(d), x1 = xuIdx.get(bars[t + 1]!.date);
    const RX: [number, number, number] = [NaN, NaN, NaN];
    if (xi != null && x1 != null) {
      const xg = xu[x1]!.open > 0 ? xu[x1]!.open : xu[xi]!.close;
      [5, 10, 20].forEach((h, k) => { const xh = xuIdx.get(bars[t + h]!.date); if (xh != null) RX[k] = xu[xh]!.close / xg - 1; });
    }
    const sig = panel.days[d];
    const scores = new Float64Array(NS);
    let aile = 0;
    if (sig) {
      const sigs = sig[0];
      for (let k = 0; k < KAPALI.length; k++) { const cf = confluence(sigs, KAPALI[k]!); scores[k] = isaret(cf.dom) * cf.score; }
      const tam = confluence(sigs);
      scores[7] = isaret(tam.dom) * tam.domN;
      scores[8] = isaret(tam.dom);
      pariteKontrol++;
      if (tam.score !== sig[1] || tam.dom !== sig[2]) { pariteHata++; if (pariteOrnek.length < 5) pariteOrnek.push(`${f} ${d}: kopya ${tam.score}/${tam.dom} ≠ canlı ${sig[1]}/${sig[2]}`); }
      for (const s of sigs) { const a = AILELER.indexOf(CAT[s[0]] ?? ''); if (a >= 0) aile |= 1 << a; }
    }
    const base = new Float64Array([c[t - 5]! / c[t - 68]! - 1, c[t]! / c[t - 20]! - 1, -(c[t]! / c[t - 5]! - 1), -(rsi[t] ?? NaN), rnd()]);
    if (!base.every((x) => Number.isFinite(x))) continue;
    const obs: Obs = { date: d, adv: (tlPref[t + 1]! - tlPref[t - 19]!) / 20, R, RX, base, scores, aile, sinyalli: !!sig, tavan: o[t + 1]! >= c[t]! * 1.095 };
    const g = gunler.get(d); if (g) g.push(obs); else gunler.set(d, [obs]);
  }
}

// ── Günlük evren (ilk %60 likidite) + fazla getiri ──
interface Gun { date: string; U: Obs[]; Y: [Float64Array, Float64Array, Float64Array]; YX: [Float64Array, Float64Array, Float64Array]; likYuzde: Float64Array }
const tumGunler: Gun[] = [];
for (const [date, adaylar] of [...gunler.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  if (adaylar.length < 2) continue;
  const advR = pctRank(new Float64Array(adaylar.map((x) => x.adv)));
  const U: Obs[] = []; const lik: number[] = [];
  adaylar.forEach((x, i) => { if (advR[i]! >= 0.4) { U.push(x); lik.push(advR[i]!); } });
  if (U.length < 2) continue;
  const Y = [0, 1, 2].map((k) => { const m = ort(U.map((x) => x.R[k]!)); return new Float64Array(U.map((x) => x.R[k]! - m)); }) as Gun['Y'];
  const YX = [0, 1, 2].map((k) => new Float64Array(U.map((x) => x.R[k]! - x.RX[k]!))) as Gun['YX'];
  tumGunler.push({ date, U, Y, YX, likYuzde: new Float64Array(lik) });
}

// ── §1.1 Veri kalitesi kapısı ──
const evrenYil = new Map<number, number[]>();
for (const g of tumGunler) { const y = Number(g.date.slice(0, 4)); const a = evrenYil.get(y) ?? []; a.push(g.U.length); evrenYil.set(y, a); }
const kapi: Record<number, { evrenMedyan: number; temizlikElenen: number; sifirHacim: number; gecti: boolean }> = {};
for (let y = 2005; y <= 2020; y++) {
  const em = medyan(evrenYil.get(y) ?? []);
  const tz = yilTemizlik.get(y) ?? [0, 0]; const sh = yilSifirHacim.get(y) ?? [0, 0];
  const te = tz[0] ? tz[1] / tz[0] : 1, sz = sh[0] ? sh[1] / sh[0] : 1;
  kapi[y] = { evrenMedyan: em, temizlikElenen: te, sifirHacim: sz, gecti: em >= 150 && te <= 0.15 && sz <= 0.10 };
}
let Ystar: number | null = null;
for (let y = 2005; y <= 2020; y++) { let ok = true; for (let z = y; z <= 2020; z++) if (!kapi[z]!.gecti) { ok = false; break; } if (ok) { Ystar = y; break; } }
const fallback = Ystar == null || Ystar > 2017;
const KARAR: [string, string] = fallback ? ['2021-09-01', '2025-12-31'] : [`${Ystar}-01-01`, '2021-08-31'];
const IKINCIL: [string, string] | null = fallback ? null : ['2021-09-01', '2025-12-31'];
const KIRLI: [string, string] = ['2026-01-01', '2099-12-31'];
const DERIN: [string, string] = ['2001-01-01', fallback ? '2021-08-31' : `${Ystar! - 1}-12-31`];

// ── Günlük IC hesapları ──
interface GunIC {
  date: string; n: number;
  partial: Float64Array;          // NS skor × h=10 kısmi IC
  partialH: [number, number];     // TAM, h=5 ve h=20
  partialX: number;               // TAM, XU100 fazla getirisi
  ham: number; multi: number; sinyalli: number; base: Float64Array;
}
const icGunleri: GunIC[] = [];
const plaseboGirdi = new Map<string, { rC: Float64Array; rM: Float64Array; rY: Float64Array }>();
const icinde = (d: string, p: [string, string]) => d >= p[0] && d <= p[1];

for (const g of tumGunler) {
  const U = g.U; const n = U.length; if (n < MIN_EVREN) continue;
  const rM = pctRank(new Float64Array(U.map((x) => x.base[0]!)));
  const rM20 = pctRank(new Float64Array(U.map((x) => x.base[1]!)));
  const rRev = pctRank(new Float64Array(U.map((x) => x.base[2]!)));
  const rY = g.Y.map((y) => pctRank(y));
  const rYX = pctRank(g.YX[1].map((x) => (Number.isFinite(x) ? x : 0)) as Float64Array);
  const partial = new Float64Array(NS).fill(NaN);
  let rCtam: Float64Array | null = null;
  for (let k = 0; k < NS; k++) {
    const sc = new Float64Array(U.map((x) => x.scores[k]!));
    const rC = pctRank(sc);
    if (k === 0) rCtam = rC;
    partial[k] = pearson(resid1(rC, rM), rY[1]!);
  }
  if (!Number.isFinite(partial[0]!)) continue;
  const eTam = resid1(rCtam!, rM);
  const sinyalliIdx = U.map((x, i) => (x.scores[0] !== 0 ? i : -1)).filter((i) => i >= 0);
  let sinyalli = NaN;
  if (sinyalliIdx.length >= 10) {
    const sC = pctRank(new Float64Array(sinyalliIdx.map((i) => U[i]!.scores[0]!)));
    const sM = pctRank(new Float64Array(sinyalliIdx.map((i) => U[i]!.base[0]!)));
    const sY = pctRank(new Float64Array(sinyalliIdx.map((i) => g.Y[1][i]!)));
    sinyalli = pearson(resid1(sC, sM), sY);
  }
  icGunleri.push({
    date: g.date, n, partial,
    partialH: [pearson(eTam, rY[0]!), pearson(eTam, rY[2]!)],
    partialX: pearson(eTam, rYX),
    ham: pearson(rCtam!, rY[1]!),
    multi: pearson(residK(rCtam!, [rM, rM20, rRev]), rY[1]!),
    sinyalli,
    base: new Float64Array(BASE_ADLARI.map((_, b) => pearson(pctRank(new Float64Array(U.map((x) => x.base[b]!))), rY[1]!))),
  });
  if (icinde(g.date, KARAR)) plaseboGirdi.set(g.date, { rC: rCtam!, rM, rY: rY[1]! });
}

function donem(p: [string, string] | null) { return p ? icGunleri.filter((x) => icinde(x.date, p)) : []; }
const karar = donem(KARAR);
const seri = (arr: GunIC[], f: (x: GunIC) => number) => arr.map(f).filter((x) => Number.isFinite(x));

// ── §5 Birincil + GA + plasebo MDE ──
const pSeri = seri(karar, (x) => x.partial[0]!);
const PRIMARY = ort(pSeri);
const PRIMARY_GA = blokBootstrap(pSeri, 1);
const pr = rng(777); const plaseboOrt: number[] = [];
for (let b = 0; b < 500; b++) {
  let s = 0, c = 0;
  for (const { rC, rM, rY } of plaseboGirdi.values()) {
    const p = Float64Array.from(rC); for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(pr() * (i + 1)); [p[i], p[j]] = [p[j]!, p[i]!]; }
    const ic = pearson(resid1(p, rM), rY); if (Number.isFinite(ic)) { s += ic; c++; }
  }
  plaseboOrt.push(s / c);
}
const plaseboSE = Math.sqrt(ort(plaseboOrt.map((x) => (x - ort(plaseboOrt)) ** 2)));
const MDE = 2.8 * plaseboSE;

// ── Drop-one ──
const dropOne = SKOR_ADLARI.map((ad, k) => {
  const s = seri(karar, (x) => x.partial[k]!);
  const fark = karar.filter((x) => Number.isFinite(x.partial[k]!)).map((x) => x.partial[0]! - x.partial[k]!);
  return { ad, primary: ort(s), fark: ort(fark), farkGA: k === 0 ? [0, 0] : blokBootstrap(fark, 100 + k) };
});

// ── §7.1 Ekonomik bariyer ──
const kararGunleri = tumGunler.filter((g) => icinde(g.date, KARAR) && g.U.length >= MIN_EVREN);
const donemNet: number[] = []; let nakitDonem = 0;
for (let i = 0; i < kararGunleri.length; i += 10) {
  const g = kararGunleri[i]!;
  const k = Math.round(g.U.length * 0.10);
  const aday = g.U.map((x, j) => ({ x, j })).filter((a) => a.x.scores[0]! > 0)
    .sort((a, b) => b.x.scores[0]! - a.x.scores[0]! || b.x.adv - a.x.adv).slice(0, k)
    .filter((a) => !a.x.tavan);
  if (aday.length < 5) { donemNet.push(0); nakitDonem++; continue; }
  const maliyet = (lik: number) => 2 * (lik >= 0.8 ? 0.0015 : lik >= 0.6 ? 0.0025 : 0.0040);
  donemNet.push(ort(aday.map((a) => g.Y[1][a.j]! - maliyet(g.likYuzde[a.j]!))));
}
const bariyerNet = ort(donemNet);

// ── §7.2 Kararlılık, §7.3 ikincil ──
const yariyil = new Map<string, number[]>();
for (const x of karar) { if (!Number.isFinite(x.partial[0]!)) continue; const k = `${x.date.slice(0, 4)}-${Number(x.date.slice(5, 7)) <= 6 ? 'H1' : 'H2'}`; const a = yariyil.get(k) ?? []; a.push(x.partial[0]!); yariyil.set(k, a); }
const yariyilOrt = [...yariyil.entries()].filter(([, a]) => a.length >= 20).map(([k, a]) => ({ k, ic: ort(a) }));
const kararlilik = yariyilOrt.filter((y) => y.ic > 0).length / Math.max(1, yariyilOrt.length);
const ikincil = IKINCIL ? ort(seri(donem(IKINCIL), (x) => x.partial[0]!)) : NaN;

// ── Karar ──
const icAnlamli = PRIMARY > 0 && PRIMARY_GA[0] > 0;
const b71 = bariyerNet > 0, b72 = kararlilik >= 0.6, b73 = IKINCIL ? ikincil > 0 : true;
const katkisiz = dropOne.slice(1, 7).filter((d) => d.farkGA[0]! <= 0 && d.farkGA[1]! >= 0).map((d) => d.ad);
let KARARI: string;
if (!icAnlamli) KARARI = 'KILL';
else if (b71 && b72 && b73) KARARI = katkisiz.length ? 'SIMPLIFY' : 'KEEP';
else KARARI = 'FEATURE';

// ── Zorunlu raporlar ──
const rejimIC: Record<string, { n: number; ic: number }> = {};
for (const r of ['boğa', 'yatay', 'ayı']) { const s = seri(karar.filter((x) => rejim(x.date) === r), (x) => x.partial[0]!); rejimIC[r] = { n: s.length, ic: ort(s) }; }
const jac: Record<string, number> = {};
{
  const kume = kararGunleri.flatMap((g) => g.U.map((x) => x.aile));
  for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) {
    let kes = 0, bir = 0; for (const m of kume) { const A = (m >> a) & 1, B = (m >> b) & 1; if (A && B) kes++; if (A || B) bir++; }
    jac[`${AILELER[a]}–${AILELER[b]}`] = bir ? kes / bir : NaN;
  }
}
const ozetDonem = (p: [string, string] | null) => { const d = donem(p); const s = seri(d, (x) => x.partial[0]!); return { gun: s.length, primary: ort(s), ga: blokBootstrap(s, 9) }; };

let gitHash = ''; try { gitHash = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* yok */ }
let manifest: unknown = null; try { manifest = JSON.parse(fs.readFileSync(path.join(CACHE, '_manifest.json'), 'utf8')); } catch { /* yok */ }

const sonuc = {
  spesifikasyon: 'DENEY-001 v1.1 (kilit 267a17e)', gitHash, manifest,
  ...(MIN_EVREN !== 20 ? { UYARI: `HATA AYIKLAMA KOŞUSU — MIN_EVREN=${MIN_EVREN}, sonuç GEÇERSİZ` } : {}),
  veri: { sembol: semboller.length, panelEksik, gunSayisi: tumGunler.length, icGunu: icGunleri.length },
  parite: { kontrol: pariteKontrol, hata: pariteHata, ornek: pariteOrnek },
  kapi, Ystar, fallback, donemler: { KARAR, IKINCIL, KIRLI, DERIN },
  birincil: { PRIMARY, GA: PRIMARY_GA, gun: pSeri.length, plaseboSE, MDE, pozitifGunOrani: pSeri.filter((x) => x > 0).length / pSeri.length },
  bariyer: { b71_netFazla: bariyerNet, donem: donemNet.length, nakitDonem, b72_kararlilik: kararlilik, yariyil: yariyilOrt, b73_ikincil: ikincil },
  karar: KARARI, katkisizBilesenler: katkisiz,
  raporlar: {
    hamIC: ort(seri(karar, (x) => x.ham)),
    sinyalliAltEvrenIC: ort(seri(karar, (x) => x.sinyalli)),
    cokluAyristirmaIC: { ic: ort(seri(karar, (x) => x.multi)), ga: blokBootstrap(seri(karar, (x) => x.multi), 3) },
    kiyasHamIC: Object.fromEntries(BASE_ADLARI.map((a, b) => [a, ort(seri(karar, (x) => x.base[b]!))])),
    dropOne, rejimIC, jaccard: jac,
    h5: ort(seri(karar, (x) => x.partialH[0])), h20: ort(seri(karar, (x) => x.partialH[1])),
    xu100FazlaGetiri: ort(seri(karar, (x) => x.partialX)),
    kirliDonem2026: ozetDonem(KIRLI), derinTarihsel: ozetDonem(DERIN),
  },
};
fs.writeFileSync(path.join(OUT, 'deney-001-sonuc.json'), JSON.stringify(sonuc, null, 2));
fs.writeFileSync(path.join(OUT, 'deney-001-gunluk-ic.csv'), 'tarih,n,partial_ic_h10\n' + karar.map((x) => `${x.date},${x.n},${x.partial[0]}`).join('\n'));
console.log(JSON.stringify(sonuc, null, 2));
if (pariteHata > 0) { console.error(`⛔ PARİTE HATASI: ${pariteHata}/${pariteKontrol} — spesifikasyon §4.3 gereği deney GEÇERSİZ`); process.exitCode = 3; }
