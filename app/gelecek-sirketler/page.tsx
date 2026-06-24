import { redirect } from 'next/navigation';

/**
 * /gelecek-sirketler → Yatırım Radarı hub'ına taşındı (FAZ 3A konsolidasyonu).
 * Eski URL/bookmark korunur: ilgili sekmeye yönlendirir.
 */
export default function Page() {
  redirect('/yatirim-radari?tab=gelecek');
}
