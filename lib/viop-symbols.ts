/**
 * VIOP kontrat evreni + meta (çok varlıklı — design_handoff_viop_hub).
 *
 * Dört varlık sınıfı: Endeksler (XU030/XU100), Bankalar (pay vadeli), Emtia
 * (Altın/Gümüş — gram TL sentez), Döviz (USD/TRY, EUR/TRY). Motor/UI bu soyutlamayı
 * tüketir; kaynak (proxy → broker) değişse de arayüz sabit kalır.
 *
 * ── Sözleşme spesifikasyonları (2026-07 Borsa İstanbul kontrat tanımları) ──────
 * ENDEKS: dayanak = endeks değerinin 1.000'e bölünmüş hali; sözleşme bunun 100 adedini
 *   temsil eder → notional = HAM ENDEKS × 0,1. (Çapraz doğrulama: endeks 1.240 iken
 *   başlangıç teminatı 14,25 TL ⇒ notional 124 TL üzerinden ~%11,5 ⇒ ~8,7x kaldıraç,
 *   aracı kurumların ilan ettiği "~1:7-10" ile tutarlı.) Nakdi uzlaşma, çift-ay çevrimi.
 * PAY: 1 sözleşme = 100 adet pay. **FİZİKİ TESLİMAT**. Vade ayları YILIN TÜM AYLARI
 *   (içinde bulunulan ay + en yakın 2 ay). Fiyat adımı 0,01.
 * DÖVİZ: 1 sözleşme = 1.000 birim döviz. Nakdi uzlaşma. Vade: içinde bulunulan ay +
 *   takip eden ay + döngü ayları + Aralık ⇒ YAKIN VADE her ay mevcut ('her-ay').
 * EMTİA (gram altın/gümüş): 1 sözleşme = 1 gram, TL/gram kotasyon. Çift-ay çevrimi.
 *
 * ⚠️ Teminat ORANLARI hâlâ yaklaşıktır (Takasbank teminat tabloları dinamiktir; VIOP
 * teminatları TL tutar olarak ilan edilir ve volatiliteyle güncellenir). Oranlar tek
 * yerde sabit — gerçek tutar beslemesi bağlandığında yalnız burası değişir.
 */

export type ViopAssetClass = 'endeks' | 'banka' | 'emtia' | 'doviz';
/** Vade çevrimi: çift aylar (Şub/Nis/Haz/Ağu/Eki/Ara) veya yılın her ayı. */
export type ViopExpiryCycle = 'cift-ay' | 'her-ay';
/** Uzlaşma: nakdi (fark ödemesi) veya fiziki teslimat (pay vadelileri). */
export type ViopSettlement = 'nakdi' | 'fiziki';

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
   * emtia sentez: TRY/gram = (onsUSD ÷ 31,1034768) × usdtry — VIOP altın/gümüş
   * kontratları gram-TL bazlı olduğu için ons-USD fiyatını doğrudan kullanmak yanlış
   * birim/para birimi olurdu.
   */
  yahoo: readonly [string] | readonly [string, string];
  /**
   * Dayanağın HAM fiyatı (Yahoo serisindeki değer) × bu = 1 kontratın TL notional'ı.
   * Endekste 0,1 (endeks/1000 × 100 adet), payda 100 (adet pay), dövizde 1.000 (birim
   * döviz), emtiada 1 (gram).
   */
  multiplier: number;
  /** Başlangıç teminatı oranı (notional'ın yaklaşık %'si). */
  initialMarginRate: number;
  /**
   * Sürdürme teminatı oranı — teminat bu seviyenin altına düşünce margin call gelir
   * (tasfiye başlangıç teminatının tamamı silinmeden ÖNCE tetiklenir). VIOP pratiğinde
   * sürdürme ≈ başlangıcın %75'i.
   */
  maintenanceMarginRate: number;
  /** Minimum fiyat adımı (dayanağın kendi kotasyon biriminde). */
  tickSize: number;
  /** Vade çevrimi. */
  cycle: ViopExpiryCycle;
  /** Uzlaşma yöntemi. */
  settlement: ViopSettlement;
  /**
   * Cost-of-carry "q" (temettü verimi / yabancı para faizi / lease rate — F=S·e^(r−q)T).
   * "r" tüm sınıflarda ortak TL risksiz faiz; cron canlı TCMB politika faizini besler.
   */
  carryYield: number;
}

// Endeks: notional = ham endeks × 0,1 (endeks/1000 × 100 adet dayanak). Nakdi, çift-ay.
const ENDEKS_DEFAULTS = {
  multiplier: 0.1, initialMarginRate: 0.10, maintenanceMarginRate: 0.075,
  tickSize: 0.25, cycle: 'cift-ay', settlement: 'nakdi', carryYield: 0.03,
} as const;
// Pay vadeli: 100 adet pay, FİZİKİ teslimat, yılın TÜM ayları, tick 0,01.
// Teminat oranı endeksten yüksek (tek hisse volatilitesi).
const PAY_DEFAULTS = {
  multiplier: 100, initialMarginRate: 0.20, maintenanceMarginRate: 0.15,
  tickSize: 0.01, cycle: 'her-ay', settlement: 'fiziki', carryYield: 0.02,
} as const;
// Emtia (gram TL): 1 gram, nakdi, çift-ay. Lease/depolama getirisi ihmal.
const EMTIA_DEFAULTS = {
  multiplier: 1, initialMarginRate: 0.10, maintenanceMarginRate: 0.075,
  tickSize: 0.01, cycle: 'cift-ay', settlement: 'nakdi', carryYield: 0,
} as const;
// Döviz: 1.000 birim, nakdi, tick 0,0001. Vade takvimi içinde bulunulan ayı da içerir
// (bu ay + takip eden ay + döngü ayları + Aralık) → yakın vade her ay mevcut.
// carryYield = karşı para biriminin yaklaşık risksiz faizi (faiz paritesi forward primi).
const DOVIZ_DEFAULTS = {
  multiplier: 1000, initialMarginRate: 0.05, maintenanceMarginRate: 0.0375,
  tickSize: 0.0001, cycle: 'her-ay', settlement: 'nakdi',
} as const;

export const VIOP_UNDERLYINGS: Record<ViopUnderlyingKey, ViopUnderlyingDef> = {
  XU030: { key: 'XU030', cls: 'endeks', label: 'BIST 30', yahoo: ['XU030.IS'], ...ENDEKS_DEFAULTS },
  XU100: { key: 'XU100', cls: 'endeks', label: 'BIST 100', yahoo: ['XU100.IS'], ...ENDEKS_DEFAULTS },

  GARAN: { key: 'GARAN', cls: 'banka', label: 'Garanti BBVA', yahoo: ['GARAN.IS'], ...PAY_DEFAULTS },
  AKBNK: { key: 'AKBNK', cls: 'banka', label: 'Akbank', yahoo: ['AKBNK.IS'], ...PAY_DEFAULTS },
  ISCTR: { key: 'ISCTR', cls: 'banka', label: 'İş Bankası (C)', yahoo: ['ISCTR.IS'], ...PAY_DEFAULTS },
  YKBNK: { key: 'YKBNK', cls: 'banka', label: 'Yapı Kredi', yahoo: ['YKBNK.IS'], ...PAY_DEFAULTS },
  HALKB: { key: 'HALKB', cls: 'banka', label: 'Halkbank', yahoo: ['HALKB.IS'], ...PAY_DEFAULTS },

  ALTIN: { key: 'ALTIN', cls: 'emtia', label: 'Altın (gram TL)', yahoo: ['GC=F', 'USDTRY=X'], ...EMTIA_DEFAULTS },
  GUMUS: { key: 'GUMUS', cls: 'emtia', label: 'Gümüş (gram TL)', yahoo: ['SI=F', 'USDTRY=X'], ...EMTIA_DEFAULTS, initialMarginRate: 0.12, maintenanceMarginRate: 0.09 },

  USDTRY: { key: 'USDTRY', cls: 'doviz', label: 'USD/TRY', yahoo: ['USDTRY=X'], ...DOVIZ_DEFAULTS, carryYield: 0.045 },
  EURTRY: { key: 'EURTRY', cls: 'doviz', label: 'EUR/TRY', yahoo: ['EURTRY=X'], ...DOVIZ_DEFAULTS, carryYield: 0.03 },
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
  /** Kontrat kodu — ör. "F_XU0300826" (XU030, Ağustos 2026 vadeli). */
  code: string;
  /** Dayanak varlık anahtarı. */
  underlying: ViopUnderlyingKey;
  /** Varlık sınıfı (sekme filtresi için). */
  cls: ViopAssetClass;
  /** İnsan-okur etiket — ör. "BIST 30 Ağustos 2026". */
  label: string;
  /** Vade ayı (0-11). */
  expiryMonth: number;
  /** Vade yılı (4 hane). */
  expiryYear: number;
  /** Vade tarihi (son işlem günü — ilgili ayın son iş günü). */
  expiry: Date;
  /** Dayanağın ham fiyatı × bu = 1 kontratın TL notional'ı. */
  multiplier: number;
  /** Başlangıç teminatı oranı. */
  initialMarginRate: number;
  /** Sürdürme teminatı oranı (margin call eşiği). */
  maintenanceMarginRate: number;
  /** Minimum fiyat adımı. */
  tickSize: number;
  /** Uzlaşma yöntemi (fiziki teslimat riski uyarısı için). */
  settlement: ViopSettlement;
}

const AY_ADLARI = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/**
 * Bir ayın son iş gününü (yaklaşık: son gün, hafta sonuysa geriye çekilmiş) döndürür.
 * VIOP'ta tüm sözleşme gruplarında vade/son işlem günü, vade ayının son iş günüdür.
 * (Resmi tatil kaynaklı yarım gün istisnası burada modellenmez — yaklaşımdır.)
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
    maintenanceMarginRate: def.maintenanceMarginRate,
    tickSize: def.tickSize,
    settlement: def.settlement,
  };
}

/**
 * Dayanağın AKTİF kontratlarını (vadesi geçmemiş, çevrimine uygun) döndürür.
 *
 * @param now Referans tarih (varsayılan: bugün).
 * @param underlying Dayanak anahtarı (varsayılan XU030).
 * @param count Kaç vade döndürülsün (varsayılan 1 = yalnız yakın vade).
 */
export function getActiveViopContracts(
  now: Date = new Date(),
  underlying: ViopUnderlyingKey = 'XU030',
  count = 1,
): ViopContract[] {
  const cycle = VIOP_UNDERLYINGS[underlying].cycle;
  const contracts: ViopContract[] = [];
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (let guard = 0; guard < 26 && contracts.length < count; guard++) {
    const cycleOk = cycle === 'her-ay' || month % 2 === 1; // çift-ay çevrimi = Şub(1)/Nis(3)/…/Ara(11)
    if (cycleOk && lastBusinessDayOfMonth(year, month).getTime() >= todayUtc) {
      contracts.push(makeContract(underlying, year, month));
    }
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return contracts;
}

/**
 * Tüm dayanakların YAKIN vadeli kontratlarını düz liste olarak döndürür (cron tarama + UI).
 *
 * Dayanak başına TEK kontrat: teknik analiz aynı spot seriden türediği için aynı
 * dayanağın farklı vadeleri neredeyse özdeş yön/skor üretir (yalnız baz farklıdır) —
 * çoklu vade listeyi bilgi tekrarıyla şişirirdi.
 */
export function getAllActiveViopContracts(now: Date = new Date()): ViopContract[] {
  return (Object.keys(VIOP_UNDERLYINGS) as ViopUnderlyingKey[])
    .flatMap((key) => getActiveViopContracts(now, key, 1));
}

/** Vadeye kalan takvim gün sayısı (negatif = vadesi geçmiş). */
export function daysToExpiry(contract: ViopContract, now: Date = new Date()): number {
  const ms = contract.expiry.getTime() - now.getTime();
  return Math.round(ms / 86_400_000);
}
