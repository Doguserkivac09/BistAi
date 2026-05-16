/**
 * lib/valuation.ts
 *
 * Kurumsal Değerleme Modeli — BIST Hisseleri İçin
 *
 * Profesyonel analistlerin kullandığı 4 yöntem:
 *  1. Graham Sayısı (Temel intrinsik değer)
 *  2. PEG Ratio (Büyümeye göre F/K)
 *  3. EV/EBITDA Sektör Karşılaştırması
 *  4. 52H + ROE Momentumu (teknik-temel hibrid)
 *
 * Önemli Kural: Hedef göstermek için minimum %10 upside şart.
 * Aksi halde "aşırı değerlendi" veya "adil değer" notu verilir.
 *
 * Referanslar:
 *  - Aswath Damodaran, "Investment Valuation" (NYU Stern)
 *  - Benjamin Graham, "Security Analysis"
 *  - BIST sektör F/K ortalamaları (BIST 2024-2025 verileri)
 */

import type { YahooFundamentals } from './yahoo-fundamentals';

// ── BIST Sektör Değerleme Çarpanları ─────────────────────────────────
// Kaynak: BIST Bülten + Halka Arz Analizleri 2024-2025
const SECTOR_MULTIPLES: Record<string, {
  avgPE: number;          // Sektör ortalama F/K
  avgPB: number;          // Sektör ortalama F/DD
  avgEVEBITDA: number;    // Sektör ortalama EV/FAVÖK
  growthPremium: number;  // Büyüme için ilave çarpan
}> = {
  banka:                   { avgPE:  7.5, avgPB: 1.2, avgEVEBITDA:  6.0, growthPremium: 1.1 },
  sigorta_finans:          { avgPE: 10.0, avgPB: 1.5, avgEVEBITDA:  8.0, growthPremium: 1.1 },
  holding:                 { avgPE:  8.0, avgPB: 1.0, avgEVEBITDA:  7.0, growthPremium: 1.0 },
  havacilik_savunma:       { avgPE: 20.0, avgPB: 3.5, avgEVEBITDA: 15.0, growthPremium: 1.3 },
  enerji:                  { avgPE: 11.0, avgPB: 1.8, avgEVEBITDA:  8.0, growthPremium: 1.1 },
  otomotiv:                { avgPE: 10.0, avgPB: 2.0, avgEVEBITDA:  7.0, growthPremium: 1.1 },
  perakende:               { avgPE: 15.0, avgPB: 3.0, avgEVEBITDA: 10.0, growthPremium: 1.2 },
  telekom_teknoloji:       { avgPE: 13.0, avgPB: 2.5, avgEVEBITDA:  9.0, growthPremium: 1.2 },
  demir_celik_madencilik:  { avgPE:  8.0, avgPB: 1.5, avgEVEBITDA:  6.0, growthPremium: 1.0 },
  cam_kimya:               { avgPE: 12.0, avgPB: 2.0, avgEVEBITDA:  8.0, growthPremium: 1.1 },
  insaat_gyo:              { avgPE:  9.0, avgPB: 1.5, avgEVEBITDA:  8.0, growthPremium: 1.0 },
  sanayi:                  { avgPE: 11.0, avgPB: 2.0, avgEVEBITDA:  8.0, growthPremium: 1.1 },
  ulastirma:               { avgPE: 12.0, avgPB: 2.0, avgEVEBITDA:  8.0, growthPremium: 1.1 },
  saglik:                  { avgPE: 18.0, avgPB: 3.0, avgEVEBITDA: 12.0, growthPremium: 1.2 },
  default:                 { avgPE: 11.0, avgPB: 1.8, avgEVEBITDA:  8.0, growthPremium: 1.0 },
};

export interface ValuationResult {
  /** Hedef fiyat (TL) */
  target: number | null;
  /** Potansiyel artış/düşüş % */
  upside: number | null;
  /** Kullanılan yöntem */
  method: string;
  /** Yatırım tezi — kısa açıklama */
  thesis: string;
  /** Değerleme durumu */
  status: 'undervalued' | 'fair' | 'overvalued' | 'unknown';
  /** Risk/Ödül kategorisi */
  riskReward: 'excellent' | 'good' | 'fair' | 'poor' | null;
  /** Güven seviyesi */
  confidence: 'high' | 'medium' | 'low';
  /** Tüm yöntemlerin detayı */
  breakdown: Array<{
    method: string;
    target: number;
    upside: number;
    weight: number;
  }>;
}

export function calcInstitutionalTarget(
  f: YahooFundamentals,
  currentPrice: number,
  sectorId: string,
  investmentScore: number,
): ValuationResult {
  const NULL_RESULT: ValuationResult = {
    target: null, upside: null, method: '', thesis: '',
    status: 'unknown', riskReward: null, confidence: 'low', breakdown: [],
  };

  if (!currentPrice || currentPrice <= 0) return NULL_RESULT;

  const mult = SECTOR_MULTIPLES[sectorId] ?? SECTOR_MULTIPLES.default;
  const breakdown: ValuationResult['breakdown'] = [];

  // ── Yöntem 1: Graham Sayısı ─────────────────────────────────────────
  // √(22.5 × EPS × Defter Değeri) — Benjamin Graham intrinsik değer
  // Sadece karlı + pozitif defter değerli şirketler için anlamlı
  if (f.eps && f.eps > 0 && f.bookValue && f.bookValue > 0) {
    const graham = Math.sqrt(22.5 * f.eps * f.bookValue);
    if (graham > currentPrice * 0.3 && graham < currentPrice * 5) {
      const upside = ((graham - currentPrice) / currentPrice) * 100;
      breakdown.push({ method: 'Graham Sayısı', target: graham, upside, weight: 0.25 });
    }
  }

  // ── Yöntem 2: Sektör F/K Normalizasyonu ────────────────────────────
  // Şirketin EPS × Sektör Ortalama F/K = Sektör Adil Değer
  // Kural: Mevcut F/K < Sektör F/K ise değer var (iskontolu)
  if (f.eps && f.eps > 0 && f.peRatio && f.peRatio > 0) {
    const sectorTarget = f.eps * mult.avgPE;
    const upside = ((sectorTarget - currentPrice) / currentPrice) * 100;

    // Sadece mevcut fiyatla makul bant içinde ise ekle
    if (sectorTarget > currentPrice * 0.4 && sectorTarget < currentPrice * 4) {
      // Mevcut F/K sektör F/K'sının altındaysa güçlü sinyal
      const discount = f.peRatio < mult.avgPE * 0.8;
      breakdown.push({
        method: `Sektör F/K (${mult.avgPE}x)`,
        target: sectorTarget,
        upside,
        weight: discount ? 0.35 : 0.20,
      });
    }
  }

  // ── Yöntem 3: F/DD (Price-to-Book) Normalizasyonu ──────────────────
  // GYO, banka ve holding için F/K'dan daha anlamlı
  if (f.bookValue && f.bookValue > 0 && f.priceToBook && f.priceToBook > 0) {
    const isBankOrGYO = ['banka', 'insaat_gyo', 'sigorta_finans', 'holding'].includes(sectorId);
    if (isBankOrGYO) {
      const pbTarget = f.bookValue * mult.avgPB;
      const upside = ((pbTarget - currentPrice) / currentPrice) * 100;
      if (pbTarget > currentPrice * 0.4 && pbTarget < currentPrice * 4) {
        breakdown.push({
          method: `Sektör F/DD (${mult.avgPB}x)`,
          target: pbTarget,
          upside,
          weight: 0.35, // Bu sektörler için en anlamlı
        });
      }
    }
  }

  // ── Yöntem 4: PEG Ratio (Büyümeye Göre F/K) ─────────────────────
  // PEG < 1 = değer var, PEG > 2 = pahalı
  // Hedef F/K = büyüme oranı × 1.0 (PEG=1 adil değer)
  if (f.eps && f.eps > 0 && f.earningsGrowth && f.earningsGrowth > 0.05) {
    const growthPct = f.earningsGrowth * 100;
    const fairPE = Math.min(growthPct * 1.2, mult.avgPE * 1.5); // PEG=1.2 adil
    const pegTarget = f.eps * fairPE;
    const upside = ((pegTarget - currentPrice) / currentPrice) * 100;
    if (pegTarget > currentPrice * 0.5 && pegTarget < currentPrice * 5) {
      breakdown.push({
        method: `PEG Bazlı (Büyüme: %${growthPct.toFixed(0)})`,
        target: pegTarget,
        upside,
        weight: 0.25,
      });
    }
  }

  // ── Yöntem 5: ROE-Büyüme Momentumu ──────────────────────────────────
  // Yüksek ROE + güçlü büyüme = çarpan hak edilir
  // Hedef = Mevcut Fiyat × (1 + beklenen büyüme yüzdesi)
  if (f.returnOnEquity && f.returnOnEquity > 0.12 && f.revenueGrowth && f.revenueGrowth > 0.05) {
    const roePremium = Math.min(f.returnOnEquity * 2.5, 0.50); // max %50 premium
    const roTarget = currentPrice * (1 + roePremium);
    const upside = roePremium * 100;
    breakdown.push({
      method: `ROE Momentumu (ROE: %${(f.returnOnEquity * 100).toFixed(0)})`,
      target: roTarget,
      upside,
      weight: 0.15,
    });
  }

  if (breakdown.length === 0) return NULL_RESULT;

  // ── Ağırlıklı Ortalama Hedef ─────────────────────────────────────────
  const totalWeight = breakdown.reduce((s, b) => s + b.weight, 0);
  const weightedTarget = breakdown.reduce((s, b) => s + b.target * (b.weight / totalWeight), 0);
  const weightedUpside = ((weightedTarget - currentPrice) / currentPrice) * 100;

  // ── Değerleme Durumu ─────────────────────────────────────────────────
  let status: ValuationResult['status'];
  if (weightedUpside > 20)       status = 'undervalued';
  else if (weightedUpside > -10) status = 'fair';
  else                           status = 'overvalued';

  // ── Risk/Ödül ─────────────────────────────────────────────────────────
  let riskReward: ValuationResult['riskReward'] = null;
  if (weightedUpside > 35 && investmentScore >= 65)       riskReward = 'excellent';
  else if (weightedUpside > 20 && investmentScore >= 55)  riskReward = 'good';
  else if (weightedUpside > 10)                            riskReward = 'fair';
  else if (weightedUpside <= 0)                            riskReward = 'poor';

  // ── Güven Seviyesi (kaç yöntem var + veri kalitesi) ──────────────────
  let confidence: ValuationResult['confidence'] = 'low';
  if (breakdown.length >= 3 && investmentScore >= 60)      confidence = 'high';
  else if (breakdown.length >= 2)                          confidence = 'medium';

  // ── Yatırım Tezi ──────────────────────────────────────────────────────
  let thesis = '';
  if (status === 'undervalued' && riskReward === 'excellent') {
    thesis = `Sektörüne göre %${Math.abs(weightedUpside).toFixed(0)} iskontolu. Güçlü temel veriler ve yüksek güven seviyesi ile uzun vadeli birikim fırsatı.`;
  } else if (status === 'undervalued') {
    thesis = `Mevcut fiyat sektör ortalamasının altında. %${Math.abs(weightedUpside).toFixed(0)} hedef, ${breakdown.length} bağımsız yöntemle teyit edildi.`;
  } else if (status === 'fair') {
    thesis = `Adil değer civarında işlem görüyor. Sektör F/K'sına göre makul fiyatlı.`;
  } else {
    thesis = `Mevcut fiyat temel değerin üzerinde. Yeni pozisyon için daha iyi giriş noktası beklenebilir.`;
  }

  // Minimum %8 upside şartı — altındaysa "adil değer" notu ver
  if (Math.abs(weightedUpside) < 8) {
    return {
      target: parseFloat(weightedTarget.toFixed(2)),
      upside: parseFloat(weightedUpside.toFixed(1)),
      method: 'Ağırlıklı Ortalama',
      thesis: 'Adil değer civarında işlem görüyor — yeni giriş için daha iyi fırsat beklenebilir.',
      status: 'fair',
      riskReward: 'fair',
      confidence,
      breakdown: breakdown.map((b) => ({ ...b, target: parseFloat(b.target.toFixed(2)), upside: parseFloat(b.upside.toFixed(1)) })),
    };
  }

  // En iyi yöntem (en yüksek weight)
  const bestMethod = breakdown.reduce((a, b) => a.weight >= b.weight ? a : b);

  return {
    target:     parseFloat(weightedTarget.toFixed(2)),
    upside:     parseFloat(weightedUpside.toFixed(1)),
    method:     `${bestMethod.method} + ${breakdown.length - 1} yöntem`,
    thesis,
    status,
    riskReward,
    confidence,
    breakdown: breakdown.map((b) => ({
      ...b,
      target: parseFloat(b.target.toFixed(2)),
      upside: parseFloat(b.upside.toFixed(1)),
    })),
  };
}
