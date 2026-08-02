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
 * DURUM (27 Tem 2026): AÇILDI (yalnız 'short' yüzeyi — Bugün/Fırsatlar). Evaluate
 * backlog çözüldü (142.858→~15k sağlıklı taban, sembol-bazlı motor), entry tarihleri
 * güncellendi. A/B harness 3 tutarlı koşuda v2'yi her eksende önde gösterdi (boğa):
 * wr %69/%64, Sharpe 0.53/0.19, maxDD %13/%83. Kullanıcı kararıyla açıldı.
 * KALAN RİSK: kanıt boğa-piyasası ağırlıklı (ayı-rejimi örneği yok — pre-registered
 * "ayı maxDD B≤A" şartı ölçülemedi). Bir düzeltme/ayı döneminde davranışı izle; sorun
 * çıkarsa `false` yap (tek satır geri alma, anında eski v1.2.0 davranışı).
 */

/** Ana anahtar. 27 Tem 2026'da açıldı (short yüzeyi). Sorun çıkarsa `false` = anında rollback. */
export const SCORING_V2 = true;

/**
 * Fırsatlar YAYIN eşiği (FAZ S0 — tuzak eleme). "Fırsatlar sayfasında olmak başlı başına
 * onaydır" → nihai skoru bu eşiğin altında olan hisse listeye ÇIKMAZ. Yalnız SCORING_V2
 * açıkken uygulanır (kapalıyken eski davranış). 40 = zayıf uzun kuyruğu eler, ~25-35
 * anlamlı fırsat kalır. (Plandaki 55 bu skor ölçeğinde listeyi ~3'e düşürüyordu — ölçek
 * sinyal-denetimi ağırlık düşüşü sonrası sıkıştı; A/B ile ileride ayarlanır.)
 */
export const MIN_PUBLISH_SCORE = 40;

/**
 * Sert red-flag (kâr kalitesi) — bu verdict'lerdeki hisse Fırsatlar'da HİÇBİR katmanda
 * görünmez. 'kağıt-üstü' = net kâr var ama faaliyet zararı / kâr operasyondan değil.
 * (earnings-quality-engine verdict'i; earnings-quality:MAP:BIST'ten okunur.)
 */
export const HARD_FLAG_VERDICTS: readonly string[] = ['kağıt-üstü'];

/**
 * FAZ S2 — "onaylı kurulum" katmanı için gereken minimum Yatırım Skoru (temel teyidi).
 * Altında kalan / temel verisi olmayan hisse 'teknik' katmanına düşer: listeden ELENMEZ,
 * ama varsayılan görünümde gizlenir ve "yalnız teknik" etiketiyle gösterilir.
 * 45 = investment-score'un "nötr" bandının alt sınırı (80/65/45/30 eşikleri).
 */
export const MIN_FUNDAMENTAL_CONFIRM = 45;

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
