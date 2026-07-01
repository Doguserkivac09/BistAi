import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hoş geldin',
  description: 'Risk profilini ve ilgi alanlarını seç; bistAI önerilerini sana göre kişiselleştirsin.',
};

export default function KarsilamaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
