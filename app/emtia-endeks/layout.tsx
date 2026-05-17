import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Emtia & Endeks Analizi — Investable Edge',
  description: 'BIST100, BIST30, altın, gümüş, brent petrol, dolar/TL ve euro/TL için teknik sinyal analizi ve AL/TUT/SAT kararları.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
