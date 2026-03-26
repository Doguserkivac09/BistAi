import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import { DashboardClient } from '@/components/DashboardClient';
import type { WatchlistItem, SavedSignal } from '@/types';

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

  const [
    { data: watchlistRows },
    { data: savedSignalsRows },
    { count: portfolyoCount },
  ] = await Promise.all([
    supabase
      .from('watchlist')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('saved_signals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('portfolyo_pozisyon')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
  ]);

  const watchlist = (watchlistRows ?? []) as WatchlistItem[];
  const savedSignals = (savedSignalsRows ?? []) as SavedSignal[];
  const savedSignalsCount = savedSignals.length;
  const lastSignalAt = savedSignals.length > 0 ? formatDate(savedSignals[0]!.created_at) : '—';

  // Profil bilgilerini çek
  const { data: profileRow } = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', user.id)
    .single();

  const displayName = profileRow?.display_name?.trim() || (user.email?.split('@')[0] ?? 'Kullanıcı');
  const avatarUrl = profileRow?.avatar_url ?? null;

  return (
    <DashboardClient
      email={user.email ?? 'Kullanıcı'}
      displayName={displayName}
      avatarUrl={avatarUrl}
      watchlist={watchlist}
      savedSignals={savedSignals}
      savedSignalsCount={savedSignalsCount}
      lastSignalAt={lastSignalAt}
      portfolyoCount={portfolyoCount ?? 0}
    />
  );
}
