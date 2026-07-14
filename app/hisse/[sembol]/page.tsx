import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import { AppShell } from '@/components/new/AppShell';
import { HisseDetayScreen } from '@/components/new/HisseDetayScreen';
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

// Yeni tasarım (açık/karanlık, liquid glass) — sade & profesyonel hero (fiyat,
// büyük grafik, S/R, hacim, AI sinyal, istatistikler, Al/Sat). Altında eski
// HisseDetailClient (hideHero) zengin sekmeleri (Teknik/AI Analiz/Temel/Haberler)
// DEĞİŞMEDEN sunar — fonksiyon envanteri korunur, yalnız üst özet yeniden tasarlandı.
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
        <HisseDetayScreen sembol={sembol} isInWatchlist={isInWatchlist} />

        {/* Detaylı analiz — Teknik/AI/Temel/Haberler sekmeleri (mevcut, değişmedi) */}
        <div className="mt-5 border-t border-hairline bg-surface-dark px-4 py-6 lg:rounded-[24px] lg:border lg:px-6">
          <HisseDetailClient
            sembol={sembol}
            isInWatchlist={isInWatchlist}
            savedSignalTypes={Array.from(savedSignalTypes)}
            hideHero
          />
        </div>
      </div>
    </AppShell>
  );
}
