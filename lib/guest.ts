/**
 * Misafir (anonim) oturum yardımcıları.
 *
 * NEDEN VAR: proje tanıtım aşamasında; e-posta doğrulama sürtünmesi olmadan
 * ziyaretçinin ürünü görebilmesi gerekiyor. Supabase "anonymous sign-in" ile
 * GERÇEK bir oturum açılır → RLS, portföy, izleme listesi hepsi normal çalışır
 * (sahte/paylaşılan hesap YOK).
 *
 * ⚠️ MALİYET SINIRI: anonim giriş HER TIKLAMADA yeni bir kullanıcı yaratır.
 * AI kotası kullanıcı başına olduğu için misafir çıkış-giriş yaparak kotayı
 * sonsuz yenileyebilir → sınırsız Anthropic faturası. Bu yüzden `/api/chat`
 * misafire KAPALI (bkz. GUEST_BLOCKED_MESSAGE). Önbellekli AI uçları
 * (hisse-ai-analiz vb. sembol+gün cache'li) açık kalır: oradaki maliyet
 * ziyaretçi sayısıyla değil sembol sayısıyla sınırlıdır.
 */

/** Supabase user objesinin misafir olup olmadığı (sunucu + istemci ortak). */
export function isGuestUser(
  user: { is_anonymous?: boolean | null; app_metadata?: { provider?: string | null } | null } | null | undefined,
): boolean {
  if (!user) return false;
  // supabase-js v2.42+ `is_anonymous` verir; eski/yedek yol app_metadata.provider
  return user.is_anonymous === true || user.app_metadata?.provider === 'anonymous';
}

/**
 * Misafir oturumu açılırken yazılan metadata.
 * `onboarded: true` → karşılama akışı ATLANIR (tanıtımda sürtünme istemiyoruz).
 */
export const GUEST_SIGNUP_METADATA = {
  onboarded: true,
  guest: true,
  full_name: 'Misafir',
} as const;

export const GUEST_BLOCKED_MESSAGE =
  'AI Asistan misafir modunda kullanılamıyor. Ücretsiz hesap oluşturarak hemen başlayabilirsin.';
