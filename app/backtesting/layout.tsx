import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Backtest',
  description: 'Teknik sinyal stratejilerinin geçmiş performansını analiz edin. Sinyal tipi ve piyasa rejimi bazında başarı oranları.',
  alternates: { canonical: '/backtesting' },
};

export default function BacktestingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
