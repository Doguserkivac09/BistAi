import type { Metadata } from 'next';
import { KarsilastirClient } from './KarsilastirClient';

export const metadata: Metadata = {
  title: 'Hisse Karşılaştırma | BistAI',
  description: 'BIST hisselerini yan yana karşılaştır. Fiyat, sinyal ve performans metriklerini tek ekranda görüntüle.',
};

export default function KarsilastirPage() {
  return <KarsilastirClient />;
}
