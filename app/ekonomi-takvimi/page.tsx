import { redirect } from 'next/navigation';

// /ekonomi-takvimi → /haberler?tab=takvim olarak birleştirildi (2026-05)
export default function EkonomiTakvimRedirect() {
  redirect('/haberler?tab=takvim');
}
