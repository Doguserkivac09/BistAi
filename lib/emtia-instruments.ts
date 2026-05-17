/**
 * lib/emtia-instruments.ts
 * Emtia & Endeks enstrümanları — paylaşılan tipler ve sabitler
 */

export type InstrumentCategory = 'endeks' | 'emtia' | 'doviz';
export type VolatilityLevel   = 'dusuk' | 'normal' | 'yukseldi' | 'yuksek';
export type MtfAlignment      = 'uyumlu' | 'karisik' | 'ters';
export type RiskRegime        = 'risk_on' | 'notr' | 'risk_off';

export const INSTRUMENTS = [
  { symbol: 'XU100.IS',  name: 'BIST 100',     nameShort: 'XU100',   category: 'endeks' as InstrumentCategory, currency: 'TRY', icon: '📈', desc: 'Borsa İstanbul 100 Endeksi' },
  { symbol: 'XU030.IS',  name: 'BIST 30',      nameShort: 'XU030',   category: 'endeks' as InstrumentCategory, currency: 'TRY', icon: '📊', desc: 'Borsa İstanbul 30 Endeksi' },
  { symbol: 'GC=F',      name: 'Altın',        nameShort: 'XAU/USD', category: 'emtia'  as InstrumentCategory, currency: 'USD', icon: '🥇', desc: 'Altın Vadeli ($/Ons)' },
  { symbol: 'SI=F',      name: 'Gümüş',        nameShort: 'XAG/USD', category: 'emtia'  as InstrumentCategory, currency: 'USD', icon: '🥈', desc: 'Gümüş Vadeli ($/Ons)' },
  { symbol: 'BZ=F',      name: 'Brent Petrol', nameShort: 'BRENT',   category: 'emtia'  as InstrumentCategory, currency: 'USD', icon: '🛢️', desc: 'Brent Ham Petrol ($/Varil)' },
  { symbol: 'USDTRY=X',  name: 'Dolar/TL',    nameShort: 'USD/TRY', category: 'doviz'  as InstrumentCategory, currency: 'TRY', icon: '💵', desc: 'ABD Doları / Türk Lirası' },
  { symbol: 'EURTRY=X',  name: 'Euro/TL',     nameShort: 'EUR/TRY', category: 'doviz'  as InstrumentCategory, currency: 'TRY', icon: '💶', desc: 'Euro / Türk Lirası' },
] as const;

export interface InstrumentAnalysis {
  symbol:          string;
  name:            string;
  nameShort:       string;
  category:        InstrumentCategory;
  currency:        string;
  icon:            string;
  desc:            string;

  // ── Fiyat ───────────────────────────────────────────────────────────
  lastClose:       number | null;
  changePercent:   number | null;   // günlük
  momentum30d:     number | null;   // 30 günlük % değişim
  momentum5d:      number | null;   // 5 günlük % değişim

  // ── Teknik ──────────────────────────────────────────────────────────
  rsi:             number | null;
  relVol5:         number | null;
  confluenceScore: number | null;
  atrPct:          number | null;   // ATR(14) / fiyat × 100 — volatilite %
  volatilityLevel: VolatilityLevel | null;

  // ── Çoklu Zaman Dilimi ──────────────────────────────────────────────
  weeklyTrend:     'yukari' | 'asagi' | 'yatay' | null;
  weeklyRsi:       number | null;
  mtfAlignment:    MtfAlignment | null;   // günlük + haftalık uyumu

  // ── Sinyaller ───────────────────────────────────────────────────────
  signals:         Array<{ type: string; direction: string; severity: string }>;

  // ── Karar ───────────────────────────────────────────────────────────
  decision:        'AL' | 'TUT' | 'SAT';
  decisionScore:   number;
  confidence:      'dusuk' | 'orta' | 'yuksek';
  keyReason:       string;
  bullFactors:     string[];   // AL lehine faktörler
  bearFactors:     string[];   // SAT lehine faktörler

  // ── Seviyeler ───────────────────────────────────────────────────────
  support52w:      number | null;
  resistance52w:   number | null;
  pivotS1:         number | null;   // günlük pivot support
  pivotR1:         number | null;   // günlük pivot resistance
  pctFromHigh:     number | null;   // 52H zirveye mesafe %

  // ── Meta ────────────────────────────────────────────────────────────
  error:           string | null;
}

export interface MacroRegimeSummary {
  regime:        RiskRegime;
  regimeLabel:   string;
  regimeDesc:    string;
  signals:       string[];   // "USD güçleniyor → TL baskı altında" gibi
  riskScore:     number;     // 0-100, yüksek = risk-off
}
