import { notFound } from 'next/navigation';
import { ENABLE_US } from '@/lib/flags';

/**
 * US özellikleri şimdilik gizli (ölü kod). ENABLE_US kapalıyken bu route
 * dışarıdan 404 — sayfa kodu/altyapısı korunur, flag açılınca geri gelir.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  if (!ENABLE_US) notFound();
  return children;
}
