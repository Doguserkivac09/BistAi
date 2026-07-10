/**
 * VIOP kontrat evreni + meta (FAZ V0 — VIOP-TRADINGVIEW-PLAN.md).
 *
 * Faz A: yalnız XU030 endeks vadeli kontrat(lar) — yakın vade + bir sonraki vade.
 * Motor/UI bu soyutlamayı tüketir; kaynak (proxy → broker) değişse de arayüz sabit kalır.
 *
 * ⚠️ Sözleşme spesifikasyonları (çarpan/teminat/tick) resmi VIOP kontrat tanımından
 * DOĞRULANMALIDIR. Buradaki değerler güncellenebilir sabitler (yaklaşık) — pozisyon
 * boyutu hesabı (viop-engine) bunları soyut kullanır, sabit değişince otomatik yansır.
 */

export type ViopUnderlying = 'XU030' | 'XU100';

export interface ViopContract {
  /** Kontrat kodu — ör. "F_XU0300825" (XU030, Ağustos 2025 vadeli). */
  code: string;
  /** Dayanak varlık (spot endeks). */
  underlying: ViopUnderlying;
  /** İnsan-okur etiket — ör. "XU030 Ağustos 2025". */
  label: string;
  /** Vade ayı (0-11). */
  expiryMonth: number;
  /** Vade yılı (4 hane). */
  expiryYear: number;
  /** Vade tarihi (son işlem günü — ilgili ayın son iş günü, yaklaşık). */
  expiry: Date;
  /** Endeks puanı başına ₺ değeri (sözleşme çarpanı — resmi spec'ten doğrula). */
  multiplier: number;
  /** Başlangıç teminatı (yaklaşık, notional'ın oranı ~%10 — güncellenebilir). */
  initialMarginRate: number;
  /** Minimum fiyat adımı (endeks puanı). */
  tickSize: number;
}

// XU030 endeks vadeli — yaklaşık sözleşme çarpanı (₺/puan) ve teminat oranı.
// Resmi VIOP BIST 30 Endeks Vadeli kontrat spec'i ile teyit edilecek.
const XU030_MULTIPLIER = 10;
const XU030_INITIAL_MARGIN_RATE = 0.10;
const XU030_TICK = 0.25;

const AY_ADLARI = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/**
 * Bir ayın son iş gününü (yaklaşık: son gün, hafta sonuysa geriye çekilmiş) döndürür.
 * VIOP endeks vadelileri ilgili teslim ayının son iş günü sona erer.
 */
export function lastBusinessDayOfMonth(year: number, month: number): Date {
  const d = new Date(Date.UTC(year, month + 1, 0)); // ayın son günü
  const day = d.getUTCDay();
  if (day === 0) d.setUTCDate(d.getUTCDate() - 2); // Pazar → Cuma
  else if (day === 6) d.setUTCDate(d.getUTCDate() - 1); // Cumartesi → Cuma
  return d;
}

/** Kontrat kodu üretir: F_XU030MMYY (MM=ay 2 hane, YY=yıl 2 hane). */
function buildCode(underlying: ViopUnderlying, year: number, month: number): string {
  const mm = String(month + 1).padStart(2, '0');
  const yy = String(year % 100).padStart(2, '0');
  return `F_${underlying}${mm}${yy}`;
}

function makeContract(underlying: ViopUnderlying, year: number, month: number): ViopContract {
  return {
    code: buildCode(underlying, year, month),
    underlying,
    label: `${underlying} ${AY_ADLARI[month]} ${year}`,
    expiryMonth: month,
    expiryYear: year,
    expiry: lastBusinessDayOfMonth(year, month),
    multiplier: XU030_MULTIPLIER,
    initialMarginRate: XU030_INITIAL_MARGIN_RATE,
    tickSize: XU030_TICK,
  };
}

/**
 * VIOP endeks vadeli çevrimi: Şubat/Nisan/Haziran/Ağustos/Ekim/Aralık (çift aylar).
 * Verilen tarihten itibaren AKTİF (yakın + sonraki) iki kontratı döndürür.
 *
 * @param now Referans tarih (varsayılan: bugün).
 * @param underlying Dayanak endeks (varsayılan XU030 — Faz A).
 */
export function getActiveViopContracts(
  now: Date = new Date(),
  underlying: ViopUnderlying = 'XU030'
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

/** Vadeye kalan takvim gün sayısı (negatif = vadesi geçmiş). */
export function daysToExpiry(contract: ViopContract, now: Date = new Date()): number {
  const ms = contract.expiry.getTime() - now.getTime();
  return Math.round(ms / 86_400_000);
}
