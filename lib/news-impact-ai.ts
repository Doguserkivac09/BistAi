/**
 * Opsiyonel AI katmanı — haber materyalite/duygu zenginleştirme (Claude Haiku).
 *
 * Kural-tabanlı sınıflama bağlam göremez: örn. "BofA'dan dev satış, %11 düşüş"
 * haberi kelime eşleşmesiyle "Genel/orta" kalır ama aslında çok material + olumsuz.
 * Bu katman, en üstteki birkaç haberi TEK batch çağrıyla Claude'a verir;
 * materyalite (1-5) + duygu + 1 cümle gerekçe alır.
 *
 * - ai_cache (mevcut tablo, migration YOK) ile 24s cache → tekrar görüntülemede bedava.
 * - checkAndRecordAiBudget() ile günlük bütçe koruması; aşılırsa sessizce atla.
 * - Her hata durumunda kural-tabanlıya zarifçe düşer (asla endpoint'i kırmaz).
 */

import Anthropic from '@anthropic-ai/sdk'
import { checkAndRecordAiBudget } from './ai-budget'
import type { NewsImpact } from './news-impact'

const MODEL = 'claude-haiku-4-5-20251001'
const MAX_ITEMS = 5 // en üstteki N haber zenginleştirilir (latency/maliyet sınırı)

interface AiVerdict {
  i: number
  materyalite?: number
  duygu?: 'pozitif' | 'negatif' | 'nötr'
  gerekce?: string
}

function djb2(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

// ── ai_cache (Supabase) reuse ────────────────────────────────────────────────
async function getCache(key: string): Promise<AiVerdict[] | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !svc) return null
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, svc)
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', key)
      .gt('expires_at', new Date().toISOString())
      .single()
    if (!data?.explanation) return null
    return JSON.parse(data.explanation) as AiVerdict[]
  } catch {
    return null
  }
}

async function setCache(key: string, verdicts: AiVerdict[]): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !svc) return
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(url, svc)
    await sb.from('ai_cache').upsert({
      cache_key: key,
      explanation: JSON.stringify(verdicts),
      version: 3,
      hit_count: 0,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'cache_key' })
  } catch {
    /* cache yazımı kritik değil */
  }
}

const SYSTEM = `Sen bir Türk borsa (BIST) haber analistisin. Sana bir hissenin haber başlıkları verilir. Her başlık için:
- materyalite: 1-5 (5=fiyatı güçlü oynatabilecek somut gelişme: M&A, büyük sözleşme/ihale, bilanço sürprizi, sermaye/temettü, dava; 1=fiyat sorgusu/teknik analiz/genel gürültü)
- duygu: "pozitif" | "negatif" | "nötr" (hisse için)
- gerekce: en fazla 12 kelimelik tek cümle, somut

SADECE geçerli JSON dizisi döndür, başka metin yazma. Format:
[{"i":1,"materyalite":4,"duygu":"negatif","gerekce":"..."}]`

function parseJsonArray(text: string): AiVerdict[] {
  // Kod bloğu/önek temizle
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end < 0) return []
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1))
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

async function callClaude(sembol: string, titles: string[]): Promise<AiVerdict[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []
  const user = `Hisse: ${sembol}\nHaberler:\n${titles.map((t, i) => `${i + 1}. "${t}"`).join('\n')}`
  try {
    const anthropic = new Anthropic({ apiKey })
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    })
    const block = resp.content.find((b) => b.type === 'text')
    return block && 'text' in block ? parseJsonArray(block.text) : []
  } catch {
    return []
  }
}

/**
 * En üstteki haberleri AI ile zenginleştirir (mutasyon). Başarı/başarısızlık döner.
 * Hata/bütçe/anahtar yoksa items değişmeden kalır (kural-tabanlı görünür).
 */
export async function enrichNewsWithAI(items: NewsImpact[], sembol: string): Promise<boolean> {
  const top = items.slice(0, MAX_ITEMS)
  if (!top.length) return false

  const titles = top.map((n) => n.baslik)
  const day = new Date().toISOString().slice(0, 10)
  const cacheKey = `news-impact:${sembol}:${djb2(titles.join('|'))}:${day}`

  // 1) Cache
  let verdicts = await getCache(cacheKey)

  // 2) Cache yoksa bütçe kontrol + Claude
  if (!verdicts) {
    const budget = await checkAndRecordAiBudget()
    if (!budget.allowed) return false
    verdicts = await callClaude(sembol, titles)
    if (verdicts.length) setCache(cacheKey, verdicts).catch(() => {})
  }
  if (!verdicts.length) return false

  // 3) Sonuçları ilgili haberlere uygula (i 1-bazlı)
  let applied = false
  for (const v of verdicts) {
    const idx = (v.i ?? 0) - 1
    if (idx < 0 || idx >= top.length) continue
    const n = top[idx]
    if (v.duygu === 'pozitif' || v.duygu === 'negatif' || v.duygu === 'nötr') n.aiDuygu = v.duygu
    if (typeof v.materyalite === 'number') n.aiMateryalite = Math.max(1, Math.min(5, Math.round(v.materyalite)))
    if (v.gerekce && typeof v.gerekce === 'string') n.aiNot = v.gerekce.slice(0, 160)
    // AI çok material diyorsa ama kural "orta" dediyse rozeti yükselt (BofA tipi vakalar)
    if ((n.aiMateryalite ?? 0) >= 4 && n.materiality === 'orta') n.materiality = 'yüksek'
    applied = true
  }
  return applied
}
