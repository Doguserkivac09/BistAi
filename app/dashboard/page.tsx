import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import { DashboardClient } from '@/components/DashboardClient';
import type { WatchlistItem, SavedSignal } from '@/types';
import { getMacroScore } from '@/lib/macro-service';
import type { MacroScoreResult } from '@/lib/macro-score';

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export default async function DashboardPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/giris?redirect=/dashboard');
  }

  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: watchlistRows },
    { data: savedSignalsRows },
    { count: portfolyoCount },
    macroScore,
    { data: profileRow },
    { count: dailyAiCount },
  ] = await Promise.all([
    supabase
      .from('watchlist')
      .select('id, user_id, sembol, notlar, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('saved_signals')
      .select('id, user_id, sembol, signal_type, direction, signal_data, ai_explanation, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('portfolyo_pozisyon')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    getMacroScore().catch(() => null),
    supabase
      .from('profiles')
      .select('display_name, avatar_url, tier')
      .eq('id', user.id)
      .single(),
    supabase
      .from('ai_chat_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', `${today}T00:00:00Z`),
  ]);

  const watchlist = (watchlistRows ?? []) as WatchlistItem[];
  const savedSignals = (savedSignalsRows ?? []) as SavedSignal[];
  const savedSignalsCount = savedSignals.length;
  const lastSignalAt = savedSignals.length > 0 ? formatDate(savedSignals[0]!.created_at) : '—';

  const displayName = profileRow?.display_name?.trim() || (user.email?.split('@')[0] ?? 'Kullanıcı');
  const avatarUrl = profileRow?.avatar_url ?? null;
  const tier = (profileRow?.tier as string) ?? 'free';

  return (
    <DashboardClient
      email={user.email ?? 'Kullanıcı'}
      displayName={displayName}
      avatarUrl={avatarUrl}
      tier={tier}
      dailyAiCount={dailyAiCount ?? 0}
      watchlist={watchlist}
      savedSignals={savedSignals}
      savedSignalsCount={savedSignalsCount}
      lastSignalAt={lastSignalAt}
      portfolyoCount={portfolyoCount ?? 0}
      macroScore={macroScore as MacroScoreResult | null}
    />
  );
}
