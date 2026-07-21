/**
 * VIOP kontrat evreni + meta (FAZ V0 → design_handoff_viop_hub çok-varlıklı genişleme).
 *
 * Dört varlık sınıfı: Endeksler (XU030/XU100), Bankalar (tek-hisse vadeli), Emtia
 * (Altın/Gümüş — gram TL sentez), Döviz (USD/TRY, EUR/TRY). Motor/UI bu soyutlamayı
 * tüketir; kaynak (proxy → broker) değişse de arayüz sabit kalır.
 *
 * ⚠️ Sözleşme spesifikasyonları (çarpan/teminat/tick) resmi VIOP kontrat tanımından
 * DOĞRULANMALIDIR. Buradaki değerler güncellenebilir YAKLAŞIK sabitler — pozisyon
 * boyutu hesabı (viop-engine) bunları soyut kullanır, sabit değişince otomatik yansır.
 */

export type ViopAssetClass = 'endeks' | 'banka' | 'emtia' | 'doviz';

export type ViopUnderlyingKey =
  | 'XU030' | 'XU100'
  | 'GARAN' | 'AKBNK' | 'ISCTR' | 'YKBNK' | 'HALKB'
  | 'ALTIN' | 'GUMUS'
  | 'USDTRY' | 'EURTRY';

export interface ViopUnderlyingDef {
  key: ViopUnderlyingKey;
  cls: ViopAssetClass;
  /** İnsan-okur dayanak adı — ör. "Garanti BBVA", "Altın (gram TL)". */
  label: string;
  /**
   * fetchOHLCV'ye verilecek Yahoo sembol(ler)i. Tek eleman = doğrudan proxy dayanak
   * (endeks/hisse/döviz, kendi para biriminde zaten TL). İki eleman [onsUSD, usdtry] =
   * emtia sentez: TRY/gram = (onsUSD ÷ 31.1034768) × usdtry — VIOP altın/gümüş
   * kontratları gram-TL bazlı olduğu için ons-USD fiyatı doğrudan kullanmak yanlış
   * birim/para birimi olurdu.
   */
  yahoo: readonly [string] | readonly [string, string];
  /** Kontrat büyüklüğü (dayanak birimi × bu = notional). */
  multiplier: number;
  /** Başlangıç teminatı oranı (notional'ın yaklaşık %'si). */
  initialMarginRate: number;
  /** Minimum fiyat adımı (dayanağın kendi para biriminde). */
  tickSize: number;
  /**
   * Cost-of-carry "q" (temettü verimi / yabancı para faizi / lease rate — F=S·e^(r−q)T).
   * "r" tüm sınıflarda ortak TL risksiz faiz varsayımı (viop-basis.ts DEFAULT_ANNUAL_RATE).
   */
  carryYield: number;
}

const XU030_XU100_DEFAULTS = { multiplier: 10, initialMarginRate: 0.10, tickSize: 0.25, carryYield: 0.03 } as const;
// Tek-hisse vadeli: kontrat büyüklüğü 100 pay (BIST VIOP genel kuralı), teminat oranı
// endekse göre daha yüksek (hisse volatilitesi bandı ~%19-20), tick 1 kuruş.
const HISSE_DEFAULTS = { multiplier: 100, initialMarginRate: 0.20, tickSize: 0.01, carryYield: 0.02 } as const;
// Emtia (gram TL sentez): kontrat büyüklüğü 1 gram varsayımı, lease/depolama getirisi ~0.
const EMTIA_DEFAULTS = { multiplier: 1, initialMarginRate: 0.10, tickSize: 0.01, carryYield: 0 } as const;

export const VIOP_UNDERLYINGS: Record<ViopUnderlyingKey, ViopUnderlyingDef> = {
  XU030: { key: 'XU030', cls: 'endeks', label: 'BIST 30', yahoo: ['XU030.IS'], ...XU030_XU100_DEFAULTS },
  XU100: { key: 'XU100', cls: 'endeks', label: 'BIST 100', yahoo: ['XU100.IS'], ...XU030_XU100_DEFAULTS },

  GARAN: { key: 'GARAN', cls: 'banka', label: 'Garanti BBVA', yahoo: ['GARAN.IS'], ...HISSE_DEFAULTS },
  AKBNK: { key: 'AKBNK', cls: 'banka', label: 'Akbank', yahoo: ['AKBNK.IS'], ...HISSE_DEFAULTS },
  ISCTR: { key: 'ISCTR', cls: 'banka', label: 'İş Bankası (C)', yahoo: ['ISCTR.IS'], ...HISSE_DEFAULTS },
  YKBNK: { key: 'YKBNK', cls: 'banka', label: 'Yapı Kredi', yahoo: ['YKBNK.IS'], ...HISSE_DEFAULTS },
  HALKB: { key: 'HALKB', cls: 'banka', label: 'Halkbank', yahoo: ['HALKB.IS'], ...HISSE_DEFAULTS },

  ALTIN: { key: 'ALTIN', cls: 'emtia', label: 'Altın (gram TL)', yahoo: ['GC=F', 'USDTRY=X'], ...EMTIA_DEFAULTS },
  GUMUS: { key: 'GUMUS', cls: 'emtia', label: 'Gümüş (gram TL)', yahoo: ['SI=F', 'USDTRY=X'], ...EMTIA_DEFAULTS, initialMarginRate: 0.12 },

  // Döviz vadeli: resmi VIOP kontrat büyüklüğü 1.000 birim döviz. Teminat oranı endekse
  // göre düşük (kur volatilitesi TL bazında endeksten görece düşük — VIOP genel pratiği).
  // carryYield = karşı para biriminin yaklaşık risksiz faizi (r=TL ile fark → forward primi).
  USDTRY: { key: 'USDTRY', cls: 'doviz', label: 'USD/TRY', yahoo: ['USDTRY=X'], multiplier: 1000, initialMarginRate: 0.05, tickSize: 0.0001, carryYield: 0.045 },
  EURTRY: { key: 'EURTRY', cls: 'doviz', label: 'EUR/TRY', yahoo: ['EURTRY=X'], multiplier: 1000, initialMarginRate: 0.05, tickSize: 0.0001, carryYield: 0.03 },
};

export const VIOP_ASSET_CLASSES: { key: ViopAssetClass; label: string }[] = [
  { key: 'endeks', label: 'Endeksler' },
  { key: 'banka', label: 'Bankalar' },
  { key: 'emtia', label: 'Emtia' },
  { key: 'doviz', label: 'Döviz' },
];

export function underlyingsOfClass(cls: ViopAssetClass): ViopUnderlyingDef[] {
  return Object.values(VIOP_UNDERLYINGS).filter((u) => u.cls === cls);
}

export interface ViopContract {
  /** Kontrat kodu — ör. "F_XU0300825" (XU030, Ağustos 2025 vadeli). */
  code: string;
  /** Dayanak varlık anahtarı. */
  underlying: ViopUnderlyingKey;
  /** Varlık sınıfı (sekme filtresi için). */
  cls: ViopAssetClass;
  /** İnsan-okur etiket — ör. "XU030 Ağustos 2025". */
  label: string;
  /** Vade ayı (0-11). */
  expiryMonth: number;
  /** Vade yılı (4 hane). */
  expiryYear: number;
  /** Vade tarihi (son işlem günü — ilgili ayın son iş günü, yaklaşık). */
  expiry: Date;
  /** Dayanak birimi başına ₺ değeri (sözleşme çarpanı — resmi spec'ten doğrula). */
  multiplier: number;
  /** Başlangıç teminatı (yaklaşık, notional'ın oranı — güncellenebilir). */
  initialMarginRate: number;
  /** Minimum fiyat adımı. */
  tickSize: number;
}

const AY_ADLARI = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/**
 * Bir ayın son iş gününü (yaklaşık: son gün, hafta sonuysa geriye çekilmiş) döndürür.
 * VIOP tüm vadeli sözleşme gruplarında (endeks/hisse/emtia/döviz) ilgili teslim ayının
 * son iş günü sona erer — ortak VIOP kuralı.
 */
export function lastBusinessDayOfMonth(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month + 1, 0)); // ayın son günü
  const day = d.getUTCDay();
  if (day === 0) d.setUTCDate(d.getUTCDate() - 2); // Pazar → Cuma
  else if (day === 6) d.setUTCDate(d.getUTCDate() - 1); // Cumartesi → Cuma
  return d;
}

/** Kontrat kodu üretir: F_{ANAHTAR}MMYY (MM=ay 2 hane, YY=yıl 2 hane). */
function buildCode(underlying: ViopUnderlyingKey, year: number, month: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const yy = String(year % 100).padStart(2, '0');
  return `F_${underlying}${mm}${yy}`;
}

function makeContract(underlying: ViopUnderlyingKey, year: number, month: number): ViopContract {
  const def = VIOP_UNDERLYINGS[underlying];
  return {
    code: buildCode(underlying, year, month),
    underlying,
    cls: def.cls,
    label: `${def.label} ${AY_ADLARI[month]} ${year}`,
    expiryMonth: month,
    expiryYear: year,
    expiry: lastBusinessDayOfMonth(year, month),
    multiplier: def.multiplier,
    initialMarginRate: def.initialMarginRate,
    tickSize: def.tickSize,
  };
}

/**
 * VIOP vadeli çevrimi: Şubat/Nisan/Haziran/Ağustos/Ekim/Aralık (çift aylar) — tüm
 * varlık sınıflarında ortak VIOP kuralı. Verilen tarihten itibaren AKTİF (yakın +
 * sonraki) iki kontratı döndürür.
 *
 * @param now Referans tarih (varsayılan: bugün).
 * @param underlying Dayanak anahtarı (varsayılan XU030).
 */
export function getActiveViopContracts(
  now: Date = new Date(),
  underlying: ViopUnderlyingKey = 'XU030'
): ViopContract[] {
  const contracts: ViopContract[] = [];
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  // İlk çift ay ve vadesi geçmemiş kontratı bul, ardından iki tane topla
  for (let guard = 0; guard < 14 && contracts.length < 2; guard++) {
    if (month % 2 === 1) {
      // tek ay → bir sonraki çift aya geç
      month += 1;
      if (month > 11) { month = 0; year += 1; }
      continue;
    }
    const expiry = lastBusinessDayOfMonth(year, month);
    // Vade bugünden sonra mı (henüz aktif)?
    if (expiry.getTime() >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) {
      contracts.push(makeContract(underlying, year, month));
    }
    month += 2;
    if (month > 11) { month -= 12; year += 1; }
  }
  return contracts;
}

/** Tüm varlık sınıflarındaki TÜM dayanakların aktif kontratlarını düz liste olarak döndürür (cron tarama). */
export function getAllActiveViopContracts(now: Date = new Date()): ViopContract[] {
  return (Object.keys(VIOP_UNDERLYINGS) as ViopUnderlyingKey[]).flatMap((key) => getActiveViopContracts(now, key));
}

/** Vadeye kalan takvim gün sayısı (negatif = vadesi geçmiş). */
export function daysToExpiry(contract: ViopContract, now: Date = new Date()): number {
  const ms = contract.expiry.getTime() - now.getTime();
  return Math.round(ms / 86_400_000);
}
