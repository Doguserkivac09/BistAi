/**
 * KAP (Kamuyu Aydınlatma Platformu) veri çekme
 *
 * kap.org.tr'nin public JSON API'sini kullanır.
 * Resmi şirket bildirimleri: finansal tablo, özel durum, genel kurul, vb.
 *
 * Step 8 — Sonnet kısmı (veri çekme altyapısı, AI özetleme Opus bekliyor)
 */

const KAP_BASE = 'https://www.kap.org.tr';
const CACHE_TTL = 15 * 60 * 1000; // 15 dakika

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface KapRawItem {
  disclosureIndex?: number;
  id?: number;
  memberTitle?: string;
  companyName?: string;
  stockCodes?: string[];
  symbols?: string[];
  title?: string;
  subject?: string;
  disclosureType?: string;
  category?: string;
  publishDate?: string;
  date?: string;
}

export interface KapDuyuru {
  id: number;
  sirket: string;       // Şirket adı
  sembol: string;       // Borsa kodu (THYAO, GARAN...)
  baslik: string;       // Bildirim başlığı
  kategori: string;     // ÖDA, FR, FN, GK, vb.
  kategoriAdi: string;  // Türkçe kategori adı
  tarih: string;        // ISO tarih
  url: string;          // kap.org.tr duyuru linki
}

// KAP kategori kodları → Türkçe
const KATEGORI_ADLARI: Record<string, string> = {
  'ÖDA':   'Özel Durum',
  'FR':    'Finansal Rapor',
  'FN':    'Finansal Tablo',
  'GK':    'Genel Kurul',
  'BDDK':  'BDDK',
  'SPK':   'SPK Bildirimi',
  'IHRAÇ': 'İhraç',
  'DİĞER': 'Diğer',
};

function kategoriAdi(kod: string): string {
  for (const [key, val] of Object.entries(KATEGORI_ADLARI)) {
    if (kod?.toUpperCase().includes(key)) return val;
  }
  return kod ?? 'Diğer';
}

// ─── Basit in-memory cache ────────────────────────────────────────────────────

let cache: { data: KapDuyuru[]; ts: number } | null = null;
const symbolCache = new Map<string, { data: KapDuyuru[]; ts: number }>();

// ─── API çağrısı ──────────────────────────────────────────────────────────────

/**
 * KAP'tan son duyuruları çeker.
 * kap.org.tr API'si public; authentication gerektirmez.
 */
export async function fetchKapDuyurular(limit = 50): Promise<KapDuyuru[]> {
  // Cache kontrolü
  if (cache && Date.now() - cache.ts < CACHE_TTL) return cache.data.slice(0, limit);

  try {
    const url = `${KAP_BASE}/api/disclosures?type=ALL&top=${limit}&from=0`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.kap.org.tr/',
        'User-Agent': 'Mozilla/5.0 (compatible; Investable Edge/1.0)',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`KAP API ${res.status}`);

    const raw: KapRawItem[] = await res.json();

    const duyurular: KapDuyuru[] = raw.map((item) => ({
      id:          item.disclosureIndex ?? item.id ?? 0,
      sirket:      item.memberTitle ?? item.companyName ?? '',
      sembol:      (item.stockCodes ?? item.symbols ?? [''])[0] ?? '',
      baslik:      item.title ?? item.subject ?? '',
      kategori:    item.disclosureType ?? item.category ?? '',
      kategoriAdi: kategoriAdi(item.disclosureType ?? item.category ?? ''),
      tarih:       item.publishDate ?? item.date ?? '',
      url:         item.disclosureIndex
        ? `${KAP_BASE}/tr/Bildirim/${item.disclosureIndex}`
        : `${KAP_BASE}/tr/bildirim-sorgu/`,
    }));

    cache = { data: duyurular, ts: Date.now() };
    return duyurular;
  } catch {
    // API başarısız → mevcut cache'i döndür ya da boş liste
    return cache?.data ?? [];
  }
}

/**
 * Belirli bir BIST sembolü için KAP duyurularını çeker.
 */
export async function fetchKapBySembol(sembol: string, limit = 20): Promise<KapDuyuru[]> {
  const key = sembol.toUpperCase();
  const c = symbolCache.get(key);
  if (c && Date.now() - c.ts < CACHE_TTL) return c.data.slice(0, limit);

  try {
    // Önce tüm duyurulardan filtrele (global fetch'ten yararlan)
    const all = await fetchKapDuyurular(200);
    const filtered = all.filter(d => d.sembol.toUpperCase() === key);

    if (filtered.length >= 3) {
      symbolCache.set(key, { data: filtered, ts: Date.now() });
      return filtered.slice(0, limit);
    }

    // Yeterli sonuç yoksa sembol-spesifik sorgu
    const url = `${KAP_BASE}/api/disclosures/member/${encodeURIComponent(key)}?top=${limit}&from=0`;
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.kap.org.tr/',
        'User-Agent': 'Mozilla/5.0 (compatible; Investable Edge/1.0)',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return filtered;

    const raw: KapRawItem[] = await res.json();
    const duyurular: KapDuyuru[] = raw.map((item) => ({
      id:          item.disclosureIndex ?? 0,
      sirket:      item.memberTitle ?? '',
      sembol:      key,
      baslik:      item.title ?? item.subject ?? '',
      kategori:    item.disclosureType ?? '',
      kategoriAdi: kategoriAdi(item.disclosureType ?? ''),
      tarih:       item.publishDate ?? '',
      url:         `${KAP_BASE}/tr/Bildirim/${item.disclosureIndex}`,
    }));

    symbolCache.set(key, { data: duyurular, ts: Date.now() });
    return duyurular;
  } catch {
    return symbolCache.get(key)?.data ?? [];
  }
}
