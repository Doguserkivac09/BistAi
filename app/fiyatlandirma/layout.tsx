import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Fiyatlandırma',
  description: 'BistAI Free, Pro ve Premium planlarını karşılaştırın. AI destekli sinyal analizi, sınırsız tarama ve topluluk erişimi.',
  alternates: { canonical: '/fiyatlandirma' },
};

export default function FiyatlandirmaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
