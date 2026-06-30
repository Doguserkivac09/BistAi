/**
 * Yeni modern-minimalist tasarım (design_handoff_bistai) ekran-ekran uygulanıyor.
 * Bu liste, hangi rotaların YENİ kabuğa (açık tema + sidebar/alt-tab) geçtiğini tutar.
 * Eski global Navbar/Footer bu rotalarda gizlenir (ChromeGate). Yeni ekran ekledikçe
 * buraya ekle; tüm ekranlar geçince eski kabuk tamamen kaldırılır.
 */
export const NEW_DESIGN_ROUTES = ['/bugun', '/portfolyo', '/firsatlar', '/makro', '/sohbet', '/profil'];

export function isNewDesignRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return NEW_DESIGN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
}
