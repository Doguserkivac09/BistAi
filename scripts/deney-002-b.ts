/**
 * DENEY-002 B — KEŞİF (karar vermez). Spesifikasyon: DENEY-002-GERI-DONUS.md §3 (kilit 6ec4270).
 * A sonucu (ff99495) commit'lendikten SONRA koşulur (§0.1/3).
 *
 * YALNIZ 2011-01-01 → 2021-08-31. Ayrılmış dönem (2021-09 → 2025-12) için hiçbir özellik
 * hesaplanmaz (§0.1/6). Ortak altyapı DENEY-001 ile birebir.
 *
 * Uygulama ayrıntıları (spesifikasyonun tanımlamadığı, sonuca bakmadan sabitlenen):
 *  - Bir özelliğin sonsuz/NaN olduğu hisse-gün o özellik için "gözlem yok" (ör. HACIM_SURPRIZ payı 0)
 *  - Tek özellik IC'si o gün o özelliği olan evren hisseleri üzerinden; < 20 hisse → gün atlanır
 *  - Sektör özellikleri: evren içinde sektörde < 3 hisse → gözlem yok (§3.1'deki kural RS20'ye de uygulanır)
 *  - EW4 yalnız dört bileşeni de olan hisselerde; sıralar o alt evrende yeniden hesaplanır
 *  - Tüm ortalamalar NaN filtrelidir (DENEY-002 A'daki h=5 raporlama hatası dersi)
 *
 *   npx tsx scripts/deney-002-b.ts <önbellek> <çıktı-json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getSectorId } from '../lib/sectors';

const [CACHE, OUTFILE] = process.argv.slice(2);
if (!CACHE || !OUTFILE) { console.error('kullanım: <önbellek> <çıktı-json>'); process.exit(1); }
const BAS = '2011-01-01', SON = '2021-08-31';
const MIN_EVREN = 20;

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
function pctRank(v: ArrayLike<number>): Float64Array {
  const n = v.length; const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a]! - v[b]!);
  const r = new Float64Array(n); let i = 0;
  while (i < n) { let j = i; while (j + 1 < n && v[idx[j + 1]!] === v[idx[i]!]) j++; const avg = (i + j) / 2; for (let k = i; k <= j; k++) r[idx[k]!] = n > 1 ? avg / (n - 1) : 0.5; i = j + 1; }
  return r;
}
function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length; if (n < 3) return NaN; let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a[i]!; sb += b[i]!; }
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
const fin = (x: number) => Number.isFinite(x);
const ort = (a: number[]) => { const f = a.filter(fin); return f.length ? f.reduce((x, y) => x + y, 0) / f.length : NaN; };
const medyan = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
function blokBootstrap(xRaw: number[], seed: number, B = 2000, blok = 20): [number, number] {
  const x = xRaw.filter(fin); const n = x.length; if (n < blok * 2) return [NaN, NaN];
  const r = rng(seed); const means: number[] = [];
  for (let b = 0; b < B; b++) { let s = 0, c = 0; while (c < n) { const st = Math.floor(r() * (n - blok + 1)); for (let k = 0; k < blok && c < n; k++, c++) s += x[st + k]!; } means.push(s / n); }
  means.sort((a, b) => a - b); return [means[Math.floor(B * 0.025)]!, means[Math.floor(B * 0.975) - 1]!];
}

interface Mum { date: string; open: number; high: number; low: number; close: number; volume: number }
function mumlar(f: string): Mum[] {
  const m = new Map<string, Mum>();
  for (const c of JSON.parse(fs.readFileSync(f, 'utf8')) as Mum[]) m.set(c.date, c);
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const OZ = ['MOM63S', 'MOM126S', 'MOM20', 'REV5', 'VOL20', 'HACIM_SURPRIZ', 'SEKTOR_RS20', 'SEKTOR_MOM20'] as const;
const NO = OZ.length;
const I_MOM63 = 0, I_MOM20 = 2, I_REV5 = 3, I_HACIM = 5, I_SRS = 6, I_SMOM = 7;
const EW4_BILESEN = [I_MOM63, I_REV5, I_HACIM, I_SRS];

interface Obs { sektor: string; adv: number; R10: number; tavan: boolean; f: Float64Array }
const gunler = new Map<string, Obs[]>();
const dosyalar = fs.readdirSync(CACHE).filter((f) => f.endsWith('.json') && f !== '_manifest.json' && f !== 'XU100.json').sort();

for (const f of dosyalar) {
  const sym = f.replace('.json', '');
  const b = mumlar(path.join(CACHE, f)); const n = b.length; if (n < 300) continue;
  const c = b.map((x) => x.close), o = b.map((x) => x.open), v = b.map((x) => x.volume);
  const gap = new Int32Array(n + 1), tl = new Float64Array(n + 1), vp = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    gap[i + 1] = gap[i]! + (i > 0 && Math.abs(c[i]! / c[i - 1]! - 1) > 0.25 ? 1 : 0);
    tl[i + 1] = tl[i]! + c[i]! * v[i]!;
    vp[i + 1] = vp[i]! + v[i]!;
  }
  const sektor = getSectorId(sym);
  for (let t = 251; t + 21 <= n - 1; t++) {
    const d = b[t]!.date; if (d < BAS) continue; if (d > SON) break;
    if (gap[t + 22]! - gap[t - 60]! !== 0) continue;
    if (!(o[t + 1]! > 0)) continue;
    const fv = new Float64Array(NO).fill(NaN);
    fv[I_MOM63] = c[t - 5]! / c[t - 68]! - 1;
    fv[1] = c[t - 5]! / c[t - 131]! - 1;
    fv[I_MOM20] = c[t]! / c[t - 20]! - 1;
    fv[I_REV5] = -(c[t]! / c[t - 5]! - 1);
    { let s = 0, s2 = 0; for (let k = t - 19; k <= t; k++) { const r = Math.log(c[k]! / c[k - 1]!); s += r; s2 += r * r; } const m = s / 20; fv[4] = -Math.sqrt(Math.max(0, s2 / 20 - m * m)); }
    { const pay = (vp[t + 1]! - vp[t - 4]!) / 5, payda = (vp[t - 4]! - vp[t - 64]!) / 60; fv[I_HACIM] = payda > 0 && pay > 0 ? Math.log(pay / payda) : NaN; }
    const obs: Obs = { sektor, adv: (tl[t + 1]! - tl[t - 19]!) / 20, R10: c[t + 10]! / o[t + 1]! - 1, tavan: o[t + 1]! >= c[t]! * 1.095, f: fv };
    const g = gunler.get(d); if (g) g.push(obs); else gunler.set(d, [obs]);
  }
}

interface Gun { date: string; U: Obs[]; lik: number[]; Y: Float64Array }
const tum: Gun[] = [];
for (const [date, a] of [...gunler.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
  if (a.length < 2) continue;
  const ar = pctRank(a.map((x) => x.adv));
  const U: Obs[] = [], lik: number[] = [];
  a.forEach((x, i) => { if (ar[i]! >= 0.4) { U.push(x); lik.push(ar[i]!); } });
  if (U.length < MIN_EVREN) continue;
  // Sektör özellikleri evren İÇİNDE hesaplanır
  const sek = new Map<string, number[]>();
  for (const x of U) { const s = sek.get(x.sektor) ?? []; s.push(x.f[I_MOM20]!); sek.set(x.sektor, s); }
  for (const x of U) {
    const s = sek.get(x.sektor)!;
    if (s.length >= 3) { const m = ort(s); x.f[I_SMOM] = m; x.f[I_SRS] = x.f[I_MOM20]! - m; }
  }
  const mR = ort(U.map((x) => x.R10));
  tum.push({ date, U, lik, Y: new Float64Array(U.map((x) => x.R10 - mR)) });
}

/** Verilen özellik indekslerinin HEPSİ olan hisseler için alt küme indeksi. */
const altKume = (g: Gun, ix: number[]) => g.U.map((x, i) => (ix.every((k) => fin(x.f[k]!)) ? i : -1)).filter((i) => i >= 0);

// ── 1) Tek özellik IC + 5) MOM63S'ye göre ayrıştırılmış IC ──
const tek: number[][] = OZ.map(() => []);
const ayr: number[][] = OZ.map(() => []);
// ── 2) korelasyon matrisi (günlük sıra korelasyonu ortalaması) ──
const kor: number[][][] = OZ.map(() => OZ.map(() => []));
// ── 3) EW4 + drop-one ──
const ew4: number[] = []; const ew3: number[][] = EW4_BILESEN.map(() => []);
const ew4Skor = new Map<string, { idx: number[]; skor: Float64Array }>();

for (const g of tum) {
  for (let k = 0; k < NO; k++) {
    const s = altKume(g, [k]); if (s.length < MIN_EVREN) continue;
    const rF = pctRank(s.map((i) => g.U[i]!.f[k]!)); const rY = pctRank(s.map((i) => g.Y[i]!));
    tek[k]!.push(pearson(rF, rY));
    if (k !== I_MOM63) {
      const s2 = altKume(g, [k, I_MOM63]);
      if (s2.length >= MIN_EVREN) {
        const a = pctRank(s2.map((i) => g.U[i]!.f[k]!)), m = pctRank(s2.map((i) => g.U[i]!.f[I_MOM63]!)), y = pctRank(s2.map((i) => g.Y[i]!));
        ayr[k]!.push(pearson(resid1(a, m), y));
      }
    }
    for (let j = k + 1; j < NO; j++) {
      const s3 = altKume(g, [k, j]); if (s3.length < MIN_EVREN) continue;
      kor[k]![j]!.push(pearson(pctRank(s3.map((i) => g.U[i]!.f[k]!)), pctRank(s3.map((i) => g.U[i]!.f[j]!))));
    }
  }
  const s4 = altKume(g, EW4_BILESEN);
  if (s4.length >= MIN_EVREN) {
    const ranks = EW4_BILESEN.map((k) => pctRank(s4.map((i) => g.U[i]!.f[k]!)));
    const rY = pctRank(s4.map((i) => g.Y[i]!));
    const skor = new Float64Array(s4.length); for (let i = 0; i < s4.length; i++) skor[i] = ranks.reduce((a, r) => a + r[i]!, 0) / 4;
    ew4.push(pearson(pctRank(skor), rY));
    ew4Skor.set(g.date, { idx: s4, skor });
    EW4_BILESEN.forEach((_, drop) => {
      const sk = new Float64Array(s4.length);
      for (let i = 0; i < s4.length; i++) { let a = 0; ranks.forEach((r, q) => { if (q !== drop) a += r[i]!; }); sk[i] = a / 3; }
      ew3[drop]!.push(pearson(pctRank(sk), rY));
    });
  }
}

// ── 4) EW4 ekonomik bariyer (A §2.5 kuralı, EW4 sırasıyla) ──
const maliyet = (l: number) => 2 * (l >= 0.8 ? 0.0015 : l >= 0.6 ? 0.0025 : 0.0040);
const bGunleri = tum.filter((g) => ew4Skor.has(g.date));
const net: number[] = [], brut: number[] = []; let nakit = 0;
for (let i = 0; i < bGunleri.length; i += 10) {
  const g = bGunleri[i]!; const { idx, skor } = ew4Skor.get(g.date)!;
  const k = Math.round(idx.length * 0.10);
  const sec = idx.map((j, q) => ({ j, s: skor[q]! })).sort((a, b) => b.s - a.s || g.U[b.j]!.adv - g.U[a.j]!.adv).slice(0, k).filter((a) => !g.U[a.j]!.tavan);
  if (sec.length < 5) { net.push(0); brut.push(0); nakit++; continue; }
  brut.push(ort(sec.map((a) => g.Y[a.j]!)));
  net.push(ort(sec.map((a) => g.Y[a.j]! - maliyet(g.lik[a.j]!))));
}

const ozet = (s: number[], seed: number) => ({ ic: ort(s), ga: blokBootstrap(s, seed), gun: s.filter(fin).length, pozitifGun: s.filter((x) => x > 0).length / Math.max(1, s.filter(fin).length) });
const tekSonuc = Object.fromEntries(OZ.map((ad, k) => [ad, ozet(tek[k]!, 10 + k)]));
const ayrSonuc = Object.fromEntries(OZ.map((ad, k) => [ad, k === I_MOM63 ? null : ozet(ayr[k]!, 30 + k)]));
const korMatris = Object.fromEntries(OZ.map((a, k) => [a, Object.fromEntries(OZ.map((b, j) => [b, k === j ? 1 : ort(j > k ? kor[k]![j]! : kor[j]![k]!)]))]));
const dropOne = EW4_BILESEN.map((k, q) => {
  const fark: number[] = []; for (let i = 0; i < ew4.length; i++) fark.push(ew4[i]! - ew3[q]![i]!);
  return { cikarilan: OZ[k], ew3: ozet(ew3[q]!, 50 + q), fark: ort(fark), farkGA: blokBootstrap(fark, 60 + q) };
});
const adaylar = OZ.filter((ad) => { const r = tekSonuc[ad]!; return r.ga[0]! > 0 || r.ga[1]! < 0; }).map((ad) => ({ ozellik: ad, ic: tekSonuc[ad]!.ic, ga: tekSonuc[ad]!.ga }));
const ew4Ozet = ozet(ew4, 5);

let gitHash = ''; try { gitHash = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* yok */ }
let manifest: unknown = null; try { manifest = JSON.parse(fs.readFileSync(path.join(CACHE, '_manifest.json'), 'utf8')); } catch { /* yok */ }

const out = {
  spesifikasyon: 'DENEY-002 B — KEŞİF, karar vermez (kilit 6ec4270)', gitHash, manifest,
  donem: [BAS, SON], gun: tum.length, evrenMedyan: medyan(tum.map((g) => g.U.length)),
  r1_tekOzellikIC: tekSonuc,
  r2_korelasyon: korMatris,
  r3_EW4: { ...ew4Ozet, dropOne, ...(ew4Ozet.ga[0]! > 0 ? {} : {}) },
  r4_EW4_bariyer: { netOrt: ort(net), brutOrt: ort(brut), donem: net.length, nakit },
  r5_MOM63S_ayristirilmis: ayrSonuc,
  // §3.4: DENEY-003 hipotez adayı olabilmek için tek başına GA 0'ı dışlamalı (işaret fark etmez — negatif de bilgi)
  deney003Adaylari: [
    ...adaylar,
    ...(ew4Ozet.ga[0]! > 0 || ew4Ozet.ga[1]! < 0 ? [{ ozellik: 'EW4', ic: ew4Ozet.ic, ga: ew4Ozet.ga }] : []),
  ],
  uyari: 'KEŞİF. ~21 örtük test. Hiçbir sonuç kanıt değildir; yalnız 2021-09 → 2025-12 ayrılmış dönemde veya ileriye dönük veride doğrulanabilir.',
};
fs.writeFileSync(OUTFILE, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
