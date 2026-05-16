import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Uzun Vade Fırsatlar — BistAI',
  description: 'Temel verilere göre güçlü BIST hisseleri — F/K, büyüme, temettü analizi ile uzun vadeli yatırım fırsatları.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
