import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Kayıt Ol',
  description: 'Investable Edge\'ye ücretsiz kaydolun, BIST hisselerinde AI destekli sinyal analizine başlayın.',
};

export default function KayitLayout({ children }: { children: React.ReactNode }) {
  return children;
}
