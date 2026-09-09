/**
 * Fon veri katmanı — KAYNAK-AGNOSTİK arayüz (FON-ANALIZ-PLAN FAZ F1).
 *
 * `lib/viop-data.ts` deseni: motor kaynağı GÖRMEZ. Bugün TEFAS, yarın başka bir
 * kaynak takılırsa yalnız BU dosya değişir.
 *
 * ── F0 spike'ında ÖLÇÜLEN sınırlar (tahmin değil, canlı istekle doğrulandı) ──
 *  1. Eski `/api/DB/BindHistoryInfo` KAPATILMIŞ (`ERR-006`); yeni uç `/api/funds/*`.
 *  2. HTML sayfaları F5/Shape WAF arkasında ama JSON API sunucudan erişilebiliyor.
 *  3. **Tarih penceresi ≤ ~31 gün** — 45 gün ve üstü BOŞ döner (hata değil, sessiz boş!)
 *     → uzun geçmiş parçalı çekilmek ZORUNDA. Bu sessiz davranış tehlikeli: tek istekle
 *     "veri yok" sanıp fonu elemek mümkündü.
 *  4. **Hız sınırı gerçek:** arka arkaya hızlı istekte HTTP 429. Ölçüm: 2 sn aralıkla
 *     8/8 başarılı. (İş Yatırım dersi: kaynak nazik davranmayı ödüllendiriyor.)
 *  5. Sayfa boyutu `bitSira: 500` çalışıyor → tüm evren tek tarih için ~5 istek.
 */

import { UNIVERSE_TO_FONTIPI, guessAccessibility, type FundUniverse } from './fund-universe';

const BASE = 'https://www.tefas.gov.tr';
/** Web istemcisinin gömülü sabit token'ı (F0'da gözlendi). Değişirse tek yerde güncellenir. */
const TOKEN = 'Bearer ST-tefaswebwse3irfmSBj4iRAzGPbAlS94Se';
const UA = 'Mozilla/5.0 (compatible; Investable Edge/1.0)';

/** Kaynağın sessizce boş döndüğü sınır — ÖLÇÜLDÜ (45g boş, 31g dolu). Marjla 28 gün. */
export const MAX_WINDOW_DAYS = 28;
/** Ölçülen güvenli aralık: 2 sn'de 8/8 başarılı. */
export const POLITE_DELAY_MS = 2200;
/**
 * Sayfa boyutu. **ÖLÇÜLDÜ (2026-09-09):** `bitSira=2500` tüm evreni (2.041 fon)
 * TEK istekte döndürüyor (1,4 sn). Önceki 500 değeri gün başına **5 istek**
 * demekti ve asıl darboğaz buydu — TEFAS sürekli sayfalamada 429 veriyor.
 *
 * Yanlış teşhis uyarısı: bu 429'lar önce "Vercel IP'si engelleniyor" sanıldı;
 * yerel backfill de aynı hatayı alınca gerçek neden ortaya çıktı — HOST değil
 * İSTEK HACMİ. 5 istek → 1 istek, yani %80 azalma.
 */
export const MAX_PAGE_SIZE = 2500;

export interface FundDailyRow {
  code: string;
  name: string;
  /** ISO tarih (YYYY-MM-DD) */
  date: string;
  /** Birim pay değeri (TL) */
  price: number;
  /** Tedavüldeki pay adedi — AKIM analizinin tek doğru kaynağı (bkz. fund-flows) */
  shares: number | null;
  /** Yatırımcı sayısı */
  investors: number | null;
  /** Fon toplam değeri (TL) */
  size: number | null;
}

export interface FundDataResult<T> {
  data: T;
  /** Kaynağın verdiği en güncel tarih */
  asOf: string | null;
  dataQuality: 'tam' | 'kısmi' | 'yok';
  /** Eksiklik varsa dürüst açıklama (UI bunu gösterebilir) */
  note?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

/** TEFAS `2026-09-08` döndürüyor; yine de savunmacı normalize et. */
function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const iso = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface RawRow {
  fonKodu?: string; fonUnvan?: string; tarih?: string;
  fiyat?: number; tedPaySayisi?: number; kisiSayisi?: number; portfoyBuyukluk?: number;
}

/**
 * Tek API çağrısı — 429'da üstel geri çekilmeyle yeniden dener.
 * 429 sessizce yutulmaz: tüm denemeler tükenirse hata fırlatır ki çağıran
 * "veri yok" ile "kaynak bizi reddetti"yi karıştırmasın.
 */
async function callTefas(endpoint: string, payload: unknown, retries = 3): Promise<unknown> {
  let lastErr: string = 'bilinmeyen';
  let rateLimited = false;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // 429 için AYRI (çok daha cömert) bekleme: ölçümde ~40 sn sonra kova
      // doluyor; eski 4,4/8,8/17,6 sn yetmiyor ve gün "boş" sanılıp
      // kaydediliyordu (canlıda 8 Ağustos günü böyle kayboldu).
      await sleep(rateLimited ? 20_000 * attempt : POLITE_DELAY_MS * 2 ** attempt);
    }
    try {
      const res = await fetch(`${BASE}/api/funds/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: TOKEN,
          'x-request-id': crypto.randomUUID(),
          'User-Agent': UA,
          Accept: 'application/json',
          Referer: `${BASE}/tr/fon-verileri`,
          Origin: BASE,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 429) { lastErr = 'hız sınırı (429)'; rateLimited = true; continue; }
      if (!res.ok) { lastErr = `HTTP ${res.status}`; continue; }
      return await res.json();
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`TEFAS ${endpoint} başarısız: ${lastErr}`);
}

function toRows(json: unknown): { rows: FundDailyRow[]; total: number } {
  const j = json as { resultList?: RawRow[]; toplamSayi?: number } | null;
  const list = j?.resultList ?? [];
  const rows: FundDailyRow[] = [];
  for (const r of list) {
    const date = normalizeDate(r.tarih);
    const price = num(r.fiyat);
    // Fiyatsız satır METRİK ÜRETEMEZ → sessizce 0 sayılmaz, tamamen düşürülür.
    if (!r.fonKodu || !date || price == null || price <= 0) continue;
    rows.push({
      code: r.fonKodu,
      name: r.fonUnvan ?? r.fonKodu,
      date,
      price,
      shares: num(r.tedPaySayisi),
      investors: num(r.kisiSayisi),
      size: num(r.portfoyBuyukluk),
    });
  }
  return { rows, total: j?.toplamSayi ?? rows.length };
}

function basePayload(universe: FundUniverse) {
  return {
    fonTipi: UNIVERSE_TO_FONTIPI[universe],
    fonKodu: null as string | null,
    aramaMetni: null,
    fonTurKod: null,
    fonGrubu: null,
    sfonTurKod: null as number | null,
    fonTurAciklama: null,
    dil: 'TR',
    kurucuKod: null,
    sira: null,
    yon: null,
  };
}

/**
 * Belirli bir GÜN için evrenin tamamı (sayfalanır).
 * Günlük artımlı güncellemenin ana yolu: ~5 istek / gün.
 */
export async function listFundsOnDate(
  universe: FundUniverse,
  date: Date,
  opts: { sfonTurKod?: number | null; maxPages?: number } = {},
): Promise<FundDataResult<FundDailyRow[]>> {
  const d = ymd(date);
  const out: FundDailyRow[] = [];
  let total = Infinity;
  const maxPages = opts.maxPages ?? 20;

  for (let page = 0; page < maxPages && out.length < total; page++) {
    if (page > 0) await sleep(POLITE_DELAY_MS);
    const json = await callTefas('fonGnlBlgSiraliGetir', {
      ...basePayload(universe),
      sfonTurKod: opts.sfonTurKod ?? null,
      basTarih: d,
      bitTarih: d,
      basSira: page * MAX_PAGE_SIZE + 1,
      bitSira: (page + 1) * MAX_PAGE_SIZE,
    });
    const { rows, total: t } = toRows(json);
    total = t;
    if (rows.length === 0) break;
    out.push(...rows);
  }

  return {
    data: out,
    asOf: out[0]?.date ?? null,
    dataQuality: out.length === 0 ? 'yok' : out.length >= total ? 'tam' : 'kısmi',
    note: out.length && out.length < total ? `${total} fonun ${out.length} tanesi alındı (sayfa sınırı)` : undefined,
  };
}

/**
 * Tek fonun geçmiş serisi. Pencere sınırı (≤28 gün) yüzünden PARÇALI çeker.
 *
 * ⚠️ Kaynak, pencere aşılınca hata değil BOŞ döndürüyor. Parçalamayı kaldıran
 * bir "sadeleştirme" sessizce tüm geçmişi kaybettirir — bu yorum onun için var.
 */
export async function getFundHistory(
  universe: FundUniverse,
  code: string,
  from: Date,
  to: Date = new Date(),
): Promise<FundDataResult<FundDailyRow[]>> {
  const chunks: Array<[Date, Date]> = [];
  let cursor = new Date(from);
  while (cursor < to) {
    const end = new Date(Math.min(cursor.getTime() + MAX_WINDOW_DAYS * 86_400_000, to.getTime()));
    chunks.push([new Date(cursor), end]);
    cursor = new Date(end.getTime() + 86_400_000);
  }

  const seen = new Map<string, FundDailyRow>();
  let failed = 0;
  for (const [i, [bas, bit]] of chunks.entries()) {
    if (i > 0) await sleep(POLITE_DELAY_MS);
    try {
      const json = await callTefas('fonGnlBlgSiraliGetir', {
        ...basePayload(universe),
        fonKodu: code,
        basTarih: ymd(bas),
        bitTarih: ymd(bit),
        basSira: 1,
        bitSira: MAX_PAGE_SIZE,
      });
      for (const r of toRows(json).rows) seen.set(r.date, r);
    } catch {
      failed++; // tek parçanın kaybı seriyi tamamen çöpe atmaz, ama RAPORLANIR
    }
  }

  const rows = [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    data: rows,
    asOf: rows.at(-1)?.date ?? null,
    dataQuality: rows.length === 0 ? 'yok' : failed > 0 ? 'kısmi' : 'tam',
    note: failed > 0 ? `${chunks.length} dönemin ${failed} tanesi alınamadı — seri eksik` : undefined,
  };
}

/** Kategori bazında fon kodları — kategori alanı satırlarda gelmiyor, filtreyle türetilir. */
export async function listFundCodesByCategory(
  universe: FundUniverse,
  sfonTurKod: number,
  date: Date,
): Promise<string[]> {
  const res = await listFundsOnDate(universe, date, { sfonTurKod, maxPages: 6 });
  return res.data.map((r) => r.code);
}

/** Fon adından türetilen erişilebilirlik — kaynağıyla birlikte (tahmin olduğu gizlenmez). */
export const accessibilityOf = guessAccessibility;
