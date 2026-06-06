/**
 * Haber katalisti — bir hisse için "yeni iş anlaşması" sinyali.
 *
 * Gerçek sipariş defteri (bakiye sipariş) Yahoo'da yok; KAP/IR'de. Proxy olarak
 * canlı Türkçe RSS haberlerinde şirket adı + sözleşme/ihale/sipariş türü
 * kelimeleri arar. Tek başına kanıt değil, ileriye-dönük katalist ipucudur.
 */

export interface CatalystNews {
  baslik: string
  link: string
  tarih: string
  kaynak: string
}

const DEAL_KEYWORDS = [
  'sözleşme', 'ihale', 'sipariş', 'anlaşma', 'kontrat', 'ihracat',
  'imzala', 'teslim', 'mutabakat', 'iş birliği', 'işbirliği', 'tedarik',
  'proje kazan', 'yeni iş', 'bağlantı',
]

const RSS_FEEDS = [
  'https://www.ntv.com.tr/ekonomi.rss',
  'https://www.hurriyet.com.tr/rss/ekonomi',
  'https://ekonomi.haber7.com/rss.xml',
]

const UA = 'Mozilla/5.0 (compatible; BistAI/1.0)'

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/<[^>]*>/g, '').trim()
}

function parseItems(xml: string): CatalystNews[] {
  const out: CatalystNews[] = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const b = m[1] ?? ''
    const baslik = decode(
      (b.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ?? b.match(/<title>([\s\S]*?)<\/title>/))?.[1] ?? '',
    )
    const link = (b.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() ?? ''
    const tarih = (() => {
      const raw = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? ''
      try { return raw ? new Date(raw).toISOString() : '' } catch { return '' }
    })()
    if (baslik) out.push({ baslik, link, tarih, kaynak: '' })
  }
  return out
}

/**
 * Şirket için sözleşme/iş anlaşması haberlerini döndürür (son ~30 gün).
 * @param companyName Yahoo shortName (örn "Aselsan"); sembol de aranır.
 */
export async function fetchContractCatalysts(symbol: string, companyName: string): Promise<CatalystNews[]> {
  const names = [companyName, symbol]
    .filter(Boolean)
    .map((s) => s.toLowerCase().replace(/\s*(a\.?ş\.?|holding|sanayi|ticaret)\s*$/i, '').trim())
    .filter((s) => s.length >= 3)

  const all: CatalystNews[] = []
  await Promise.allSettled(
    RSS_FEEDS.map(async (url) => {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': UA },
          next: { revalidate: 1800 },
          signal: AbortSignal.timeout(7000),
        })
        if (!res.ok) return
        const xml = await res.text()
        for (const item of parseItems(xml)) all.push(item)
      } catch { /* atla */ }
    }),
  )

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const seen = new Set<string>()
  return all
    .filter((n) => {
      const lower = n.baslik.toLowerCase()
      const nameHit = names.some((nm) => lower.includes(nm))
      const dealHit = DEAL_KEYWORDS.some((k) => lower.includes(k))
      if (!nameHit || !dealHit) return false
      const t = n.tarih ? new Date(n.tarih).getTime() : 0
      if (t && t < cutoff) return false
      if (seen.has(n.baslik)) return false
      seen.add(n.baslik)
      return true
    })
    .sort((a, b) => (new Date(b.tarih).getTime() || 0) - (new Date(a.tarih).getTime() || 0))
    .slice(0, 5)
}
