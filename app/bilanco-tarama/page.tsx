import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { BilancoTaramaScreen } from '@/components/new/BilancoTaramaScreen';

export const metadata: Metadata = {
  title: 'Bilanço Kalitesi Taraması | bistAI',
  description: 'Tüm likit BIST evreni, kâr kalitesine göre taranır — gerçekten kâr eden vs kâğıt üstü. Risk/kalite aracı, yatırım tavsiyesi değildir.',
};

export default function BilancoTaramaPage() {
  return (
    <AppShell>
      <BilancoTaramaScreen />
    </AppShell>
  );
}
