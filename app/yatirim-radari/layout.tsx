import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Yatırım Radarı — BistAI',
  description:
    'Temel veriyle BIST hisse sıralama merkezi: Uzun Vade Kompozit Skor, Büyüme Momentumu ve Geleceği Parlak Temalar tek ekranda.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
