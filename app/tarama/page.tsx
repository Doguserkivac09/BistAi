import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { TaramaScreen } from '@/components/new/TaramaScreen';

export const metadata: Metadata = {
  title: 'Tarama — BistAI',
  description: 'Kendi filtreni oluştur: sinyal yönü, RSI, AI skoru ve hacim kriterlerine göre BIST hisselerini tara.',
};

// Yeni tasarım (açık tema) — Tarama. Eski gelişmiş screener git geçmişinde.
export default function TaramaPage() {
  return (
    <AppShell>
      <TaramaScreen />
    </AppShell>
  );
}
