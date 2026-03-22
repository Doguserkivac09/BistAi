import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Makro Radar',
  description: 'VIX, USD/TRY, CDS, DXY ve faiz oranları ile piyasa makro rüzgarını takip edin. Sektör momentum haritası ve risk skoru.',
  alternates: { canonical: '/makro' },
};

export default function MakroLayout({ children }: { children: React.ReactNode }) {
  return children;
}
