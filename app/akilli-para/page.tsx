import { redirect } from 'next/navigation';

/**
 * /akilli-para → "Bugün" hero'suna taşındı (sadeleştirme konsolidasyonu).
 * Eski URL/bookmark korunur.
 */
export default function Page() {
  redirect('/bugun');
}
