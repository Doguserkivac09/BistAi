/**
 * YABANCI ORANI — KAPSAM ÖLÇÜMÜ (GO / NO-GO kapısı).
 *
 * Tek soru: İş Yatırım'ın günlük "Yabancı Oranları" yazısı TÜM EVRENİ mi veriyor,
 * yoksa yalnız "en çok artan/azalan" top-N listesi mi?
 *
 * Neden kritik: top-N listesi seçilmiş bir alt kümedir → o listeyle kurulan her sinyal
 * hayatta kalan/uç gözlem yanlılığı taşır. Kapsam düşükse bu kaynak KULLANILAMAZ.
 * Karar eşiği ÖLÇÜMDEN ÖNCE yazılır (sonuca bakıp eşik değiştirme yasağı — DENEY disiplini):
 *
 *   kapsam ≥ %80  → GO      (evren tablosu; günlük kayda başlanabilir)
 *   %40 – %80     → KISMİ   (yanlılık ölçülmeden kullanılmaz)
 *   < %40         → NO-GO   (top-N listesi; bu kaynak bırakılır)
 *
 * ⚠️ NEZAKET: 3 istek, sıralı, jitterlı gecikme, engel görürse durur (TEFAS WAF dersi).
 * ⚠️ Bu bir ÖLÇÜM betiğidir — veri toplamaz, hiçbir şey yayımlamaz.
 *
 *   npx tsx scripts/yabanci-oran-kapsam.ts [çıktı-json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { BIST_SYMBOLS } from '../types/index';

const OUTFILE = process.argv[2] ?? 'yabanci-oran-kapsam.json';
const KATEGORI = 'https://arastirma.isyatirim.com.tr/category/gunluk-raporlar/gunluk-yabanci-oranlari/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_YAZI = 2;

// Eşikler ölçümden ÖNCE sabit
const GO_ESIK = 0.80, KISMI_ESIK = 0.40;

const evren = new Set(BIST_SYMBOLS.map((s) => s.replace('.IS', '').toUpperCase()));
const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cek(url: string, referer?: string): Promise<string | null> {
  await bekle(1500 + Math.random() * 1500);
  const ctrl = new AbortController();
  const zc = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'tr-TR,tr;q=0.9', ...(referer ? { Referer: referer } : {}) },
    });
    const body = await res.text();
    if (res.status === 403 || res.status === 429 || res.status === 503) {
      console.error(`ENGEL (${res.status}) → duruluyor, retry YOK.`);
      return null;
    }
    if (!res.ok) { console.error(`HTTP ${res.status} — ${url}`); return null; }
    return body;
  } catch (e) {
    console.error(`İstek başarısız: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  } finally { clearTimeout(zc); }
}

/** HTML'den metin — etiketleri at, boşlukları normalize et. */
function metin(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Metindeki BIST sembollerini ve bps/oran sayılarını çıkarır. */
function ayristir(txt: string) {
  const kodlar = new Set<string>();
  for (const m of txt.match(/\b[A-ZÇĞİÖŞÜ]{4,5}\b/g) ?? []) {
    const k = m.toUpperCase();
    if (evren.has(k)) kodlar.add(k);
  }
  const bps = (txt.match(/[+-]?\d+([.,]\d+)?\s*bps/gi) ?? []).length;
  const yuzde = (txt.match(/%\s*\d+([.,]\d+)?/g) ?? []).length;
  return { kodlar: [...kodlar], bps, yuzde };
}

async function main() {
  console.log(`Evren: ${evren.size} BIST sembolü · eşikler GO ≥ %${GO_ESIK * 100}, NO-GO < %${KISMI_ESIK * 100}\n`);

  const kat = await cek(KATEGORI);
  if (!kat) { console.error('Kategori sayfası alınamadı — ölçüm yapılamadı.'); process.exit(1); }

  // Yazı bağlantılarını çıkar (kategori sayfasındaki gönderi linkleri)
  const hepsi = [...new Set(kat.match(/https:\/\/arastirma\.isyatirim\.com\.tr\/[A-Za-z0-9\-_/.]+/g) ?? [])];
  const linkler = hepsi.filter((u) =>
    !/\/(category|tag|author|feed|page)\//.test(u) &&
    !/wp-content|wp-includes|wp-json/.test(u) &&
    !/\.(jpg|jpeg|png|gif|svg|ico|css|js|xml|webp)$/i.test(u) &&
    u.split('/').filter(Boolean).length > 3,
  );
  // Yabancı oranı yazıları önce denensin (slug'da geçiyorsa)
  linkler.sort((a, b) => Number(/yabanc/i.test(b)) - Number(/yabanc/i.test(a)));
  console.log(`Kategori sayfasında ${linkler.length} aday yazı bağlantısı bulundu.\n`);

  const yazilar: Array<{ url: string; kodSayisi: number; kapsam: number; bps: number; yuzde: number; uzunluk: number; ornekKodlar: string[] }> = [];
  for (const url of linkler.slice(0, MAX_YAZI)) {
    const html = await cek(url, KATEGORI);
    if (!html) continue;
    const txt = metin(html);
    const { kodlar, bps, yuzde } = ayristir(txt);
    const kapsam = kodlar.length / evren.size;
    yazilar.push({ url, kodSayisi: kodlar.length, kapsam, bps, yuzde, uzunluk: txt.length, ornekKodlar: kodlar.slice(0, 15) });
    console.log(`${url}`);
    console.log(`   metin ${txt.length} karakter · BIST kodu ${kodlar.length} · kapsam %${(kapsam * 100).toFixed(1)} · bps ${bps} · % ${yuzde}`);
    console.log(`   örnek kodlar: ${kodlar.slice(0, 15).join(', ') || '—'}\n`);
  }

  const enIyi = yazilar.length ? Math.max(...yazilar.map((y) => y.kapsam)) : 0;
  const karar = enIyi >= GO_ESIK ? 'GO' : enIyi >= KISMI_ESIK ? 'KISMİ' : 'NO-GO';
  console.log(`\n=== KAPSAM KARARI: ${karar} (en iyi kapsam %${(enIyi * 100).toFixed(1)}) ===`);
  if (karar === 'NO-GO') console.log('→ Yazı tam evren tablosu DEĞİL. Bu kaynak günlük hisse-bazlı seri için kullanılamaz.');
  if (karar === 'KISMİ') console.log('→ Seçilmiş alt küme olma ihtimali yüksek; yanlılık ölçülmeden kullanılmaz.');
  if (karar === 'GO') console.log('→ Evren tablosu; günlük anlık görüntü kaydına başlanabilir.');

  const rapor = { calistirma: new Date().toISOString(), kaynak: KATEGORI, evrenBoyu: evren.size, esikler: { GO_ESIK, KISMI_ESIK }, yazilar, enIyiKapsam: enIyi, KARAR: karar };
  fs.mkdirSync(path.dirname(path.resolve(OUTFILE)), { recursive: true });
  fs.writeFileSync(OUTFILE, JSON.stringify(rapor, null, 2));
  console.log(`\n→ ${OUTFILE}`);
}

void main();
