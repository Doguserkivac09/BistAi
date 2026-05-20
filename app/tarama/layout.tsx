import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tarama — Investable Edge',
  description: 'BIST hisselerini 15+ filtre ile tara: sinyal tipi, sektör, RSI, confluence, MTF uyumu, 52 hafta tepe/dip, relative volume.',
};

export default function TaramaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
