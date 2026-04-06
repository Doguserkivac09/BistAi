import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import { HisseDetailClient } from './HisseDetailClient';

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
    <HisseDetailClient
      sembol={sembol}
      isInWatchlist={isInWatchlist}
      savedSignalTypes={Array.from(savedSignalTypes)}
    />
  );
}
