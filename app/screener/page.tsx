import { redirect } from 'next/navigation';

// /screener → /tarama olarak birleştirildi (2026-05)
export default function ScreenerRedirect() {
  redirect('/tarama');
}
