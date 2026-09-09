import type { Metadata } from 'next';
import { AppShell } from '@/components/new/AppShell';
import { FonDetayScreen } from '@/components/new/FonDetayScreen';

export function generateMetadata({ params }: { params: { kod: string } }): Metadata {
  const kod = params.kod?.toUpperCase() ?? '';
  return {
    title: `${kod} fonu | bistAI`,
    description: `${kod} fonunun nominal, risksize göre ve enflasyona göre getirisi; dönemsel tablo, risk ölçüleri ve kategori içi konumu.`,
  };
}

export default function FonDetayPage({
  params, searchParams,
}: {
  params: { kod: string };
  searchParams: { universe?: string };
}) {
  const universe = searchParams.universe === 'BES' ? 'BES' : 'TEFAS';
  return (
    <AppShell>
      <FonDetayScreen kod={params.kod.toUpperCase()} universe={universe} />
    </AppShell>
  );
}
