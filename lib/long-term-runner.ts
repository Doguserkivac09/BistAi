/**
 * Uzun Vade Kompozit — çalıştırıcı (FAZ 1)
 *
 * Tüm BIST evreni için mevcut temel analiz motorlarını TEK kayıtta birleştirir:
 *  - Yatırım Skoru (sektör-profilli, enflasyon düzeltmeli)   — ağırlık 35
 *  - Finansal Sağlık (Piotroski + Altman + kazanç kalitesi)  — ağırlık 25
 *  - Sektöre Göre Değerleme (peer relativeScore)             — ağırlık 20
 *  - Büyüme Momentumu (ai_cache growth-momentum:BIST'ten)    — ağırlık 20
 *  + GARP verdict (forward-outlook) + Beneish/Altman kalite kısması
 *
 * Eksik bileşenlerde (banka → sağlık/büyüme uygulanmaz) ağırlıklar kalan
 * bileşenler üzerinde YENİDEN NORMALİZE edilir — banka cezalandırılmaz.
 *
 * Sonuç `ai_cache`'e TEK SATIR yazılır (anahtar: long-term:BIST, MIGRATION YOK).
 * Cron evreni ?part ile böler; her parça kendi dilimini merge eder
 * (growth-momentum-runner deseniyle aynı).
 *
 * Teknik katman (fiyat/teknik skor/sparkline) BURADA TUTULMAZ — API istek
 * anında scan_cache'ten taze okur (haftalık cache'te bayatlamasın).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchYahooFundamentals } from './yahoo-fundamentals'
import { fetchFinancialStatements } from './financial-statements'
import { computeFundamentalHealth, type FundamentalHealth } from './fundamental-health'
import { computeInvestableScore, type InflationContext } from './investment-score'
import { getSectorValuationProfile } from './sector-valuation'
import { computePeerValuation } from './peer-valuation'
import { getStoredSectorMedians } from './sector-medians'
import { computeGrowthQuality, computeVerdict, type VerdictCell } from './forward-outlook'
import { getStoredGrowthMomentum } from './growth-momentum-runner'
import { calcInstitutionalTarget, type ValuationResult } from './valuation'
import { getSectorId, type SectorId } from './sectors'

// ── Saf bileşik skor (test edilebilir) ──────────────────────────────────────

export interface CompositeInputs {
  investmentScore: number | null // 0-100 (zorunlu — yoksa skorlanamaz)
  healthScore: number | null     // 0-100 (banka/finansal → null)
  relativeScore: number | null   // 0-100 (peer; medyan yoksa null)
  growthScore: number | null     // 0-100 (banka/veri yetersiz → null)
  beneishFlag: 'temiz' | 'gri' | 'şüpheli' | null
  altmanZone: 'güvenli' | 'gri' | 'sıkıntı' | null
}

export interface CompositeResult {
  score: number
  qualityMultiplier: number
  componentsUsed: number
}

const W_INV = 0.35
const W_HEALTH = 0.25
const W_PEER = 0.20
const W_GROWTH = 0.20

/**
 * Bileşik Uzun Vade Skoru (0-100).
 * Null bileşenler dışlanır, ağırlıklar kalanlar üzerinde normalize edilir.
 * Kalite kısması ÇARPAN olarak en sonda uygulanır (growth-momentum deseni):
 *  Beneish şüpheli ×0.80, gri ×0.93; Altman sıkıntı ×0.85 (gri cezasız —
 *  healthScore zaten yansıtıyor, çifte sayım olmasın).
 */
export function computeLongTermComposite(c: CompositeInputs): CompositeResult | null {
  if (c.investmentScore === null || !Number.isFinite(c.investmentScore)) return null

  const parts: Array<{ s: number | null; w: number }> = [
    { s: c.investmentScore, w: W_INV },
    { s: c.healthScore, w: W_HEALTH },
    { s: c.relativeScore, w: W_PEER },
    { s: c.growthScore, w: W_GROWTH },
  ]
  const present = parts.filter((p) => p.s !== null && Number.isFinite(p.s))
  const sumW = present.reduce((a, p) => a + p.w, 0)
  const raw = present.reduce((a, p) => a + (p.s as number) * (p.w / sumW), 0)

  let mult = 1
  if (c.beneishFlag === 'şüpheli') mult *= 0.80
  else if (c.beneishFlag === 'gri') mult *= 0.93
  if (c.altmanZone === 'sıkıntı') mult *= 0.85

  return {
    score: Math.max(0, Math.min(100, Math.round(raw * mult))),
    qualityMultiplier: Math.round(mult * 100) / 100,
    componentsUsed: present.length,
  }
}

/**
 * Finansal Sağlık'ı tek 0-100 skora indirger (banka/finansal → null).
 * Piotroski %50 + Altman bölgesi %30 + kazanç kalitesi %20; eksikler
 * dışlanıp normalize edilir.
 */
export function deriveHealthScore(h: FundamentalHealth | null): number | null {
  if (!h || h.isFinancial) return null

  const piotroskiPct =
    h.piotroski.applicable && h.piotroski.score !== null ? (h.piotroski.score / h.piotroski.max) * 100 : null
  const altmanPct =
    h.altman.applicable && h.altman.zone !== null
      ? h.altman.zone === 'güvenli' ? 90 : h.altman.zone === 'gri' ? 55 : 15
      : null
  const eqPct =
    h.earningsQuality.rating !== null
      ? h.earningsQuality.rating === 'iyi' ? 90 : h.earningsQuality.rating === 'orta' ? 55 : 25
      : null

  const parts: Array<{ s: number | null; w: number }> = [
    { s: piotroskiPct, w: 0.5 },
    { s: altmanPct, w: 0.3 },
    { s: eqPct, w: 0.2 },
  ]
  const present = parts.filter((p) => p.s !== null)
  if (present.length === 0) return null
  const sumW = present.reduce((a, p) => a + p.w, 0)
  return Math.round(present.reduce((a, p) => a + (p.s as number) * (p.w / sumW), 0))
}

// ── Saklanan satır ──────────────────────────────────────────────────────────

export interface LongTermRow {
  sembol: string
  sector: SectorId
  /** Bileşik Uzun Vade Skoru (0-100) — sayfa bununla sıralar */
  longTermScore: number
  qualityMultiplier: number
  componentsUsed: number
  // Bileşen skorları (şeffaflık)
  investmentScore: number
  investmentRating: string
  investmentConfidence: string
  healthScore: number | null
  relativeScore: number | null
  growthScore: number | null
  growthVerdict: string | null
  // Sağlık detayı (rozetler)
  piotroski: number | null
  altmanZ: number | null
  altmanZone: string | null
  beneishFlag: string | null
  earningsQualityRating: string | null
  isFinancial: boolean
  // Peer detayı
  peerLabel: string | null
  peerReliable: boolean
  // GARP
  garpCell: VerdictCell | null
  garpLabel: string | null
  // Ham temel metrikler (mevcut sayfa alanları)
  peRatio: number | null
  dividendYield: number | null
  marketCap: number | null
  bookValue: number | null
  eps: number | null
  foreignOwnership: number | null
  insidersOwnership: number | null
  shortRatio: number | null
  returnOnEquity: number | null
  debtToEquity: number | null
  freeCashflow: number | null
  revenueGrowth: number | null
  earningsGrowth: number | null
  beta: number | null
  /** 5 yöntemli kurumsal hedef (cron anındaki fiyatla — hafta içi hafif drift olur) */
  valuation: ValuationResult | null
  /** 20 günlük ortalama TL işlem hacmi (scan_cache mumlarından, ön filtre değeri) */
  advTL: number | null
}

export interface LongTermStore {
  scoredAt: string
  inflationYoy: number | null
  rows: LongTermRow[]
}

export interface LongTermCoverage {
  scored: number
  total: number
  skippedNoFundamentals: number
  skippedNoScore: number
}

const CACHE_KEY = 'long-term:BIST'
const TTL_MS = 8 * 24 * 60 * 60 * 1000 // 8 gün (haftalık koşu + marj)
const MAX_STORED = 400
/** Saklama tabanı — sayfa filtresi API'de; burada sadece çöpü ele */
const MIN_STORE_SCORE = 30

// ── Tarayıcı ────────────────────────────────────────────────────────────────

export async function runLongTermScan(
  sb: SupabaseClient,
  symbols: string[],
  opts: {
    inflationYoy?: number | null
    /** scan_cache mumlarından hesaplanan 20g ADV (TL) — satırda saklanır */
    advMap?: Map<string, number>
    batchSize?: number
    batchDelay?: number
    merge?: boolean
  } = {},
): Promise<LongTermCoverage> {
  const batchSize = opts.batchSize ?? 6
  const batchDelay = opts.batchDelay ?? 300
  const inflationYoy = opts.inflationYoy ?? null
  const inflationCtx: InflationContext | undefined =
    inflationYoy !== null && Number.isFinite(inflationYoy)
      ? { tufeYoy: inflationYoy, source: 'tcmb' }
      : undefined

  // Paylaşılan bağlam — TEK sorgu (sembol başına fan-out yok)
  const [mediansMap, growthStore] = await Promise.all([
    getStoredSectorMedians(sb).catch(() => null),
    getStoredGrowthMomentum(sb, 'BIST').catch(() => null),
  ])
  const growthMap = new Map((growthStore?.rows ?? []).map((r) => [r.sembol, r]))

  const rows: LongTermRow[] = []
  let skippedNoFundamentals = 0
  let skippedNoScore = 0

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (sembol) => {
        try {
          const sectorId = getSectorId(sembol)

          // 1) Temel veri (quoteSummary, 24h in-memory cache'li)
          const f = await fetchYahooFundamentals(sembol)

          // 2) Yatırım Skoru — sektör profili ile (banka/sigorta/GYO doğru metrikler)
          const profile = getSectorValuationProfile(sembol)
          const inv = computeInvestableScore(f, undefined, inflationCtx, profile)

          // 3) Finansal Sağlık (çok yıllı tablolar; hata → null, skor yine üretilir)
          let health: FundamentalHealth | null = null
          try {
            const years = await fetchFinancialStatements(sembol, { bist: true })
            if (years.length >= 2) health = computeFundamentalHealth(years)
          } catch { /* sağlık bileşeni dışlanır */ }
          const healthScore = deriveHealthScore(health)

          // 4) Peer görece değerleme (medyanlar ai_cache'ten — fan-out yok)
          const median = mediansMap?.[sectorId]
          const peer = median ? computePeerValuation(f, sectorId, median) : null

          // 5) Büyüme momentumu (ai_cache'ten — yeniden hesaplama YOK)
          const growth = growthMap.get(sembol) ?? null

          // 6) GARP verdict (peer varsa)
          let garp: ReturnType<typeof computeVerdict> | null = null
          if (peer) {
            const gq = computeGrowthQuality(f, {
              inflationYoy,
              roeVsSectorPct: peer.roe.pctVsMedian,
            })
            garp = computeVerdict(peer.relativeScore, gq.score)
          }

          // 7) Bileşik skor — güvenilmez peer (emsal <5) bileşiğe KATILMAZ:
          // küçük/heterojen sektörde medyan sapması relativeScore'u 100'e
          // clamp'leyip skoru haksız şişiriyor (rozette yine gösterilir)
          const composite = computeLongTermComposite({
            investmentScore: inv.score,
            healthScore,
            relativeScore: peer?.reliable ? peer.relativeScore : null,
            growthScore: growth?.score ?? null,
            beneishFlag: health?.beneish.flag ?? null,
            altmanZone: health?.altman.zone ?? null,
          })
          if (!composite || composite.score < MIN_STORE_SCORE) {
            skippedNoScore++
            return
          }

          // 8) 5 yöntemli kurumsal hedef (cron-anı fiyatıyla)
          const valuation =
            f.currentPrice && f.currentPrice > 0
              ? calcInstitutionalTarget(f, f.currentPrice, sectorId, inv.score)
              : null

          rows.push({
            sembol,
            sector: sectorId,
            longTermScore: composite.score,
            qualityMultiplier: composite.qualityMultiplier,
            componentsUsed: composite.componentsUsed,
            investmentScore: inv.score,
            investmentRating: inv.ratingLabel,
            investmentConfidence: inv.confidence,
            healthScore,
            relativeScore: peer?.relativeScore ?? null,
            growthScore: growth?.score ?? null,
            growthVerdict: growth?.verdict ?? null,
            piotroski: health?.piotroski.applicable ? health.piotroski.score : null,
            altmanZ: health?.altman.applicable ? health.altman.z : null,
            altmanZone: health?.altman.zone ?? null,
            beneishFlag: health?.beneish.flag ?? null,
            earningsQualityRating: health?.earningsQuality.rating ?? null,
            isFinancial: health?.isFinancial ?? false,
            peerLabel: peer?.label ?? null,
            peerReliable: peer?.reliable ?? false,
            garpCell: garp?.cell ?? null,
            garpLabel: garp?.label ?? null,
            peRatio: f.peRatio,
            dividendYield: f.dividendYield,
            marketCap: f.marketCap,
            bookValue: f.bookValue,
            eps: f.eps,
            foreignOwnership:
              f.institutionsPercentHeld != null ? Math.round(f.institutionsPercentHeld * 1000) / 10 : null,
            insidersOwnership:
              f.insidersPercentHeld != null ? Math.round(f.insidersPercentHeld * 1000) / 10 : null,
            shortRatio: f.shortRatio,
            returnOnEquity: f.returnOnEquity != null ? Math.round(f.returnOnEquity * 1000) / 10 : null,
            debtToEquity: f.debtToEquity,
            freeCashflow: f.freeCashflow,
            revenueGrowth: f.revenueGrowth != null ? Math.round(f.revenueGrowth * 1000) / 10 : null,
            earningsGrowth: f.earningsGrowth != null ? Math.round(f.earningsGrowth * 1000) / 10 : null,
            beta: f.beta,
            valuation,
            advTL: opts.advMap?.get(sembol) ?? null,
          })
        } catch {
          skippedNoFundamentals++
        }
      }),
    )
    if (i + batchSize < symbols.length) await new Promise((r) => setTimeout(r, batchDelay))
  }

  await storeLongTerm(sb, rows, { merge: opts.merge, inflationYoy })

  return {
    scored: rows.length,
    total: symbols.length,
    skippedNoFundamentals,
    skippedNoScore,
  }
}

// ── ai_cache store / read ───────────────────────────────────────────────────

export async function storeLongTerm(
  sb: SupabaseClient,
  rows: LongTermRow[],
  opts: { merge?: boolean; inflationYoy?: number | null } = {},
): Promise<void> {
  let final = rows
  let inflationYoy = opts.inflationYoy ?? null

  if (opts.merge) {
    const existing = await getStoredLongTerm(sb)
    if (existing) {
      const map = new Map(existing.rows.map((r) => [r.sembol, r]))
      for (const r of rows) map.set(r.sembol, r)
      final = [...map.values()]
      if (inflationYoy === null) inflationYoy = existing.inflationYoy
    }
  }

  final.sort((a, b) => b.longTermScore - a.longTermScore)
  const payload: LongTermStore = {
    scoredAt: new Date().toISOString(),
    inflationYoy,
    rows: final.slice(0, MAX_STORED),
  }

  await sb.from('ai_cache').upsert(
    {
      cache_key: CACHE_KEY,
      explanation: JSON.stringify(payload),
      version: 1,
      hit_count: 0,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    },
    { onConflict: 'cache_key' },
  )
}

export async function getStoredLongTerm(sb: SupabaseClient): Promise<LongTermStore | null> {
  try {
    const { data } = await sb
      .from('ai_cache')
      .select('explanation')
      .eq('cache_key', CACHE_KEY)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (!data?.explanation) return null
    return JSON.parse(data.explanation as string) as LongTermStore
  } catch {
    return null
  }
}
