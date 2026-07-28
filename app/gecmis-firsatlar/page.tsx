import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { GecmisFirsatlarScreen } from '@/components/new/GecmisFirsatlarScreen';

// Eski dev sayfası (filtre + tablo, eski tema) git geçmişinde korunuyor — bu ekran
// yeni AppShell tasarımına taşındı (evaluate backlog drenajı sonrası veri güncel).
export const metadata: Metadata = {
  title: 'Geçmiş Fırsatlar | bistAI',
  description: 'Geçmiş sinyallerin gerçekleşen performansı — kaçırılan fırsatlar ve isabet oranı. Kural-tabanlı, yatırım tavsiyesi değildir.',
};

export default function GecmisFirsatlarPage() {
  return (
    <AppShell>
      <GecmisFirsatlarScreen />
    </AppShell>
  );
}
