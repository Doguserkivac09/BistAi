import { Suspense } from 'react';
import { GirisScreen } from '@/components/new/GirisScreen';

// Yeni tasarım (açık tema) — Karşılama / Giriş. Kendi tam-ekran kabuğunu getirir.
export default function GirisPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-page" />}>
      <GirisScreen />
    </Suspense>
  );
}
