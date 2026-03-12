import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sinyal Tarama',
  description: 'BIST hisselerini tarayın, RSI uyumsuzluğu, hacim anomalisi, trend başlangıcı ve destek/direnç kırılım sinyallerini tespit edin.',
};

export default function TaramaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
