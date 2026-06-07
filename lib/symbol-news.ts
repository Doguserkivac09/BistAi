/**
 * Sembol-bazlı haber çekici — Google News RSS arama.
 * Her BIST/US hissesi için kendine özgü Türkçe haber (zaman damgalı).
 * `"{SEMBOL}" hisse` tırnaklı tam-eşleşme: çakışmaları engeller (GARAN≠GRNYO, DEVA≠parti).
 *
 * Hem app/api/haber hem app/api/news-impact bunu kullanır.
 */

export interface SymbolNewsItem {
  baslik: string
  link: string
  tarih: string // ISO timestamp (Google News pubDate)
  kaynak: string
}

const UA = 'Mozilla/5.0 (compatible; BistAI/1.0; +https://bistai.com)'
const TIMEOUT_MS = 8000

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/<[^>]*>/g, '').trim()
}

function parseRss(xml: string): SymbolNewsItem[] {
  const out: SymbolNewsItem[] = []
  const re = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const b = m[1] ?? ''
    const baslik = decode(
      (b.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ?? b.match(/<title>([\s\S]*?)<\/title>/))?.[1] ?? '',
    )
    const link = (b.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() ?? ''
    let tarih = ''
    const pd = (b.match(/<pubDate>([\s\S]*?)<\/pubDate>/))?.[1]?.trim() ?? ''
    try { tarih = pd ? new Date(pd).toISOString() : '' } catch { /* */ }
    const kaynak = (b.match(/<source[^>]*>([\s\S]*?)<\/source>/))?.[1]?.trim() ?? ''
    if (baslik) out.push({ baslik, link, tarih, kaynak })
  }
  return out
}

/** Sembol için güncel Türkçe haberler (Google News). */
export async function fetchSymbolNews(sembol: string): Promise<SymbolNewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${sembol}" hisse`)}&hl=tr&gl=TR&ceid=TR:tr`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return []
    const xml = await res.text()
    return parseRss(xml)
      .filter((h) => h.baslik && !/google haberler/i.test(h.baslik) && !/^".*"$/.test(h.baslik.trim()))
      .map((h) => {
        const src = h.kaynak || ''
        let baslik = h.baslik
        if (src && baslik.endsWith(` - ${src}`)) {
          baslik = baslik.slice(0, -(src.length + 3)).trim()
        } else {
          const mm = baslik.match(/^(.+?)\s+-\s+([^-]{2,40})$/)
          if (mm) return { ...h, baslik: mm[1].trim(), kaynak: src || mm[2].trim() }
        }
        return { ...h, baslik, kaynak: src || 'Google News' }
      })
  } catch {
    return []
  }
}
