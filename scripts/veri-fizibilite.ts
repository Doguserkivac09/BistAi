/**
 * VERİ FİZİBİLİTESİ — makro / temel / takas kaynaklarının ÖLÇÜMÜ (GO-NO GO).
 *
 * Fon motorundaki F0 ile aynı amaç: mimari tartışmasından ÖNCE "bu veri gerçekten
 * alınabiliyor mu, hangi granülaritede, ne kadar geriye?" sorusunu ölçmek.
 * Hiçbir şey varsayılmaz — yalnız gelen yanıt raporlanır.
 *
 * ⚠️ NEZAKET KURALLARI (TEFAS WAF dersi, CLAUDE.md):
 *  - İstekler SIRALI, her istek arası 1,5-3 sn jitterlı gecikme
 *  - Alan adı başına en fazla MAX_PER_HOST istek
 *  - 403/429/503 veya WAF imzası → O ALAN ADI İÇİN DERHAL DUR (devre kesici), asla retry
 *  - Toplam istek bütçesi sabit; betik kendi kendini sınırlar
 *  - Bu betik kullanıcının ev IP'sinden koşar → hacimli iş burada YAPILMAZ
 *
 * ⚠️ Bu bir ÖLÇÜM betiğidir, veri toplayıcı değildir. Sonuç yalnız rapordur.
 *
 *   npx tsx scripts/veri-fizibilite.ts [çıktı-json] [grup: hepsi|takas|makro|temel]
 */
import fs from 'node:fs';
import path from 'node:path';

const OUTFILE = process.argv[2] ?? 'veri-fizibilite-sonuc.json';
const GRUP = (process.argv[3] ?? 'hepsi') as 'hepsi' | 'takas' | 'makro' | 'temel' | 'kesif2';

const MAX_PER_HOST = 6;
const TOPLAM_BUTCE = 30;
const TIMEOUT_MS = 20_000;
const ORNEK_SEMBOL = 'GARAN';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const hostSayac = new Map<string, number>();
const bloklu = new Set<string>();
let toplam = 0;

const bekle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => 1500 + Math.random() * 1500;
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };

export interface Olcum {
  ad: string;
  grup: 'takas' | 'makro' | 'temel';
  url: string;
  durum: number | null;
  contentType: string | null;
  boyut: number | null;
  sure: number | null;
  /** Yanıtın gerçekten kullanılabilir veri taşıyıp taşımadığı — yalnız ölçüm, yorum değil. */
  ipucu: string;
  hata: string | null;
  ornek: string | null;
}

const sonuclar: Olcum[] = [];

/** Tek istek — devre kesici + bütçe + nezaket gecikmesi ile. */
async function olc(
  ad: string,
  grup: Olcum['grup'],
  url: string,
  opts: { referer?: string; json?: boolean } = {},
): Promise<{ ok: boolean; body: string }> {
  const host = hostOf(url);
  const bos = { ok: false, body: '' };

  if (bloklu.has(host)) {
    sonuclar.push({ ad, grup, url, durum: null, contentType: null, boyut: null, sure: null, ipucu: 'ATLANDI — alan adı engelli (devre kesici)', hata: null, ornek: null });
    return bos;
  }
  if ((hostSayac.get(host) ?? 0) >= MAX_PER_HOST) {
    sonuclar.push({ ad, grup, url, durum: null, contentType: null, boyut: null, sure: null, ipucu: `ATLANDI — ${host} için istek sınırı (${MAX_PER_HOST})`, hata: null, ornek: null });
    return bos;
  }
  if (toplam >= TOPLAM_BUTCE) {
    sonuclar.push({ ad, grup, url, durum: null, contentType: null, boyut: null, sure: null, ipucu: 'ATLANDI — toplam bütçe doldu', hata: null, ornek: null });
    return bos;
  }

  hostSayac.set(host, (hostSayac.get(host) ?? 0) + 1);
  toplam++;
  await bekle(jitter());

  const t0 = Date.now();
  const ctrl = new AbortController();
  const zamanlayici = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': UA,
        Accept: opts.json ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        ...(opts.referer ? { Referer: opts.referer } : {}),
      },
    });
    const ct = res.headers.get('content-type');
    const body = await res.text();
    const sure = Date.now() - t0;

    // Devre kesici: engel imzası → bu alan adına bir daha DOKUNMA
    const wafImza = /cloudflare|access denied|forbidden|<title>\s*40[13]|captcha|incapsula|waf/i.test(body.slice(0, 2000));
    if (res.status === 403 || res.status === 429 || res.status === 503 || (res.status >= 400 && wafImza)) {
      bloklu.add(host);
      sonuclar.push({ ad, grup, url, durum: res.status, contentType: ct, boyut: body.length, sure, ipucu: `ENGEL — ${host} devre kesiciye alındı, bu koşuda bir daha denenmeyecek`, hata: null, ornek: body.slice(0, 200) });
      return bos;
    }

    let ipucu: string;
    if (!res.ok) ipucu = `HTTP ${res.status}`;
    else if (body.trim().length === 0) ipucu = 'BOŞ yanıt (200 ama içerik yok)';
    else if (opts.json) {
      try {
        const j = JSON.parse(body) as unknown;
        const n = Array.isArray(j) ? j.length : typeof j === 'object' && j ? Object.keys(j as object).length : 0;
        ipucu = `JSON ayrıştı — ${Array.isArray(j) ? `${n} kayıt` : `${n} alan`}`;
      } catch { ipucu = 'JSON DEĞİL (muhtemelen HTML/hata sayfası)'; }
    } else ipucu = `HTML/metin ${body.length} bayt`;

    sonuclar.push({ ad, grup, url, durum: res.status, contentType: ct, boyut: body.length, sure, ipucu, hata: null, ornek: body.slice(0, 300).replace(/\s+/g, ' ') });
    return { ok: res.ok && body.trim().length > 0, body };
  } catch (e) {
    sonuclar.push({ ad, grup, url, durum: null, contentType: null, boyut: null, sure: Date.now() - t0, ipucu: 'İSTEK BAŞARISIZ', hata: e instanceof Error ? e.message : String(e), ornek: null });
    return bos;
  } finally {
    clearTimeout(zamanlayici);
  }
}

// ── TAKAS ────────────────────────────────────────────────────────────────
/**
 * Strateji: endpoint adı TAHMİN EDİLMEZ. Önce İş Yatırım'ın takas sayfası çekilir,
 * HTML'inden gerçek veri uçları (Data.aspx/..., .ashx, /api/...) regex ile çıkarılır,
 * sonra bulunanlardan en fazla 2 tanesi örnek sembolle denenir.
 */
async function takasProbu() {
  const sayfa = 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/Takas-Analizi.aspx';
  const { ok, body } = await olc('İş Yatırım — Takas Analizi sayfası (uç keşfi)', 'takas', sayfa);

  let kesfedilen: string[] = [];
  if (ok) {
    const bulunan = new Set<string>();
    for (const re of [/Data\.aspx\/[A-Za-z0-9_]+/g, /\/[A-Za-z0-9_./-]+\.ashx[A-Za-z0-9_?=&.-]*/g, /"\/?api\/[A-Za-z0-9_./-]+"/g]) {
      for (const m of body.match(re) ?? []) bulunan.add(m.replace(/"/g, ''));
    }
    kesfedilen = [...bulunan];
    sonuclar.push({
      ad: 'İş Yatırım — sayfadan keşfedilen uçlar', grup: 'takas', url: sayfa,
      durum: 200, contentType: null, boyut: null, sure: null,
      ipucu: kesfedilen.length ? `${kesfedilen.length} aday uç bulundu` : 'HTML içinde veri ucu bulunamadı (muhtemelen JS bundle içinde)',
      hata: null, ornek: kesfedilen.slice(0, 12).join(' | ') || null,
    });

    // Keşfedilen Data.aspx uçlarından en fazla 2'sini örnek sembolle dene
    const denenecek = kesfedilen.filter((u) => u.includes('Data.aspx/')).slice(0, 2);
    for (const uc of denenecek) {
      const url = `https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/${uc}?hisse=${ORNEK_SEMBOL}&startdate=01-08-2026&enddate=10-09-2026`;
      await olc(`İş Yatırım — keşfedilen uç: ${uc}`, 'takas', url, { json: true, referer: sayfa });
    }
  }

  // Bağımsız ikinci kaynak: MKK (resmî saklama kuruluşu) — yalnız erişilebilirlik ölçümü
  await olc('MKK — ana sayfa erişilebilirlik', 'takas', 'https://www.mkk.com.tr/');
  // Üçüncü: Borsa İstanbul veri mağazası (ücretli olabilir, ölçülecek)
  await olc('Borsa İstanbul — datastore erişilebilirlik', 'takas', 'https://datastore.borsaistanbul.com/');
}

// ── MAKRO ────────────────────────────────────────────────────────────────
async function makroProbu() {
  // Zaten kullandığımız kaynakların HÂLÂ çalıştığının doğrulanması
  await olc('TCMB EVDS (bilinen 302 — yeniden ölçüm)', 'makro', 'https://evds2.tcmb.gov.tr/service/evds/series=TP.FG.J0/type=json');
  await olc('TradingEconomics — TR (kullanımda, scrape)', 'makro', 'https://tradingeconomics.com/turkey/interest-rate');
  const fredKey = process.env.FRED_API_KEY;
  if (fredKey) {
    await olc('FRED — seri çekimi (anahtarlı)', 'makro', `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${fredKey}&file_type=json&limit=5&sort_order=desc`, { json: true });
  } else {
    sonuclar.push({ ad: 'FRED', grup: 'makro', url: '—', durum: null, contentType: null, boyut: null, sure: null, ipucu: 'ATLANDI — FRED_API_KEY tanımsız', hata: null, ornek: null });
  }
  // Yeni aday: Dünya Bankası (anahtarsız, uzun geçmiş)
  await olc('Dünya Bankası — TR göstergeleri (anahtarsız)', 'makro', 'https://api.worldbank.org/v2/country/TR/indicator/FP.CPI.TOTL.ZG?format=json&per_page=5', { json: true });
  // Yeni aday: TÜİK
  await olc('TÜİK — erişilebilirlik', 'makro', 'https://data.tuik.gov.tr/');
}

// ── TEMEL ────────────────────────────────────────────────────────────────
async function temelProbu() {
  // Kullanımdaki uç — ne kadar geriye gidiyor, açıklanma tarihi taşıyor mu?
  await olc(
    'İş Yatırım — MaliTablo (kullanımda)', 'temel',
    `https://www.isyatirim.com.tr/_layouts/15/Isyatirim.Website/Common/Data.aspx/MaliTablo?companyCode=${ORNEK_SEMBOL}&exchange=TRY&financialGroup=UFRS_K&year1=2025&period1=12&year2=2024&period2=12&year3=2023&period3=12&year4=2022&period4=12`,
    { json: true },
  );
  // KAP (bilinen engel — yeniden ölçüm; açıklanma TARİHİ yalnız burada var)
  await olc('KAP — bildirim listesi (bilinen engel, yeniden ölçüm)', 'temel', 'https://www.kap.org.tr/tr/bist-sirketler');
}

// ── 2. TUR — 1. turun bulgularını derinleştirir ──────────────────────────
/** Bir gövdede aranan desenlerin KAÇ KEZ geçtiğini raporlar (yorum değil, sayım). */
function icerikDenetimi(ad: string, grup: Olcum['grup'], url: string, body: string, desenler: Record<string, RegExp>) {
  const bulgu = Object.entries(desenler).map(([k, re]) => `${k}=${(body.match(re) ?? []).length}`).join(' · ');
  sonuclar.push({ ad, grup, url, durum: 200, contentType: null, boyut: body.length, sure: null, ipucu: `içerik sayımı: ${bulgu}`, hata: null, ornek: null });
}

async function kesif2() {
  // (a) İş Yatırım: 1. turda sayfa adresi 404 verdi → doğru adresi ARAYARAK bul
  const index = 'https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/default.aspx';
  const r1 = await olc('İş Yatırım — hisse analiz dizini (takas bağlantısı arama)', 'takas', index);
  if (r1.ok) {
    const linkler = [...new Set((r1.body.match(/href="[^"]*"/gi) ?? []).filter((h) => /takas|yabanci|saklama/i.test(h)))];
    sonuclar.push({
      ad: 'İş Yatırım — dizinde bulunan takas bağlantıları', grup: 'takas', url: index,
      durum: 200, contentType: null, boyut: null, sure: null,
      ipucu: linkler.length ? `${linkler.length} bağlantı` : 'takas/yabancı/saklama geçen bağlantı YOK',
      hata: null, ornek: linkler.slice(0, 10).join(' | ') || null,
    });
    for (const h of linkler.slice(0, 2)) {
      const yol = h.replace(/^href="|"$/g, '');
      const url = yol.startsWith('http') ? yol : `https://www.isyatirim.com.tr${yol.startsWith('/') ? '' : '/'}${yol}`;
      const r = await olc(`İş Yatırım — bulunan sayfa: ${yol.slice(0, 60)}`, 'takas', url, { referer: index });
      if (r.ok) {
        icerikDenetimi(`↳ içerik denetimi: ${yol.slice(0, 50)}`, 'takas', url, r.body, {
          DataAspxUc: /Data\.aspx\/[A-Za-z0-9_]+/g,
          ashxUc: /\.ashx/g,
          takasKelime: /takas/gi,
          yabanciKelime: /yabanc/gi,
        });
      }
    }
  }

  // (b) KAP: 1. turda 200 + 1,5 MB döndü (CLAUDE.md "bloklu" diyor) → GERÇEKTEN veri var mı?
  const kapUrl = 'https://www.kap.org.tr/tr/bildirim-sorgu';
  const r2 = await olc('KAP — bildirim sorgu sayfası (engel iddiasının yeniden ölçümü)', 'temel', kapUrl);
  if (r2.ok) {
    icerikDenetimi('↳ KAP içerik denetimi (bildirim + ZAMAN DAMGASI var mı?)', 'temel', kapUrl, r2.body, {
      nextData: /__NEXT_DATA__|self\.__next_f/g,
      tarihDamgasi: /\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}/g,
      isoTarih: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g,
      bistKodu: /"[A-Z]{4,5}"/g,
      bildirimKelime: /bildirim/gi,
    });
  }

  // (c) MKK: veri ucu var mı — ana sayfada arama (yalnız keşif, istek YOK)
  const mkk = 'https://www.mkk.com.tr/';
  const r3 = await olc('MKK — veri ucu keşfi', 'takas', mkk);
  if (r3.ok) {
    icerikDenetimi('↳ MKK içerik denetimi', 'takas', mkk, r3.body, {
      apiUc: /\/api\/[A-Za-z0-9_./-]+/g,
      jsonUc: /\.json/g,
      yatirimciKelime: /yatırımc|yatirimc/gi,
      veriKelime: /veri|rapor|istatistik/gi,
    });
  }
}

async function main() {
  console.log(`Veri fizibilitesi — grup: ${GRUP}, bütçe: ${TOPLAM_BUTCE} istek, host başına ${MAX_PER_HOST}\n`);
  if (GRUP === 'kesif2') { await kesif2(); }
  if (GRUP === 'hepsi' || GRUP === 'takas') await takasProbu();
  if (GRUP === 'hepsi' || GRUP === 'makro') await makroProbu();
  if (GRUP === 'hepsi' || GRUP === 'temel') await temelProbu();

  for (const s of sonuclar) {
    console.log(`[${s.grup.toUpperCase()}] ${s.ad}`);
    console.log(`   ${s.durum ?? '—'} · ${s.ipucu}${s.sure ? ` · ${s.sure} ms` : ''}`);
    if (s.hata) console.log(`   hata: ${s.hata}`);
    if (s.ornek) console.log(`   örnek: ${s.ornek.slice(0, 220)}`);
    console.log('');
  }

  const rapor = {
    calistirma: new Date().toISOString(),
    grup: GRUP,
    toplamIstek: toplam,
    blokluHostlar: [...bloklu],
    sonuclar,
    not: 'ÖLÇÜM raporudur. "Çalışıyor" demek "veri kaliteli/geçmişe dönük" demek DEĞİLDİR; derinlik ve açıklanma tarihi ayrıca ölçülür.',
  };
  fs.mkdirSync(path.dirname(path.resolve(OUTFILE)), { recursive: true });
  fs.writeFileSync(OUTFILE, JSON.stringify(rapor, null, 2));
  console.log(`→ ${OUTFILE}  (${toplam} istek, engellenen host: ${bloklu.size})`);
}

void main();
