import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { FirsatlarScreen } from '@/components/new/FirsatlarScreen';
import { BakimEkrani } from '@/components/new/BakimEkrani';
import { isUnderMaintenance } from '@/lib/maintenance';

export const metadata: Metadata = {
  title: 'Fırsatlar | bistAI',
  description: 'Kısa vadeli fırsat listesi. Bu bölüm geçici olarak bakımdadır.',
};

// ⚠️ 2026-09-11: bakım moduna alındı (lib/maintenance.ts). Ekran ve motor SİLİNMEDİ;
// bayrak `false` yapılınca aynen geri gelir.
export default function FirsatlarPage() {
  if (isUnderMaintenance('firsatlar')) {
    return (
      <AppShell>
        <BakimEkrani
          baslik="Fırsatlar bölümü bakımda"
          aciklama="Kısa vadeli fırsat listesini gözden geçiriyoruz. Geçmiş sinyallerin gerçek sonuçlarını ölçtük ve listenin değerini daha güçlü kanıtlayana kadar bölümü kapalı tutmaya karar verdik."
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
      <FirsatlarScreen />
    </AppShell>
  );
}
