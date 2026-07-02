/**
 * Yeni modern-minimalist tasarım (design_handoff_bistai + design_handoff_kalan_ekranlar)
 * ekran-ekran uygulanıyor. Bu liste, hangi rotaların YENİ kabuğa (açık tema +
 * sidebar/alt-tab) geçtiğini tutar. Eski global Navbar/Footer bu rotalarda gizlenir
 * (ChromeGate). Yeni ekran ekledikçe buraya ekle; tüm ekranlar geçince eski kabuk
 * tamamen kaldırılır.
 */

// Rota + tüm alt rotaları yeni tasarımda
export const NEW_DESIGN_ROUTES = [
  '/bugun',
  '/portfolyo',
  '/firsatlar',
  '/makro',
  '/sohbet',
  '/profil',
  '/giris',
  '/kayit',
  '/karsilama',
  '/tarama',
  '/ai-portfoyler',
];

// Yalnız TAM eşleşme yeni tasarımda (alt sayfalar eski temada kalır — ör. /yardim/sinyaller)
export const NEW_DESIGN_EXACT = ['/yardim'];

// Yalnız ALT rotalar yeni tasarımda (kökün kendisi eski temada — ör. /sektorler listesi)
export const NEW_DESIGN_CHILD_ONLY = ['/sektorler'];

export function isNewDesignRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (NEW_DESIGN_EXACT.includes(pathname)) return true;
  if (NEW_DESIGN_CHILD_ONLY.some((r) => pathname.startsWith(r + '/'))) return true;
  return NEW_DESIGN_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));
}
