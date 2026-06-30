'use client';

import { usePathname } from 'next/navigation';
import { isNewDesignRoute } from '@/lib/new-design-routes';

/**
 * Eski global kabuğu (Navbar/Footer) YENİ tasarım rotalarında gizler.
 * Yeni ekranlar kendi açık-tema kabuğunu (AppShell) getirir.
 */
export function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isNewDesignRoute(pathname)) return null;
  return <>{children}</>;
}
