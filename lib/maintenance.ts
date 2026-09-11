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
  /**
   * Kısa vade fırsatlar + geçmiş fırsatlar (2026-09-11, kullanıcı kararı).
   * Ölçüm: signal_performance'ta 118 bin BIST sinyali, kazanan %46, ort. net −%0,44
   * (komisyon kadar kayıp = yazı-tura). Avantajı kanıtlanmamış bir listeyi
   * "AL / giriş fiyatı" diye sunmak yanıltıcı ve mevzuat riski.
   * Fırsat sicili (firsat_picks) bakımda da birikmeye DEVAM eder — geri açma
   * kararı o veriyle verilir (bkz. isInternalCronRequest).
   */
  firsatlar: true,
} as const;

export type MaintenanceKey = keyof typeof MAINTENANCE;

export function isUnderMaintenance(key: MaintenanceKey): boolean {
  return MAINTENANCE[key];
}

/**
 * İç ölçüm isteği mi? Bakımdaki bir API'yi YALNIZ CRON_SECRET taşıyan istek okuyabilir.
 *
 * ⚠️ NEDEN: fırsat sicili snapshot'ı listeyi kendi API'mizden alır ("gösterilen" ile
 * "ölçülen" ayrışmasın diye). API tamamen kapansaydı sicil durur ve "ne zaman geri
 * açalım?" sorusunun verisi hiç birikmezdi. Kamuya içerik yine SERVİS EDİLMEZ.
 */
export function isInternalCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  return !!secret && token === secret;
}

/** Bakımdaki özelliğin okuma API'lerinin döneceği gövde (503 ile birlikte). */
export const MAINTENANCE_BODY = {
  available: false,
  maintenance: true,
  message: 'Bu bölüm geçici olarak bakımda. Kısa süre içinde geri gelecek.',
} as const;
