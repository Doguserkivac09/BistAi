/** FRED API'den gelen tek bir gözlem */
export interface FredObservation {
  date: string;
  value: number;
  seriesId: string;
}

/** Anlık makro ekonomik göstergeler snapshot'ı */
export interface MacroSnapshot {
  timestamp: string;
  fed_rate: number | null;
  cpi_yoy: number | null;
  gdp_growth: number | null;
  unemployment: number | null;
  yield_curve_10y2y: number | null;
  dollar_index: number | null;
  vix: number | null;
  us_10y_yield: number | null;
}

/** macro_data tablosundaki satır */
export interface MacroDataRow {
  id: string;
  indicator_key: string;
  value: number;
  observation_date: string;
  source: 'fred' | 'yahoo' | 'manual';
  fetched_at: string;
}

/** Risk motoru girdi */
export interface RiskInputs {
  vix: number | null;
  vix_sma20: number | null;
  yield_10y: number | null;
  yield_curve: number | null;
  dollar_index: number | null;
  bist_regime: 'bull_trend' | 'bear_trend' | 'sideways';
}

/** Risk skoru çıktı */
export interface RiskScore {
  score: number;
  status: 'risk-off' | 'neutral' | 'risk-on';
  components: {
    vix_component: number;
    yield_component: number;
    currency_component: number;
    regime_component: number;
  };
  timestamp: string;
}

/** Sektör momentum çıktı */
export interface SectorMomentum {
  sector_id: string;
  sector_name: string;
  score: number;
  price_momentum: number;
  volume_flow: number;
  macro_alignment: number;
  member_count: number;
  top_performer: string;
  worst_performer: string;
  signal_density: number;
}

/** AI tahmin çıktı */
export interface Prediction {
  symbol: string;
  action: 'BUY' | 'HOLD' | 'SELL';
  confidence: number;
  risk_level: 'low' | 'medium' | 'high';
  reasoning: string;
  key_factors: string[];
  time_horizon: '3d' | '7d' | '14d';
  generated_at: string;
}

/** FRED API seri tanımları */
export const FRED_SERIES = {
  FEDFUNDS: { id: 'FEDFUNDS', name: 'Fed Funds Rate', unit: '%' },
  CPIAUCSL: { id: 'CPIAUCSL', name: 'CPI (Enflasyon)', unit: 'index' },
  GDP: { id: 'GDP', name: 'US GDP', unit: 'billion $' },
  UNRATE: { id: 'UNRATE', name: 'İşsizlik Oranı', unit: '%' },
  T10Y2Y: { id: 'T10Y2Y', name: 'Yield Curve (10Y-2Y)', unit: '%' },
  DTWEXBGS: { id: 'DTWEXBGS', name: 'Dolar Endeksi', unit: 'index' },
} as const;

export type FredSeriesId = keyof typeof FRED_SERIES;
