import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import { AppShell } from '@/components/new/AppShell';
import { HisseDetayScreen } from '@/components/new/HisseDetayScreen';

interface PageProps {
  params: { sembol: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const sembol = (params.sembol ?? '').toUpperCase();
  return {
    title: `${sembol} Hisse Analizi`,
    description: `${sembol} hissesi için teknik analiz, grafik, EMA, RSI ve AI destekli sinyal açıklamaları.`,
    openGraph: {
      title: `${sembol} — Investable Edge Hisse Analizi`,
      description: `${sembol} teknik analiz sinyalleri ve yapay zeka açıklamaları.`,
    },
    alternates: { canonical: `/hisse/${sembol}` },
  };
}

// Yeni tasarım v2 (açık/karanlık, liquid glass, SEKMELİ) — HisseDetayScreen tek
// başına 4 sekmeyi yönetir: Genel (yeni hero — mum grafik, S/R, AI sinyal) +
// Teknik/Temel/Haberler (eski HisseDetailClient'in ilgili sekmesi, controlledTab
// ile, DEĞİŞMEDEN) — fonksiyon envanteri korunur, yalnız kabuk sekmeli hale geldi.
export default async function HisseDetailPage({ params }: PageProps) {
  const rawSembol = params.sembol;
  const sembol = (typeof rawSembol === 'string' ? rawSembol : '').toUpperCase();

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/giris?redirect=${encodeURIComponent(`/hisse/${sembol}`)}`);
  }

  const [
    { data: watchlistRow },
    { data: savedSignalsRows },
  ] = await Promise.all([
    supabase
      .from('watchlist')
      .select('id')
      .eq('user_id', user.id)
      .eq('sembol', sembol)
      .maybeSingle(),
    supabase
      .from('saved_signals')
      .select('signal_type')
      .eq('user_id', user.id)
      .eq('sembol', sembol),
  ]);

  const isInWatchlist = !!watchlistRow;
  const savedSignalTypes = new Set(
    (savedSignalsRows ?? []).map((r: { signal_type: string }) => r.signal_type)
  );

  return (
    <AppShell>
      <div className="py-0 lg:px-7 lg:py-[22px]">
        <HisseDetayScreen
          sembol={sembol}
          isInWatchlist={isInWatchlist}
          savedSignalTypes={Array.from(savedSignalTypes)}
        />
      </div>
    </AppShell>
  );
}
