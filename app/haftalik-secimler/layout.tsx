import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Haftanın Seçimleri — BistAI',
  description: 'BistAI algoritmasının her hafta seçtiği en güçlü BIST hisseleri ve performans takibi.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
