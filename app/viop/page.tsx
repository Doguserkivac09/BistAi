import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { ViopScreen } from '@/components/new/ViopScreen';
import { BakimEkrani } from '@/components/new/BakimEkrani';
import { isUnderMaintenance } from '@/lib/maintenance';

export const metadata: Metadata = {
  title: 'VIOP Vadeli Analiz — BistAI',
  description: 'VIOP vadeli kontrat analizi. Bu bölüm geçici olarak bakımdadır.',
};

// Yeni tasarım (açık tema) — çok varlıklı VIOP hub'ı (design_handoff_viop_hub).
// ⚠️ 2026-09-10: bakım moduna alındı (lib/maintenance.ts). Motor ve ekran SİLİNMEDİ;
// bayrak `false` yapılınca aynen geri gelir.
export default function ViopPage() {
  if (isUnderMaintenance('viop')) {
    return (
      <AppShell>
        <BakimEkrani
          baslik="VIOP bölümü bakımda"
          aciklama="Vadeli işlem analizini gözden geçiriyoruz. Kaldıraçlı ürünlerde sunumun daha dikkatli olması gerektiğine karar verdik; bölüm hazır olduğunda geri açılacak."
          alternatifler={[
            { href: '/fonlar', label: 'Fonlar', not: 'risk-ayarlı karşılaştırma' },
            { href: '/makro', label: 'Piyasa', not: 'sektör · emtia · gündem' },
            { href: '/bugun', label: 'Bugün', not: 'genel görünüm' },
          ]}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <ViopScreen />
    </AppShell>
  );
}
