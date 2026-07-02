import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { AiPortfoyleriScreen } from '@/components/new/AiPortfoyleriScreen';

export const metadata: Metadata = {
  title: 'AI Portföyleri — BistAI',
  description: 'Hedefine göre hazır model portföy setleri: Haftanın Seçimleri, Aegis, APEX. Sanal sermaye ile algoritmik stratejiler.',
};

// Yeni tasarım (açık tema) — AI Portföyleri. Detay sayfaları (apex/aegis) eski temada kalır.
export default function AiPortfoylerPage() {
  return (
    <AppShell>
      <AiPortfoyleriScreen />
    </AppShell>
  );
}
