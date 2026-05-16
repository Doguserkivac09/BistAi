/**
 * lib/market-phase.ts
 *
 * Hisse fiyat döngüsü aşaması tespiti.
 * Richard Wyckoff'un "Piyasa Döngüsü" teorisinden adapte.
 *
 * Kullanılan veriler (scan_cache'den):
 *   - RSI değeri
 *   - 52H dipten mesafe (pct_from_52w_low)
 *   - 52H tepeden mesafe (pct_from_52w_high)
 *   - Relative Volume (rel_vol5)
 */

export type MarketPhase = 1 | 2 | 3 | 4;

export interface PhaseResult {
  phase: MarketPhase;
  label: string;
  shortLabel: string;
  emoji: string;
  color: string;       // Tailwind text rengi
  bgColor: string;     // Tailwind bg rengi
  borderColor: string; // Tailwind border rengi
  description: string;
  tradeNote: string;   // Kullanıcıya öneri
  riskLevel: 'low' | 'medium' | 'high' | 'very-high';
  positionSizeHint: string; // "Tam", "Orta", "Küçük"
  /** Scoring bonus — yüksek öncelikli aşamalar daha öne çıkar */
  scoreBonus: number;
}

export const PHASE_CONFIG: Record<MarketPhase, Omit<PhaseResult, 'phase'>> = {
  1: {
    label:          'Dip (Birikim Başlangıcı)',
    shortLabel:     'Dip',
    emoji:          '🟣',
    color:          'text-violet-400',
    bgColor:        'bg-violet-500/10',
    borderColor:    'border-violet-500/30',
    description:    'RSI 20-35: Akıllı para sessizce alım yapıyor. Dip atlatılmamış olabilir, ama potansiyel en yüksek bu aşamada.',
    tradeNote:      'Erken giriş — stop geniş tut, pozisyon küçük. Dip doğrulanmadan tam giriş yapma.',
    riskLevel:      'high',
    positionSizeHint: 'Küçük (%0.5)',
    scoreBonus:     8, // Yüksek potansiyel ama risk var
  },
  2: {
    label:          'Birikim (Optimal Giriş)',
    shortLabel:     'Birikim',
    emoji:          '🟢',
    color:          'text-emerald-400',
    bgColor:        'bg-emerald-500/10',
    borderColor:    'border-emerald-500/30',
    description:    'RSI 35-55: Dip atlatıldı, fiyat yavaş yükseliyor, hacim artıyor. En iyi risk/ödül dengesi burada.',
    tradeNote:      'Optimal giriş noktası — normal pozisyon boyutu. Risk/ödül en iyi bu aşamada.',
    riskLevel:      'low',
    positionSizeHint: 'Tam (%1)',
    scoreBonus:     20, // En çok öne çıkar
  },
  3: {
    label:          'Rally (Momentum)',
    shortLabel:     'Rally',
    emoji:          '🔵',
    color:          'text-sky-400',
    bgColor:        'bg-sky-500/10',
    borderColor:    'border-sky-500/30',
    description:    'RSI 55-75: Herkes fark etmeye başladı, momentum güçlü. Geç değil ama stop sıkı olmalı.',
    tradeNote:      'Momentum güçlü — stop sıkı tut, kısa vadeli hedef. Trend devam edebilir.',
    riskLevel:      'medium',
    positionSizeHint: 'Orta (%0.75)',
    scoreBonus:     12,
  },
  4: {
    label:          'Aşırı Alım (Dikkat)',
    shortLabel:     'Aşırı Alım',
    emoji:          '🟡',
    color:          'text-amber-400',
    bgColor:        'bg-amber-500/10',
    borderColor:    'border-amber-500/30',
    description:    'RSI 75+: Geç kalınmış olabilir. Güçlü breakout varsa kısa vadeli devam edebilir ama risk yüksek.',
    tradeNote:      'Dikkatli ol — sadece çok güçlü kırılımlarda ve küçük pozisyonla gir. Geri çekilme riski yüksek.',
    riskLevel:      'very-high',
    positionSizeHint: 'Çok Küçük (%0.3)',
    scoreBonus:     2,
  },
};

/**
 * RSI değerinden piyasa aşamasını tespit eder.
 */
export function detectPhase(rsi: number | null): PhaseResult | null {
  if (rsi === null || rsi === undefined) return null;

  let phase: MarketPhase;
  if (rsi < 35)      phase = 1;
  else if (rsi < 55) phase = 2;
  else if (rsi < 75) phase = 3;
  else               phase = 4;

  return { phase, ...PHASE_CONFIG[phase] };
}

/**
 * Dip Katılım Skoru — "Dipten taze trend" hisseyi bulmak için.
 *
 * Yüksek skor = dip atlatılmış + momentum birikmiş + henüz patlamadı
 */
export interface DipCatchInput {
  rsi: number | null;
  pctFrom52wLow: number | null;   // pozitif = dipten yukarıda (örn 12 = %12 yukarda)
  pctFrom52wHigh: number | null;  // negatif = tepeden aşağıda (örn -15 = %15 aşağıda)
  relVol5: number | null;         // 1 = normal, 2 = 2x patlama
  hasHigherLows: boolean;         // Higher Lows sinyali var mı
  hasBollingerSqueeze: boolean;   // Bollinger sıkışması var mı
  hasPreSignal: boolean;          // Pre-signal var mı (Trend Olgunlaşıyor vb.)
  weeklyAligned: boolean | null;  // MTF uyum
  confluenceScore: number | null;
  winRate: number | null;         // 0-1 arası, null = yetersiz veri
}

export function calcDipCatchScore(input: DipCatchInput): number {
  let score = 0;

  // ── RSI Aşama Bonusu ──────────────────────────────────────────────────
  const rsi = input.rsi ?? 50;
  if (rsi >= 20 && rsi < 35) score += 8;   // Dip — erken ama potansiyel yüksek
  if (rsi >= 35 && rsi < 55) score += 20;  // Birikim — optimal
  if (rsi >= 55 && rsi < 75) score += 12;  // Rally — devam edebilir
  if (rsi >= 75)             score += 2;   // Aşırı alım — dikkatli

  // ── 52H Pozisyon ─────────────────────────────────────────────────────
  // Dipten %8-30 yukarıda = dip atlatıldı, hala potansiyel var
  const fromLow = input.pctFrom52wLow ?? 0;
  if (fromLow >= 8  && fromLow <= 20) score += 15;  // İdeal bölge
  if (fromLow >= 5  && fromLow < 8)  score += 10;  // Biraz az toparlama
  if (fromLow > 20  && fromLow <= 35) score += 8;  // Toparlama fazla ama ok
  if (fromLow > 35)                   score -= 5;  // Çok yüksek gitmiş

  // Tepeye çok yakın — direnç riski
  const fromHigh = input.pctFrom52wHigh ?? -100;
  if (fromHigh > -5)   score -= 15; // %5'ten yakın — direnç tam üstünde
  if (fromHigh > -3)   score -= 20; // Kritik direnç

  // ── Hacim ────────────────────────────────────────────────────────────
  const rv = input.relVol5 ?? 1;
  if (rv >= 1.5) score += 10;  // Belirgin birikim
  if (rv >= 2.0) score += 5;   // Güçlü birikim
  if (rv < 0.7)  score -= 5;   // Hacim kuruyordu

  // ── Sinyal Kalitesi ───────────────────────────────────────────────────
  if (input.hasHigherLows)       score += 15; // Yapısal dönüş başlamış
  if (input.hasBollingerSqueeze) score += 10; // Enerji birikmiş
  if (input.hasPreSignal)        score += 12; // Pre-signal = erken uyarı

  // ── MTF + Confluence ─────────────────────────────────────────────────
  if (input.weeklyAligned)       score += 8;
  const conf = input.confluenceScore ?? 0;
  if (conf >= 70) score += 10;
  else if (conf >= 55) score += 6;
  else if (conf >= 40) score += 3;

  // ── Geçmiş Win Rate ──────────────────────────────────────────────────
  if (input.winRate !== null) {
    if (input.winRate >= 0.65) score += 15;
    else if (input.winRate >= 0.55) score += 10;
    else if (input.winRate >= 0.45) score += 5;
    else if (input.winRate < 0.40)  score -= 5;
  }

  return Math.max(0, score);
}

/** Faz string'ini parse et */
export function parsePhaseFromRsi(rsi: number | null): MarketPhase | null {
  if (rsi === null) return null;
  if (rsi < 35) return 1;
  if (rsi < 55) return 2;
  if (rsi < 75) return 3;
  return 4;
}
