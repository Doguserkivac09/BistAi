import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { BugunScreen } from '@/components/new/BugunScreen';

export const metadata: Metadata = {
  title: 'Bugün — Ne Yapmalıyım? | bistAI',
  description:
    'Günlük tek net aksiyon: teknik sinyal + akıllı para birikimini birleştiren kural-tabanlı motor. Uzak Dur / İzle / Değerlendir / Güçlü İzle.',
};

export default function BugunPage() {
  return (
    <AppShell>
      <BugunScreen />
    </AppShell>
  );
}
