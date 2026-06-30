import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { AiAsistanScreen } from '@/components/new/AiAsistanScreen';

export const metadata: Metadata = {
  title: 'AI Asistan | bistAI',
  description: 'Canlı piyasa verisine bağlı AI asistan — sade dille analiz. Yatırım tavsiyesi değildir.',
};

export default function SohbetPage() {
  return (
    <AppShell>
      <AiAsistanScreen />
    </AppShell>
  );
}
