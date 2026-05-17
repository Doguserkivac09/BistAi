import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Geçmiş Fırsatlar — Investable Edge',
  description: 'Son 90 günde çıkmış yüksek güvenli sinyaller ve gerçekleşen getirileri. Kaçırdığın fırsatları gör.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
