import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { ViopScreen } from '@/components/new/ViopScreen';

export const metadata: Metadata = {
  title: 'VIOP Vadeli Analiz — BistAI',
  description: 'XU030 endeks vadeli kontratları için kaldıraç-farkındalıklı analiz ve senaryo değerlendirmesi. Yatırım tavsiyesi değildir.',
};

// Yeni tasarım (açık tema) — VIOP vadeli analiz. Premium (tier-gated); veri proxy/gecikmeli.
export default function ViopPage() {
  return (
    <AppShell>
      <ViopScreen />
    </AppShell>
  );
}
