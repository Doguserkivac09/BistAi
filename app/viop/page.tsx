import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { ViopScreen } from '@/components/new/ViopScreen';

export const metadata: Metadata = {
  title: 'VIOP Vadeli Analiz — BistAI',
  description: 'Endeks, banka, emtia ve döviz VIOP vadeli kontratları için kaldıraç-farkındalıklı long/short analiz ve senaryo değerlendirmesi. Yatırım tavsiyesi değildir.',
};

// Yeni tasarım (açık tema) — çok varlıklı VIOP hub'ı (design_handoff_viop_hub). Premium (tier-gated); veri proxy/gecikmeli.
export default function ViopPage() {
  return (
    <AppShell>
      <ViopScreen />
    </AppShell>
  );
}
