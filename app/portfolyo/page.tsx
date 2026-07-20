import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { PortfolyoHubScreen } from '@/components/new/PortfolyoHubScreen';

export const metadata: Metadata = {
  title: 'Portföyüm | bistAI',
  description: 'Pozisyonların, kâr/zarar ve sektör dağılımı; takip listen, alarmların ve günün sinyalleri — tek ekranda.',
};

export default function PortfolyoPage() {
  return (
    <AppShell>
      <PortfolyoHubScreen />
    </AppShell>
  );
}
