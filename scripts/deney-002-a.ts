/**
 * DENEY-002 A — H2 doğrulaması. Spesifikasyon: DENEY-002-GERI-DONUS.md (kilit 6ec4270).
 *
 * YALNIZ REV5 hesaplanır, YALNIZ 2001–2010 (veri kapısıyla). §0.1 duvarı gereği başka
 * hiçbir özellik bu dönemde hesaplanmaz. Ortak altyapı DENEY-001 ile birebir.
 *
 *   npx tsx scripts/deney-002-a.ts <önbellek> <çıktı-json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const [CACHE, OUTFILE] = process.argv.slice(2);
if (!CACHE || !OUTFILE) { console.error('kullanım: <önbellek> <çıktı-json>'); process.exit(1); }

const DONEM_SON = '2010-12-31';
const MIN_EVREN = 20;

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let x = Math.imul(seed ^ (seed >>> 15), 1 | seed); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
function pctRank(v: Float64Array): Float64Array {
  const n = v.length; const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => v[a]! - v[b]!);
  const r = new Float64Array(n); let i = 0;
  while (i < n) { let j = i; while (j + 1 < n && v[idx[j + 1]!] === v[idx[i]!]) j++; const avg = (i + j) / 2; for (let k = i; k <= j; k++) r[idx[k]!] = n > 1 ? avg / (n - 1) : 0.5; i = j + 1; }
  return r;
}
function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length; let sa = 0, sb = 0; for (let i = 0; i < n; i++) { sa += a[i]!; sb += b[i]!; }
  const ma = sa / n, mb = sb / n; let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const da = a[i]! - ma, db = b[i]! - mb; cov += da * db; va += da * da; vb += db * db; }
  return va > 1e-12 && vb > 1e-12 ? cov / Math.sqrt(va * vb) : NaN;
}
const ort = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const medyan = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
function blokBootstrap(x: number[], seed: number, B = 2000, blok = 20): [number, number] {
  const n = x.length; if (n < blok * 2) return [NaN, NaN];
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

// ── Rejim (DENEY-001 tanımı) ──
const xu = mumlar(path.join(CACHE, 'XU100.json'));
const xuIdx = new Map(xu.map((c, i) => [c.date, i]));
function rejim(d: string): 'boğa' | 'ayı' | 'yatay' | null {
  const i = xuIdx.get(d); if (i == null || i < 199) return null;
  let s = 0; for (let k = i - 199; k <= i; k++) s += xu[k]!.close;
  const c = xu[i]!.close, sma = s / 200, r60 = c / xu[i - 60]!.close - 1;
  if (c > sma && r60 > 0) return 'boğa';
  if (c < sma && r60 < 0) return 'ayı';
  return 'yatay';
}

// ── Aday hisse-günler (yalnız t ≤ 2010-12-31) ──
interface Obs { rev5: number; adv: number; R5: number; R10: number; R20: number; tavan: boolean }
const gunler = new Map<string, Obs[]>();
const yilSifir = new Map<number, [number, number]>();
const yilTemiz = new Map<number, [number, number]>();
const dosyalar = fs.readdirSync(CACHE).filter((f) => f.endsWith('.json') && f !== '_manifest.json' && f !== 'XU100.json').sort();

for (const f of dosyalar) {
  const b = mumlar(path.join(CACHE, f)); const n = b.length; if (n < 300) continue;
  const c = b.map((x) => x.close), o = b.map((x) => x.open), v = b.map((x) => x.volume);
  const gap = new Int32Array(n + 1);
  const tl = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    gap[i + 1] = gap[i]! + (i > 0 && Math.abs(c[i]! / c[i - 1]! - 1) > 0.25 ? 1 : 0);
    tl[i + 1] = tl[i]! + c[i]! * v[i]!;
    if (b[i]!.date <= DONEM_SON) { const y = Number(b[i]!.date.slice(0, 4)); const z = yilSifir.get(y) ?? [0, 0]; z[0]++; if (!v[i]) z[1]++; yilSifir.set(y, z); }
  }
  for (let t = 251; t + 21 <= n - 1; t++) {
    const d = b[t]!.date; if (d > DONEM_SON) break;
    const y = Number(d.slice(0, 4)); const tz = yilTemiz.get(y) ?? [0, 0]; tz[0]++;
    if (gap[t + 22]! - gap[t - 60]! !== 0) { tz[1]++; yilTemiz.set(y, tz); continue; }
    yilTemiz.set(y, tz);
    if (!(o[t + 1]! > 0)) continue;
    const rev5 = -(c[t]! / c[t - 5]! - 1);
    if (!Number.isFinite(rev5)) continue;
    const obs: Obs = {
      rev5, adv: (tl[t + 1]! - tl[t - 19]!) / 20,
      R5: c[t + 5]! / o[t + 1]! - 1, R10: c[t + 10]! / o[t + 1]! - 1, R20: c[t + 20]! / o[t + 1]! - 1,
      tavan: o[t + 1]! >= c[t]! * 1.095,
    };
    const g = gunler.get(d); if (g) g.push(obs); else gunler.set(d, [obs]);
  }
}

// ── Günlük evren ──
interface Gun { date: string; U: Obs[]; lik: number[]; Y5: Float64Array; Y10: Float64Array; Y20: Float64Array }
const tum: Gun[] = [];
for (const [date, a] of [...gunler.entries()].sort((x, y) => x[0].localeCompare(y[0]))) {
  if (a.length < 2) continue;
  const ar = pctRank(new Float64Array(a.map((x) => x.adv)));
  const U: Obs[] = [], lik: number[] = [];
  a.forEach((x, i) => { if (ar[i]! >= 0.4) { U.push(x); lik.push(ar[i]!); } });
  if (U.length < 2) continue;
  const fz = (k: 'R5' | 'R10' | 'R20') => { const m = ort(U.map((x) => x[k])); return new Float64Array(U.map((x) => x[k] - m)); };
  tum.push({ date, U, lik, Y5: fz('R5'), Y10: fz('R10'), Y20: fz('R20') });
}

// ── §2.3 Veri kalitesi kapısı ──
const evrenYil = new Map<number, number[]>();
for (const g of tum) { const y = Number(g.date.slice(0, 4)); const a = evrenYil.get(y) ?? []; a.push(g.U.length); evrenYil.set(y, a); }
const kapi: Record<number, { evrenMedyan: number; temizlikElenen: number; sifirHacim: number; gecti: boolean }> = {};
for (let y = 2001; y <= 2010; y++) {
  const em = medyan(evrenYil.get(y) ?? []); const tz = yilTemiz.get(y) ?? [0, 0]; const sz = yilSifir.get(y) ?? [0, 0];
  const te = tz[0] ? tz[1] / tz[0] : 1, sh = sz[0] ? sz[1] / sz[0] : 1;
  kapi[y] = { evrenMedyan: em, temizlikElenen: te, sifirHacim: sh, gecti: em >= 100 && te <= 0.15 && sh <= 0.10 };
}
let Y2: number | null = null;
for (let y = 2001; y <= 2010; y++) { let ok = true; for (let z = y; z <= 2010; z++) if (!kapi[z]!.gecti) { ok = false; break; } if (ok) { Y2 = y; break; } }

let gitHash = ''; try { gitHash = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* yok */ }
let manifest: unknown = null; try { manifest = JSON.parse(fs.readFileSync(path.join(CACHE, '_manifest.json'), 'utf8')); } catch { /* yok */ }
const temel = { spesifikasyon: 'DENEY-002 A (kilit 6ec4270)', gitHash, manifest, kapi, Y2 };

if (Y2 == null || Y2 > 2007) {
  const out = { ...temel, karar: 'YETERSİZ VERİ' };
  fs.writeFileSync(OUTFILE, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

// ── §2.4 Birincil ──
const BAS = `${Y2}-01-01`;
const donem = tum.filter((g) => g.date >= BAS && g.date <= DONEM_SON && g.U.length >= MIN_EVREN);
const ic: { date: string; ic10: number; ic5: number; ic20: number; rR: Float64Array; rY: Float64Array }[] = [];
for (const g of donem) {
  const rR = pctRank(new Float64Array(g.U.map((x) => x.rev5)));
  const rY = pctRank(g.Y10);
  const v = pearson(rR, rY); if (!Number.isFinite(v)) continue;
  ic.push({ date: g.date, ic10: v, ic5: pearson(rR, pctRank(g.Y5)), ic20: pearson(rR, pctRank(g.Y20)), rR, rY });
}
const seri = ic.map((x) => x.ic10);
const PRIMARY = ort(seri);
const GA = blokBootstrap(seri, 1);
const pr = rng(777); const plasebo: number[] = [];
for (let b = 0; b < 500; b++) {
  let s = 0, c = 0;
  for (const x of ic) { const p = Float64Array.from(x.rR); for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(pr() * (i + 1)); [p[i], p[j]] = [p[j]!, p[i]!]; } const v = pearson(p, x.rY); if (Number.isFinite(v)) { s += v; c++; } }
  plasebo.push(s / c);
}
const pm = ort(plasebo);
const SE = Math.sqrt(ort(plasebo.map((x) => (x - pm) ** 2)));
const MDE = 2.8 * SE;

// ── §2.5 Bariyerler ──
const maliyet = (l: number) => 2 * (l >= 0.8 ? 0.0015 : l >= 0.6 ? 0.0025 : 0.0040);
const net: number[] = [], brut: number[] = [], boyut: number[] = []; let nakit = 0;
for (let i = 0; i < donem.length; i += 10) {
  const g = donem[i]!; const k = Math.round(g.U.length * 0.10);
  const sec = g.U.map((x, j) => ({ x, j })).sort((a, b) => b.x.rev5 - a.x.rev5 || b.x.adv - a.x.adv).slice(0, k).filter((a) => !a.x.tavan);
  if (sec.length < 5) { net.push(0); brut.push(0); nakit++; continue; }
  boyut.push(sec.length);
  brut.push(ort(sec.map((a) => g.Y10[a.j]!)));
  net.push(ort(sec.map((a) => g.Y10[a.j]! - maliyet(g.lik[a.j]!))));
}
const yy = new Map<string, number[]>();
for (const x of ic) { const k = `${x.date.slice(0, 4)}-${Number(x.date.slice(5, 7)) <= 6 ? 'H1' : 'H2'}`; const a = yy.get(k) ?? []; a.push(x.ic10); yy.set(k, a); }
const yariyil = [...yy.entries()].filter(([, a]) => a.length >= 20).map(([k, a]) => ({ k, ic: ort(a) }));
const kararlilik = yariyil.filter((y) => y.ic > 0).length / Math.max(1, yariyil.length);

const icAnlamli = PRIMARY > 0 && GA[0] > 0;
const ekonomik = ort(net) > 0;
const kararli = kararlilik >= 0.6;
const karar = !icAnlamli ? 'REDDEDİLDİ' : ekonomik && kararli ? 'DOĞRULANDI' : 'FEATURE';

const rejimIC: Record<string, { n: number; ic: number }> = {};
for (const r of ['boğa', 'yatay', 'ayı']) { const s = ic.filter((x) => rejim(x.date) === r).map((x) => x.ic10); rejimIC[r] = { n: s.length, ic: ort(s) }; }

const out = {
  ...temel,
  donem: [BAS, DONEM_SON],
  birincil: { PRIMARY, GA, gun: seri.length, plaseboSE: SE, MDE, pozitifGunOrani: seri.filter((x) => x > 0).length / seri.length },
  bariyer: {
    ekonomik: { netOrt: ort(net), brutOrt: ort(brut), donem: net.length, nakit, ortPortfoy: ort(boyut), gecti: ekonomik },
    kararlilik: { oran: kararlilik, yariyil, gecti: kararli },
  },
  karar,
  raporlar: { rejimIC, KESIF_h5: ort(ic.map((x) => x.ic5)), KESIF_h20: ort(ic.map((x) => x.ic20)) },
};
fs.writeFileSync(OUTFILE, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
