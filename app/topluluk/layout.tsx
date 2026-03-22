import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Topluluk',
  description: 'BIST yatırımcı topluluğunda analiz paylaşın, stratejileri tartışın ve AI destekli yorumlardan faydalanın.',
  alternates: { canonical: '/topluluk' },
};

export default function ToplulukLayout({ children }: { children: React.ReactNode }) {
  return children;
}
