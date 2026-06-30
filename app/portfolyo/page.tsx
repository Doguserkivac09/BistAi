import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { PortfoyumScreen } from '@/components/new/PortfoyumScreen';

export const metadata: Metadata = {
  title: 'Portföyüm | bistAI',
  description: 'Pozisyonların, toplam değer, kâr/zarar, sektör dağılımı ve AI portföy notu — tek ekranda.',
};

export default function PortfolyoPage() {
  return (
    <AppShell>
      <PortfoyumScreen />
    </AppShell>
  );
}
