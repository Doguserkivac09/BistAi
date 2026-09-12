/**
 * DENEY-003 — DENEY-002 B adaylarının AYRILMIŞ dönemde doğrulanması.
 * Spesifikasyon: DENEY-003-RISK-OZELLIKLERI.md (kilit fe2cdf2). Sonuç görülmeden kilitlenir.
 *
 * Karar dönemi 2021-09-01 → 2025-12-31 (bu deneye kadar hiçbir özellik için hesaplanmadı).
 * 2026 yalnız KEŞİF olarak raporlanır, karara giremez (§8).
 * Üç hipotez → Bonferroni α=0,05/3; karar %98,33 GA ile (§3).
 *
 * Uygulama ayrıntıları (spesifikasyonun bırakmadığı, sonuca bakmadan sabitlenen):
 *  - Ortak altyapı DENEY-001/002 ile birebir; yardımcı fonksiyonlar deney-002-b.ts'ten kopya
 *  - Tüm ortalamalar NaN filtrelidir (DENEY-002 A raporlama hatası dersi)
 *  - Desil profili / bariyer / kararlılık TEMEL varyantta; V1/V2 yalnız işaret korunumu için
 *  - Desiller D1 = özelliğin EN DÜŞÜK %10'u … D10 = en yüksek %10 (ham özellik, işaretsiz)
 *
 *   npx tsx scripts/deney-003.ts <önbellek> <çıktı-json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getSectorId } from '../lib/sectors';

const [CACHE, OUTFILE] = process.argv.slice(2);
if (!CACHE || !OUTFILE) { console.error('kullanım: <önbellek> <çıktı-json>'); process.exit(1); }
const BAS = '2021-09-01', SON = '2025-12-31', KESIF_BAS = '2026-01-01';
const MIN_EVREN = 20;

const OZ = ['VOL20', 'HACIM_SURPRIZ', 'SEKTOR_MOM20'] as const;
type Oz = (typeof OZ)[number];
/** Beklenen işaret (§0) — karar bu yöne göre verilir. */
const BEKLENEN: Record<Oz, 1 | -1> = { VOL20: 1, HACIM_SURPRIZ: -1, SEKTOR_MOM20: 1 };
const I_VOL = 0, I_HAC = 1, I_SEK = 2, NO = 3;

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
const fin = (x: number) => Number.isFinite(x);
const ort = (a: number[]) => { const f = a.filter(fin); return f.length ? f.reduce((x, y) => x + y, 0) / f.length : NaN; };
const medyan = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
/** Hareketli blok bootstrap → %95 ve Bonferroni %98,33 GA (§1, §3). */
function blokGA(xRaw: number[], seed: number, B = 2000, blok = 20): { ga95: [number, number]; ga9833: [number, number] } {
  const x = xRaw.filter(fin); const n = x.length;
  if (n < blok * 2) return { ga95: [NaN, NaN], ga9833: [NaN, NaN] };
  const r = rng(seed); const m: number[] = [];
  for (let b = 0; b < B; b++) { let s = 0, c = 0; while (c < n) { const st = Math.floor(r() * (n - blok + 1)); for (let k = 0; k < blok && c < n; k++, c++) s += x[st + k]!; } m.push(s / n); }
  m.sort((a, b) => a - b);
  const q = (p: number) => m[Math.min(B - 1, Math.max(0, Math.floor(B * p)))]!;
  return { ga95: [q(0.025), q(0.975)], ga9833: [q(0.05 / 6), q(1 - 0.05 / 6)] };
}

interface Mum { date: string; open: number; high: number; low: number; close: number; volume: number }
function mumlar(f: string): Mum[] {
  const m = new Map<string, Mum>();
  for (const c of JSON.parse(fs.readFileSync(f, 'utf8')) as Mum[]) m.set(c.date, c);
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Ham aday hisse-gün (evren kapısı ve sektör özelliği varyanta göre sonra uygulanır). */
interface Ham { sektor: string; adv: number; fiyat: number; mom20: number; R10: number; tavan: boolean; temiz15: boolean; vol20: number; hacim: number }
const gunler = new Map<string, Ham[]>();
const dosyalar = fs.readdirSync(CACHE).filter((f) => f.endsWith('.json') && f !== '_manifest.json' && f !== 'XU100.json').sort();

for (const f of dosyalar) {
  const b = mumlar(path.join(CACHE, f)); const n = b.length; if (n < 300) continue;
  const c = b.map((x) => x.close), o = b.map((x) => x.open), v = b.map((x) => x.volume);
  const g25 = new Int32Array(n + 1), g15 = new Int32Array(n + 1), tl = new Float64Array(n + 1), vp = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const d = i > 0 ? Math.abs(c[i]! / c[i - 1]! - 1) : 0;
    g25[i + 1] = g25[i]! + (d > 0.25 ? 1 : 0);
    g15[i + 1] = g15[i]! + (d > 0.15 ? 1 : 0);
    tl[i + 1] = tl[i]! + c[i]! * v[i]!; vp[i + 1] = vp[i]! + v[i]!;
  }
  const sektor = getSectorId(f.replace('.json', ''));
  for (let t = 251; t + 21 <= n - 1; t++) {
    const d = b[t]!.date; if (d < BAS) continue;
    if (g25[t + 22]! - g25[t - 60]! !== 0) continue;   // temel temizlik %25 (§1)
    if (!(o[t + 1]! > 0)) continue;
    let vol = NaN;
    { let s = 0, s2 = 0; for (let k = t - 19; k <= t; k++) { const r = Math.log(c[k]! / c[k - 1]!); s += r; s2 += r * r; } const m = s / 20; vol = -Math.sqrt(Math.max(0, s2 / 20 - m * m)); }
    const pay = (vp[t + 1]! - vp[t - 4]!) / 5, payda = (vp[t - 4]! - vp[t - 64]!) / 60;
    const ham: Ham = {
      sektor, adv: (tl[t + 1]! - tl[t - 19]!) / 20, fiyat: c[t]!, mom20: c[t]! / c[t - 20]! - 1,
      R10: c[t + 10]! / o[t + 1]! - 1, tavan: o[t + 1]! >= c[t]! * 1.095,
      temiz15: g15[t + 22]! - g15[t - 60]! === 0, vol20: vol,
      hacim: payda > 0 && pay > 0 ? Math.log(pay / payda) : NaN,
    };
    const arr = gunler.get(d); if (arr) arr.push(ham); else gunler.set(d, [ham]);
  }
}

interface Obs { sektor: string; adv: number; f: Float64Array; R10: number; tavan: boolean }
interface Gun { date: string; U: Obs[]; lik: number[]; Y: Float64Array }
type Varyant = 'temel' | 'V1' | 'V2';

/** Günlük evreni varyanta göre kurar; sektör özelliği DAİMA evren içinde hesaplanır (§2). */
function evrenKur(varyant: Varyant, bas: string, son: string): Gun[] {
  const likEsik = varyant === 'V2' ? 0.6 : 0.4;   // temel: ilk %60 · V2: ilk %40
  const out: Gun[] = [];
  for (const [date, hamHepsi] of [...gunler.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (date < bas || date > son) continue;
    let a = hamHepsi;
    if (varyant === 'V1') a = a.filter((x) => x.temiz15);
    if (varyant === 'V2') a = a.filter((x) => x.fiyat >= 2);
    if (a.length < 2) continue;
    const ar = pctRank(a.map((x) => x.adv));
    const sec: Ham[] = [], lik: number[] = [];
    a.forEach((x, i) => { if (ar[i]! >= likEsik) { sec.push(x); lik.push(ar[i]!); } });
    if (sec.length < MIN_EVREN) continue;
    const sek = new Map<string, number[]>();
    for (const x of sec) { const s = sek.get(x.sektor) ?? []; s.push(x.mom20); sek.set(x.sektor, s); }
    const U = sec.map<Obs>((x) => {
      const s = sek.get(x.sektor)!;
      const fv = new Float64Array(NO);
      fv[I_VOL] = x.vol20; fv[I_HAC] = x.hacim;
      fv[I_SEK] = s.length >= 3 ? ort(s) : NaN;   // sektörde < 3 hisse → gözlem yok
      return { sektor: x.sektor, adv: x.adv, f: fv, R10: x.R10, tavan: x.tavan };
    });
    const mR = ort(U.map((x) => x.R10));
    out.push({ date, U, lik, Y: new Float64Array(U.map((x) => x.R10 - mR)) });
  }
  return out;
}

/** Bir özelliğin günlük kesitsel Spearman IC serisi. */
function icSerisi(gunlerV: Gun[], k: number): { ic: number[]; tarih: string[] } {
  const ic: number[] = [], tarih: string[] = [];
  for (const g of gunlerV) {
    const idx = g.U.map((x, i) => (fin(x.f[k]!) ? i : -1)).filter((i) => i >= 0);
    if (idx.length < MIN_EVREN) continue;
    const r = pearson(pctRank(idx.map((i) => g.U[i]!.f[k]!)), pctRank(idx.map((i) => g.Y[i]!)));
    if (!fin(r)) continue;
    ic.push(r); tarih.push(g.date);
  }
  return { ic, tarih };
}

const maliyet = (l: number) => 2 * (l >= 0.8 ? 0.0015 : l >= 0.6 ? 0.0025 : 0.0040);

/** §5 — her aday için ayrı ekonomik bariyer (10 günde bir, ilk %10, tavan elemesi, maliyet sonrası). */
function bariyer(gunlerV: Gun[], k: number, isaret: 1 | -1) {
  const uygun = gunlerV.filter((g) => g.U.filter((x) => fin(x.f[k]!)).length >= MIN_EVREN);
  const net: number[] = [], brut: number[] = []; let nakit = 0;
  for (let i = 0; i < uygun.length; i += 10) {
    const g = uygun[i]!;
    const idx = g.U.map((x, q) => (fin(x.f[k]!) ? q : -1)).filter((q) => q >= 0);
    const adet = Math.round(idx.length * 0.10);
    const sec = idx.map((q) => ({ q, s: isaret * g.U[q]!.f[k]! }))
      .sort((a, b) => b.s - a.s || g.U[b.q]!.adv - g.U[a.q]!.adv)
      .slice(0, adet).filter((a) => !g.U[a.q]!.tavan);
    if (sec.length < 5) { net.push(0); brut.push(0); nakit++; continue; }
    brut.push(ort(sec.map((a) => g.Y[a.q]!)));
    net.push(ort(sec.map((a) => g.Y[a.q]! - maliyet(g.lik[a.q]!))));
  }
  const gaNet = blokGA(net, 700 + k, 2000, 5);
  return { netOrt: ort(net), brutOrt: ort(brut), netGA95: gaNet.ga95, donem: net.length, nakit, gecti: ort(net) > 0 };
}

/** §4 V3 — desil profili + kaçınma değeri. */
function desilProfili(gunlerV: Gun[], k: number, isaret: 1 | -1) {
  const kova: number[][] = Array.from({ length: 10 }, () => []);
  const haricler: number[] = [];   // beklenen yöne göre EN KÖTÜ desil hariç evren ortalaması
  for (const g of gunlerV) {
    const idx = g.U.map((x, i) => (fin(x.f[k]!) ? i : -1)).filter((i) => i >= 0);
    if (idx.length < MIN_EVREN) continue;
    const r = pctRank(idx.map((i) => g.U[i]!.f[k]!));
    const gunKova: number[][] = Array.from({ length: 10 }, () => []);
    idx.forEach((i, q) => { gunKova[Math.min(9, Math.floor(r[q]! * 10))]!.push(g.Y[i]!); });
    gunKova.forEach((v, d) => { if (v.length) kova[d]!.push(ort(v)); });
    // beklenen işaret +1 ise en kötü desil D1 (özelliğin en düşüğü), −1 ise D10
    const kotu = isaret === 1 ? 0 : 9;
    const kalan: number[] = []; gunKova.forEach((v, d) => { if (d !== kotu) kalan.push(...v); });
    if (kalan.length) haricler.push(ort(kalan));
  }
  const desiller = kova.map((v, d) => ({ desil: `D${d + 1}`, ortY: ort(v), gun: v.length }));
  return { desiller, kacinmaDegeri: ort(haricler), kacinmaGA95: blokGA(haricler, 800 + k).ga95 };
}

/** §6 — takvim yarıyılı kararlılığı (≥ 20 IC günü olan yarıyıllar). */
function kararlilik(ic: number[], tarih: string[], isaret: 1 | -1) {
  const kova = new Map<string, number[]>();
  ic.forEach((x, i) => {
    const d = tarih[i]!; const anahtar = `${d.slice(0, 4)}-H${Number(d.slice(5, 7)) <= 6 ? 1 : 2}`;
    const a = kova.get(anahtar) ?? []; a.push(x); kova.set(anahtar, a);
  });
  const yariyillar = [...kova.entries()].filter(([, v]) => v.length >= 20)
    .map(([ad, v]) => ({ yariyil: ad, ic: ort(v), gun: v.length })).sort((a, b) => a.yariyil.localeCompare(b.yariyil));
  const uyan = yariyillar.filter((y) => Math.sign(y.ic) === isaret).length;
  const oran = yariyillar.length ? uyan / yariyillar.length : NaN;
  return { yariyillar, oran, gecti: oran >= 0.6 };
}

// ── Koşu ──
const temel = evrenKur('temel', BAS, SON);
const v1 = evrenKur('V1', BAS, SON);
const v2 = evrenKur('V2', BAS, SON);
const kesif = evrenKur('temel', KESIF_BAS, '2099-12-31');

const sonuclar = OZ.map((ad, k) => {
  const isaret = BEKLENEN[ad];
  const t = icSerisi(temel, k);
  const ga = blokGA(t.ic, 100 + k);
  const a1 = icSerisi(v1, k), a2 = icSerisi(v2, k);
  const icTemel = ort(t.ic), icV1 = ort(a1.ic), icV2 = ort(a2.ic);
  const bar = bariyer(temel, k, isaret);
  const v3 = desilProfili(temel, k, isaret);
  const kar = kararlilik(t.ic, t.tarih, isaret);
  const kesifIc = icSerisi(kesif, k);

  // §7 karar tablosu — kod sonuca bakmadan yazıldı
  const gaDisliyor = fin(ga.ga9833[0]!) && (ga.ga9833[0]! > 0 || ga.ga9833[1]! < 0);
  const isaretDogru = Math.sign(icTemel) === isaret;
  const isaretKorunuyor = Math.sign(icV1) === isaret && Math.sign(icV2) === isaret;
  // V3 "bilgi yalnız uç desilde mi": kötü uç desilin sapması, orta desillerin yayılımının 2 katından büyükse evet
  const iyiUc = isaret === 1 ? 9 : 0, kotuUc = isaret === 1 ? 0 : 9;
  const ortaDesiller = v3.desiller.filter((_, d) => d !== iyiUc && d !== kotuUc).map((x) => x.ortY);
  const ucAralik = Math.max(...ortaDesiller) - Math.min(...ortaDesiller);
  const ucFark = Math.abs(v3.desiller[kotuUc]!.ortY - ort(ortaDesiller));
  const yalnizUcDesil = ucFark > 2 * ucAralik;

  let karar: string;
  if (!gaDisliyor || !isaretDogru) karar = 'REDDEDİLDİ';
  else if (!isaretKorunuyor) karar = 'AÇIKLANDI';
  else if (!bar.gecti || yalnizUcDesil) karar = 'FEATURE';
  else karar = 'DOĞRULANDI';

  return {
    ozellik: ad, beklenenIsaret: isaret,
    r1_IC: { ic: icTemel, ga95: ga.ga95, ga9833: ga.ga9833, gun: t.ic.length, pozitifGun: t.ic.filter((x) => x > 0).length / Math.max(1, t.ic.length) },
    r2_saglamlik: {
      V1_sikiTemizlik: { ic: icV1, ga95: blokGA(a1.ic, 200 + k).ga95, gun: a1.ic.length },
      V2_kurusluk: { ic: icV2, ga95: blokGA(a2.ic, 300 + k).ga95, gun: a2.ic.length },
      isaretKorunuyor,
    },
    r3_desilProfili: { ...v3, yalnizUcDesil },
    r4_ekonomikBariyer: bar,
    r5_kararlilik: kar,
    KESIF_2026: { ic: ort(kesifIc.ic), gun: kesifIc.ic.length, not: 'KEŞİF — karara giremez (§8)' },
    KARAR: karar,
  };
});

let gitHash = ''; try { gitHash = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* yok */ }
let manifest: unknown = null; try { manifest = JSON.parse(fs.readFileSync(path.join(CACHE, '_manifest.json'), 'utf8')); } catch { /* yok */ }

const out = {
  spesifikasyon: 'DENEY-003 — ayrılmış dönem doğrulaması (kilit fe2cdf2)', gitHash, manifest,
  donem: [BAS, SON], cokluTest: 'Bonferroni α=0,05/3 → karar %98,33 GA ile',
  evren: { gun: temel.length, evrenMedyan: medyan(temel.map((g) => g.U.length)), V1gun: v1.length, V2gun: v2.length, kesifGun: kesif.length },
  sonuclar,
  uyari: 'Ayrılmış dönem bir kez kullanıldı. Bu dönem bundan sonra doğrulama için kullanılamaz.',
};
fs.mkdirSync(path.dirname(OUTFILE), { recursive: true });
fs.writeFileSync(OUTFILE, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
