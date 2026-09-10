/**
 * Bakım modu — TEK ANAHTAR (PREMIUM_PREVIEW deseni).
 *
 * Bir özelliği geçici olarak kapatmak için buradaki bayrağı `true` yap. Bayrak
 * ÜÇ yeri birden kapatır; başka dosyaya dokunmaya gerek yok:
 *   1. sayfa      → bakım ekranı gösterir (404 değil; kullanıcı ne olduğunu görür)
 *   2. okuma API  → 503 döner, veri SERVİS ETMEZ (doğrudan API çağrısı da kapalı)
 *   3. cron       → erken çıkar, boşuna hesap yapmaz
 *
 * ⚠️ NEDEN ÜÇÜ BİRDEN: yalnız sayfayı gizlemek yetmez — API açık kalırsa içerik
 * hâlâ yayınlanıyor demektir. Kapatma kararı içeriğin kendisiyle ilgiliyse
 * (ör. mevzuat/sunum riski) API'nin de susması gerekir.
 *
 * ── VIOP (2026-09-10, kullanıcı kararı) ──────────────────────────────────────
 * VIOP ekranı kaldıraçlı türev kontratları için `Giriş / Stop / Hedef /
 * Kaldıraç ~Nx / Teminat / Likidasyon` gösteriyordu. Bu sunum, perakende
 * kullanıcıya verilmiş bir **işlem talimatı** gibi okunabiliyor ve üründeki en
 * açık taraftı. Geri dönülecek; kod ve motor SİLİNMEDİ, yalnız kapatıldı.
 * Açmak için: `viop: false` + deploy.
 */

export const MAINTENANCE = {
  /** VIOP vadeli analiz — kaldıraçlı ürün sunumu gözden geçirilecek. */
  viop: true,
} as const;

export type MaintenanceKey = keyof typeof MAINTENANCE;

export function isUnderMaintenance(key: MaintenanceKey): boolean {
  return MAINTENANCE[key];
}

/** Bakımdaki özelliğin okuma API'lerinin döneceği gövde (503 ile birlikte). */
export const MAINTENANCE_BODY = {
  available: false,
  maintenance: true,
  message: 'Bu bölüm geçici olarak bakımda. Kısa süre içinde geri gelecek.',
} as const;
