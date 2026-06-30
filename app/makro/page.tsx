import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { PiyasaScreen } from '@/components/new/PiyasaScreen';

export const metadata: Metadata = {
  title: 'Piyasa | bistAI',
  description: 'Makro göstergeler (USD/TRY, altın, brent, faiz, enflasyon) ve sektör performansı — tek ekranda.',
};

export default function PiyasaPage() {
  return (
    <AppShell>
      <PiyasaScreen />
    </AppShell>
  );
}
