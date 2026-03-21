import type { Metadata } from 'next';
import { Suspense } from 'react';
import { KarsilastirClient } from './KarsilastirClient';

export const metadata: Metadata = {
  title: 'Hisse Karşılaştırma | BistAI',
  description: 'BIST hisselerini yan yana karşılaştır. Fiyat, sinyal ve performans metriklerini tek ekranda görüntüle.',
};

export default function KarsilastirPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    }>
      <KarsilastirClient />
    </Suspense>
  );
}
