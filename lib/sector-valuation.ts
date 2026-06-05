/**
 * Sektör-bazlı değerleme profilleri.
 *
 * Sorun: tek bir değerleme reçetesi (F/K+PEG+F/DD+EV/FAVÖK) ve risk seti
 * (borç/özsermaye+cari oran) tüm hisselere uygulanınca bankalar/sigorta/GYO
 * yanlış skorlanır:
 *   - Banka FAVÖK & cari varlık/borç raporlamaz → EV/FAVÖK, cari oran anlamsız
 *   - Bankada "borç" = mevduat → borç/özsermaye uçar → risk haksızca düşer
 *
 * Çözüm: sektör tipine göre doğru metrik seti + ağırlık. Banka = F/DD+F/K+ROE.
 */

import { getSectorId } from './sectors'
import type { InvestableWeights } from './investment-score'

export type SectorKind = 'bank' | 'insurance' | 'reit' | 'default'

export interface SectorValuationProfile {
  kind: SectorKind
  label: string
  note: string
  weights: InvestableWeights
  // Değerleme metrikleri: [min, max] verilirse dahil edilir (reverse skala: düşük=iyi).
  valuation: {
    pe?: [number, number]
    pb?: [number, number]
    peg?: [number, number]
    evEbitda?: [number, number]
  }
  // Risk metrikleri: verilmezse dışlanır.
  risk: {
    debtToEquity?: [number, number]
    currentRatio?: boolean
    fcf?: boolean
    beta?: boolean
  }
}

// Sanayi/genel — mevcut davranışı birebir korur (geriye uyumluluk).
export const DEFAULT_PROFILE: SectorValuationProfile = {
  kind: 'default',
  label: 'Standart model',
  note: 'Sanayi/genel şirket: F/K, PEG, F/DD, EV/FAVÖK ile değerlenir.',
  weights: { valuation: 0.30, growth: 0.25, profitability: 0.20, risk: 0.25 },
  valuation: { pe: [5, 40], peg: [0.5, 3], pb: [0.5, 5], evEbitda: [3, 20] },
  risk: { debtToEquity: [0, 3], currentRatio: true, fcf: true, beta: true },
}

const BANK_PROFILE: SectorValuationProfile = {
  kind: 'bank',
  label: '🏦 Banka modeli',
  note: 'Bankalar F/DD + F/K + ROE ile değerlenir. Mevduat "borç" sayılmaz; EV/FAVÖK ve cari oran kullanılmaz, ağırlık kârlılığa (ROE) kayar.',
  weights: { valuation: 0.35, growth: 0.15, profitability: 0.35, risk: 0.15 },
  valuation: { pe: [3, 12], pb: [0.4, 2.5] },
  risk: { beta: true },
}

const INSURANCE_PROFILE: SectorValuationProfile = {
  kind: 'insurance',
  label: '🛡️ Sigorta modeli',
  note: 'Sigorta şirketleri F/DD + F/K + ROE ile değerlenir; teknik karşılıklar nedeniyle EV/FAVÖK ve cari oran kullanılmaz.',
  weights: { valuation: 0.30, growth: 0.20, profitability: 0.30, risk: 0.20 },
  valuation: { pe: [4, 14], pb: [0.5, 2.5] },
  risk: { beta: true },
}

const REIT_PROFILE: SectorValuationProfile = {
  kind: 'reit',
  label: '🏢 GYO/İnşaat modeli',
  note: 'GYO net aktif değere (F/DD) ve temettüye duyarlıdır; borç gerçektir (dahil), EV/FAVÖK kullanılmaz.',
  weights: { valuation: 0.40, growth: 0.15, profitability: 0.15, risk: 0.30 },
  valuation: { pe: [4, 18], pb: [0.3, 2] },
  risk: { debtToEquity: [0, 4], beta: true },
}

/** Sembolün sektörüne göre değerleme profilini döndürür. */
export function getSectorValuationProfile(sembol: string): SectorValuationProfile {
  switch (getSectorId(sembol)) {
    case 'banka': return BANK_PROFILE
    case 'sigorta_finans': return INSURANCE_PROFILE
    case 'insaat_gyo': return REIT_PROFILE
    default: return DEFAULT_PROFILE
  }
}
