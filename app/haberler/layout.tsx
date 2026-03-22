import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Haberler',
  description: 'BIST ve Borsa Istanbul ile ilgili son dakika haberleri, piyasa yorumları ve ekonomi gündemini takip edin.',
  alternates: { canonical: '/haberler' },
};

export default function HaberlerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
