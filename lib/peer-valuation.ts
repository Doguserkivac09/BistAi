/**
 * Peer/sektör görece değerleme — bir hissenin çarpanlarını sektör medyanıyla
 * kıyaslar. "F/K 4.5" değil "sektöre göre %20 iskontolu" der.
 *
 * relativeScore: değerleme çarpanlarındaki (F/K, F/DD, EV/FAVÖK) ortalama
 * iskonto → 0-100 (yüksek = sektöre göre ucuz). ROE ayrı (kalite, skora katılmaz).
 */

import type { SectorId } from './sectors'
import type { YahooFundamentals } from './yahoo-fundamentals'
import type { SectorMedian } from './sector-medians'

export interface MetricCompare {
  value: number | null
  median: number | null
  pctVsMedian: number | null // +%20 = medyanın %20 üstünde
}

export interface PeerValuation {
  sector: SectorId
  count: number
  reliable: boolean // emsal sayısı yeterli mi (>=5) — küçük/heterojen sektörde verdict zayıf
  pe: MetricCompare
  pb: MetricCompare
  evEbitda: MetricCompare
  roe: MetricCompare // ratio bazlı; kalite göstergesi
  relativeScore: number // 0-100 (yüksek = sektöre göre ucuz)
  label: 'sektöre göre ucuz' | 'dengeli' | 'sektöre göre pahalı'
}

function cmp(value: number | null, median: number | null, positiveOnly = true): MetricCompare {
  const valid = value !== null && isFinite(value) && (!positiveOnly || value > 0)
  const v = valid ? value : null
  const pct = v !== null && median !== null && median !== 0
    ? Math.round(((v - median) / median) * 100)
    : null
  return { value: v, median, pctVsMedian: pct }
}

export function computePeerValuation(
  f: YahooFundamentals,
  sector: SectorId,
  median: SectorMedian,
): PeerValuation {
  const pe = cmp(f.peRatio, median.pe)
  const pb = cmp(f.priceToBook, median.pb)
  const evEbitda = cmp(f.enterpriseToEbitda, median.evEbitda)
  const roe = cmp(f.returnOnEquity, median.roe, false)

  // İskonto: değerleme çarpanlarında medyanın ALTINDA olmak ucuzdur.
  // discount = -(pctVsMedian/100) → +0.2 = %20 ucuz.
  // Tek bir aşırı çarpan (örn. GYO'da F/K +%1452) skoru ezmesin → ±%100 clamp.
  const discounts: number[] = []
  for (const m of [pe, pb, evEbitda]) {
    if (m.pctVsMedian !== null) {
      const disc = -m.pctVsMedian / 100
      discounts.push(Math.max(-1, Math.min(1, disc)))
    }
  }
  let relativeScore = 50
  if (discounts.length > 0) {
    const avg = discounts.reduce((a, b) => a + b, 0) / discounts.length
    // -%50 (pahalı) → 0, 0 → 50, +%50 (ucuz) → 100
    relativeScore = Math.max(0, Math.min(100, Math.round(50 + (avg / 0.5) * 50)))
  }
  const label = relativeScore > 60 ? 'sektöre göre ucuz' : relativeScore < 40 ? 'sektöre göre pahalı' : 'dengeli'

  return { sector, count: median.count, reliable: median.count >= 5, pe, pb, evEbitda, roe, relativeScore, label }
}
