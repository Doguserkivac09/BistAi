/**
 * Hisse → makro maruziyet vektörü (SKOR-MIMARISI-PLAN FAZ 2, v1: 2 eksen).
 *
 * KESİTTE DEĞİŞKEN kanal: makro/sektör akımı × hisse maruziyeti. Skaler makronun
 * (kesitte sabit) aksine bu ranking'e MEŞRU girer — hisse-özeldir, sıralamayı gerçekten
 * ayrıştırır. Örn: para sağlığa akınca SELEC yüksek, akım-duyarsız hisse düşük etkilenir.
 *
 * v1 İKİ EKSEN (en net eşlemeli, TR'de en etkili — plan önerisi: 4 değil 2 ile başla):
 *  - usd: TL zayıflamasından (USD güçlenmesinden) fayda. İhracatçı +, ithalatçı/borçlu −.
 *  - sectorTheme: hissenin ana sektör temasına maruziyet gücü (sektör lideri = yüksek).
 * Faiz/emtia ekseni BİLİNÇLİ ertelendi: faiz işareti rejime göre döner (banka), emtia
 * yalnız birkaç hisseyi ilgilendirir — az veriyle 4 ekseni doğrulamak overfit riski.
 *
 * TEMEL: lib/sectors.ts `SECTORS[].macroSensitivity` (mevcut, şimdiye dek ATIL harita)
 * YENİDEN KULLANILIR — sıfırdan vektör yazılmaz (kod tekrarı ilkesi). Yalnız sektöründen
 * BELİRGİN sapan hisseler için ince override tablosu.
 *
 * ⚠️ Bu harita bir PRIOR'dır. Değerler kaba kademe {−1,−0.5,0,+0.5,+1} — kırılgan ondalık
 * beta DEĞİL. TR'de sektör rotasyonu episodik (birkaç büyük şok) → eksen başına bağımsız
 * gözlem az. A/B harness (FAZ 0) yalnız BARİZ hataları budar; "doğrular" demez. İnce
 * veri-türevli beta ancak F0 verisi olgunlaşınca (opsiyonel faz).
 */

import { getSectorId, SECTORS, SECTOR_REPRESENTATIVES } from '@/lib/sectors';

export interface ExposureVector {
  /** USD/TL duyarlılığı (−1..+1): TL zayıflarsa +'lı hisse kazanır, −'li kaybeder. */
  usd: number;
  /** Sektör temasına maruziyet gücü (0..1): sektör lideri/temsilcisi = yüksek. */
  sectorTheme: number;
}

/**
 * Sektöründen belirgin sapan hisseler için USD override (kaba kademe).
 * Sektör ortalaması (macroSensitivity.benefitsFromWeakTRY) çoğu hisse için yeterli;
 * burada yalnız net/uç vakalar. Boş bırakılan hisse sektör bazını alır.
 */
const USD_OVERRIDES: Record<string, number> = {
  // Güçlü ihracatçı / döviz geliri yüksek — sektör bazının üstünde
  ASELS: 0.8,  // savunma ihracatı, döviz bazlı sözleşme
  THYAO: 0.9,  // döviz geliri baskın
  PGSUS: 0.8,
  TUPRS: 0.6,  // rafineri crack spread USD
  EREGL: 0.6,  // çelik ihracatı, USD fiyatlama
  KRDMD: 0.5,
  SASA: 0.6,   // polyester ihracatı
  KORDS: 0.6,
  // İthalata/dövize borçlu — TL zayıflaması zararına
  BIMAS: -0.4, // ithal ürün maliyeti
  MGROS: -0.4,
  ENJSA: -0.3,
  AKSEN: -0.3,
};

const TIER = { high: 1, mid: 0.5, none: 0 } as const;

/** Kaba kademeye kırp (−1..+1). */
function quantize(v: number): number {
  if (v >= 0.7) return 1;
  if (v >= 0.25) return 0.5;
  if (v <= -0.7) return -1;
  if (v <= -0.25) return -0.5;
  return 0;
}

/**
 * Hissenin makro maruziyet vektörünü döndürür.
 * usd: override varsa o, yoksa sektörün benefitsFromWeakTRY bazı (kaba kademeye kırpılı).
 * sectorTheme: sektör temsilcisi (SECTOR_REPRESENTATIVES) → high, sektör üyesi → mid.
 */
export function getExposure(symbol: string): ExposureVector {
  const sym = symbol.trim().toUpperCase();
  const sectorId = getSectorId(sym);
  const sectorBase = SECTORS[sectorId]?.macroSensitivity.benefitsFromWeakTRY ?? 0;

  const usd = quantize(USD_OVERRIDES[sym] ?? sectorBase);

  const reps = SECTOR_REPRESENTATIVES[sectorId] ?? [];
  const sectorTheme = reps.includes(sym) ? TIER.high : TIER.mid;

  return { usd, sectorTheme };
}

/**
 * Ranking'e DUYARLILIK katkısı (FAZ 2 motor bağlantısı bunu tüketir).
 *
 * katkı = usd·(TL yönü akımı) + sectorTheme·(sektör akım gücü)
 *   - usdFlow: USD/TL momentumu (−1..+1). TL zayıflıyorsa (+): ihracatçı (usd>0) kazanır.
 *   - sectorFlow: hissenin sektörüne para akım gücü (−1..+1; sektör kompozit/momentum'dan).
 * Çıktı sınırlı puan bandında (±maxPts) — skaler makro gibi sıralamayı SÜRÜKLEMEZ, yalnız
 * hisse-özel eğim verir. Yön 'notr' ise 0.
 */
export function exposureContribution(
  symbol: string,
  direction: 'yukari' | 'asagi' | 'notr',
  usdFlow: number | null | undefined,
  sectorFlow: number | null | undefined,
  maxPts = 8,
): number {
  if (direction === 'notr') return 0;
  const e = getExposure(symbol);
  const uf = Number.isFinite(usdFlow ?? NaN) ? (usdFlow as number) : 0;
  const sf = Number.isFinite(sectorFlow ?? NaN) ? (sectorFlow as number) : 0;
  // Ham hizalanma (−2..+2 civarı): iki kanalın hisse-maruziyetiyle çarpımı
  const aligned = e.usd * uf + e.sectorTheme * sf;
  // Karar yönüne göre işaret: yukarı yönde pozitif akım destekler, aşağıda tersi
  const signed = direction === 'yukari' ? aligned : -aligned;
  // ±maxPts bandına sıkıştır (tanh-benzeri lineer clamp; 1.0 ham ≈ maxPts)
  return Math.round(Math.max(-maxPts, Math.min(maxPts, signed * maxPts)));
}

export const EXPOSURE_MAP_VERSION = '1.0.0';
