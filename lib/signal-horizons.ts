/**
 * Sinyal ufukları — TEK GERÇEK KAYNAK (Single Source of Truth)
 *
 * Her sinyal tipinin "kanonik değerlendirme ufku" (hangi return_* kolonu) ve
 * bundan türeyen minimum değerlendirme yaşı burada tanımlanır.
 *
 * NEDEN TEK KAYNAK: Bu harita daha önce /api/firsatlar, /api/firsatlar-us ve
 * /api/signal-stats-summary içinde üç kopya halindeydi; evaluate-engine ise
 * AYRI bir SIGNAL_MIN_DAYS tablosu tutuyordu. Sonradan eklenen formasyon ve
 * pre-signal tipleri evaluate tablosuna eklenmediği için varsayılan 7 günde
 * "evaluated" işaretleniyor, 14g/30g kanonik return alanları KALICI null
 * kalıyor ve bu sinyaller win-rate döngüsünden sessizce dışlanıyordu (BUG-A).
 */

export type CanonicalReturnField = 'return_3d' | 'return_7d' | 'return_14d' | 'return_30d';

/** Sinyal tipi → kanonik değerlendirme ufku (return kolonu) */
export const SIGNAL_CANONICAL_FIELD: Record<string, CanonicalReturnField> = {
  'Altın Çapraz':            'return_30d',
  'Ölüm Çaprazı':            'return_30d',
  'Altın Çapraz Yaklaşıyor': 'return_30d', // pre-signal
  'Trend Başlangıcı':        'return_14d',
  'Destek/Direnç Kırılımı':  'return_14d',
  'Higher Lows':             'return_14d',
  'Trend Olgunlaşıyor':      'return_14d', // pre-signal
  'Direnç Testi':            'return_14d', // pre-signal
  'Çift Dip':                'return_14d', // formasyon
  'Çift Tepe':               'return_14d', // formasyon
  'Bull Flag':               'return_14d', // formasyon (devam)
  'Bear Flag':               'return_14d', // formasyon (devam — bearish)
  'Cup & Handle':            'return_30d', // uzun vadeli formasyon
  'Ters Omuz-Baş-Omuz':      'return_30d', // güçlü reversal — uzun vadeli
  'Yükselen Üçgen':          'return_14d', // sıkışma kırılımı
  'MACD Kesişimi':           'return_7d',
  'MACD Daralıyor':          'return_7d',  // pre-signal
  'RSI Uyumsuzluğu':         'return_7d',
  'Bollinger Sıkışması':     'return_7d',
  'RSI Seviyesi':            'return_3d',
  'Hacim Anomalisi':         'return_3d',
};

/** Bilinmeyen tipler için varsayılan ufuk */
export const DEFAULT_CANONICAL_FIELD: CanonicalReturnField = 'return_7d';

export function getCanonicalField(signalType: string): CanonicalReturnField {
  return SIGNAL_CANONICAL_FIELD[signalType] ?? DEFAULT_CANONICAL_FIELD;
}

/** Kanonik kolon → gereken takvim günü */
export const HORIZON_DAYS: Record<CanonicalReturnField, number> = {
  return_3d:  3,
  return_7d:  7,
  return_14d: 14,
  return_30d: 30,
};

/**
 * Bir sinyalin evaluated=true yapılabilmesi için gereken minimum takvim günü.
 * Kanonik ufuktan türetilir — ufuk dolmadan değerlendirme YAPILMAZ, aksi halde
 * kanonik return alanı kalıcı null kalır.
 */
export function getMinEvalDays(signalType: string): number {
  return HORIZON_DAYS[getCanonicalField(signalType)];
}
