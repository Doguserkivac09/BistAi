import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { GecmisFirsatlarScreen } from '@/components/new/GecmisFirsatlarScreen';
import { BakimEkrani } from '@/components/new/BakimEkrani';
import { isUnderMaintenance } from '@/lib/maintenance';

// Eski dev sayfası (filtre + tablo, eski tema) git geçmişinde korunuyor — bu ekran
// yeni AppShell tasarımına taşındı (evaluate backlog drenajı sonrası veri güncel).
export const metadata: Metadata = {
  title: 'Geçmiş Fırsatlar | bistAI',
  description: 'Geçmiş sinyallerin gerçekleşen performansı. Bu bölüm geçici olarak bakımdadır.',
};

// ⚠️ 2026-09-11: Fırsatlar ile birlikte bakıma alındı (aynı anahtar: `firsatlar`).
export default function GecmisFirsatlarPage() {
  if (isUnderMaintenance('firsatlar')) {
    return (
      <AppShell>
        <BakimEkrani
          baslik="Geçmiş Fırsatlar bakımda"
          aciklama="Fırsatlar bölümüyle birlikte geçmiş performans ekranını da gözden geçiriyoruz. Sonuçları doğrulanmış biçimde yeniden göstereceğiz."
          alternatifler={[
            { href: '/fonlar', label: 'Fonlar', not: 'risk-ayarlı karşılaştırma' },
            { href: '/bugun', label: 'Bugün', not: 'genel görünüm' },
          ]}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <GecmisFirsatlarScreen />
    </AppShell>
  );
}
