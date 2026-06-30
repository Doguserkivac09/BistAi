import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { FirsatlarScreen } from '@/components/new/FirsatlarScreen';

export const metadata: Metadata = {
  title: 'Fırsatlar | bistAI',
  description: 'Çoklu faktör skoruyla taranan BIST fırsatları — momentum, akıllı para, katalist. Kural-tabanlı.',
};

export default function FirsatlarPage() {
  return (
    <AppShell>
      <FirsatlarScreen />
    </AppShell>
  );
}
