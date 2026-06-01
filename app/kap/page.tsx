import { redirect } from 'next/navigation';

// /kap → /haberler?tab=kap olarak birleştirildi (2026-05)
export default function KapRedirect() {
  redirect('/haberler?tab=kap');
}
