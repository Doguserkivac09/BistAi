import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sinyal Takipçisi — Investable Edge',
  description: 'Takibe aldığın sinyaller ve fiyat hareketleri.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
