import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { FonKarsilastirScreen } from '@/components/new/FonKarsilastirScreen';

export const metadata: Metadata = {
  title: 'Fon karşılaştır | bistAI',
  description:
    'En fazla dört fonu yan yana koy: getiri, risk, kategorideki sıra ve dönemsel performans birlikte.',
};

// ⚠️ Bu statik segment `app/fonlar/[kod]` dinamik segmentinden ÖNCE eşleşir
// (Next.js statik > dinamik). Yani "karsilastir" bir fon kodu sanılmaz.
export default function FonKarsilastirPage() {
  return (
    <AppShell>
      <FonKarsilastirScreen />
    </AppShell>
  );
}
