import { redirect } from 'next/navigation';

/**
 * /uzun-vade-firsatlar → Yatırım Radarı hub'ına taşındı (FAZ 3A konsolidasyonu).
 * Eski URL/bookmark korunur: ilgili sekmeye yönlendirir.
 */
export default function Page() {
  redirect('/yatirim-radari?tab=uzun-vade');
}
