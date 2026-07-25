/**
 * Skor Mimarisi v2 — merkezi konfigürasyon (SKOR-MIMARISI-PLAN.md).
 *
 * Tez: composite skoru hisse-SEÇİCİ güçlerine indir. Skaler makro/rejim kesitte
 * sabittir (belli bir günde 619 hissede aynı sayı) → sıralamayı değiştiremez, yalnız
 * ortalamayı kaydırır. Bu yüzden skaler makro skordan çıkar → KAPIYA taşınır
 * (eşik / güven / gösterilen sinyal sayısı). Makro × hisse-DUYARLILIĞI ise kesitte
 * değişkendir → ranking'e meşru katkı olarak geri konur (bkz. lib/exposure-map.ts).
 *
 * ⚠️ TEK ANAHTAR (PREMIUM_PREVIEW deseni): SCORING_V2. Kapalıyken TÜM v2 yolları
 * no-op — computeDecision bit-bazında eskiyle aynı çıktı verir (regresyon yok).
 * Açılış kademeli: yüzey-bazlı (kısa vade önce, uzun vade sonra).
 *
 * ⚠️ AÇMADAN ÖNCE: veri kirli (signal_performance evaluate backlog). Ölçemediğin
 * şeyi geliştiremezsin — FAZ 0 (A/B harness + backlog erime) bitmeden `SCORING_V2`
 * true yapılMAZ. Kod flag arkasında paralel geliştirilir, veriyle açılır.
 */

/** Ana anahtar. FAZ 0 doğrulaması bitene dek `false` kalır. */
export const SCORING_V2 = false;

/**
 * Skor yüzeyi — ufka göre ağırlık farklıdır:
 *  - 'short' (Bugün/Fırsatlar): teknik-öncelikli + temel VETO (toplamsal değil) +
 *    duyarlılık toplamsal. Makro = risk kapısı.
 *  - 'long' (Uzun Vade/Büyüyen): temel-öncelikli + teknik yalnız zamanlama.
 *    Makro yalnız enflasyon düzeltmesi (temel-girdisi).
 */
export type ScoringSurface = 'short' | 'long';

/**
 * Kademeli açılım — SCORING_V2 açıkken hangi yüzeylerde aktif.
 * Fırsatlar (short) en çok görülen + en temiz A/B → önce burada doğrulanır.
 */
export const SCORING_V2_SURFACES: Record<ScoringSurface, boolean> = {
  short: true,
  long: false,
};

/** Bu yüzeyde v2 ranking/kapı yolu aktif mi? (ana anahtar VE yüzey kademesi) */
export function isScoringV2(surface: ScoringSurface): boolean {
  return SCORING_V2 && SCORING_V2_SURFACES[surface];
}

/**
 * Rejim kapısı sabitleri — skaler makro/rejimden türetilen KAPI çıktısı (skor değil).
 * Kesitte sabit olduğu için sıralamayı değil, "kaç sinyal / hangi eşik / ne kadar
 * güven" kararını verir. Kişiye özel pozisyon boyutu (TL/lot) BİLİNÇLİ olarak YOK —
 * o kişiselleştirilmiş yatırım tavsiyesi sınırıdır. Yalnız piyasa-geneli risk duruşu.
 */
export interface RegimeGate {
  /** Piyasa risk duruşu — UI bağlam rozeti ("temkinli → daha seçici gösteriliyor"). */
  posture: 'agresif' | 'normal' | 'temkinli' | 'savunma';
  /** Güven çarpanı (0-1) — ayı/riskli rejimde güveni kısar. */
  confidenceMultiplier: number;
  /** Eşik artışı (puan) — ayı rejiminde "değerlendir" barını yükseltir. */
  thresholdBump: number;
  /** Gösterilecek maksimum sinyal sayısı — rejime göre daralır. */
  surfacedCount: number;
}

/**
 * Fiyat-tabanlı rejim → kapı. BİLİNÇLİ olarak fiyat-rejimine çapalıdır (BIST100 vs
 * 200MA, realized vol, breadth güvenilir); zayıf skaler makro (CDS/faiz proxy) yalnız
 * ince ayar. Skaler makro verisi kırılgan olduğu için ona ağır bağlanmayız.
 */
export function regimeGate(regime: string | null | undefined): RegimeGate {
  switch (regime) {
    case 'bull_trend':
      return { posture: 'agresif', confidenceMultiplier: 1.0, thresholdBump: 0, surfacedCount: 24 };
    case 'bear_trend':
      return { posture: 'temkinli', confidenceMultiplier: 0.8, thresholdBump: 8, surfacedCount: 10 };
    case 'sideways':
      return { posture: 'normal', confidenceMultiplier: 0.92, thresholdBump: 4, surfacedCount: 16 };
    default:
      return { posture: 'normal', confidenceMultiplier: 1.0, thresholdBump: 0, surfacedCount: 20 };
  }
}

export const SCORING_CONFIG_VERSION = '2.0.0-scaffold';
