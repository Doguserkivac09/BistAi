import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardWatchlist } from '@/components/DashboardWatchlist';
import { DashboardSignals } from '@/components/DashboardSignals';
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

  const [{ data: watchlistRows }, { data: savedSignalsRows }] = await Promise.all([
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
  ]);

  const watchlist = (watchlistRows ?? []) as WatchlistItem[];
  const savedSignals = (savedSignalsRows ?? []) as SavedSignal[];
  const watchlistCount = watchlist.length;
  const savedSignalsCount = await (async () => {
    const { count } = await supabase
      .from('saved_signals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    return count ?? 0;
  })();
  const lastSignalAt =
    savedSignals.length > 0 ? formatDate(savedSignals[0].created_at) : '—';

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-text-secondary">
            Hoş geldin, {user.email ?? 'Kullanıcı'}
          </p>
        </div>

        <section className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card className="border-border bg-surface/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-secondary">
                İzleme listesi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-text-primary">
                {watchlistCount}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border bg-surface/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-secondary">
                Kayıtlı sinyal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold text-text-primary">
                {savedSignalsCount}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border bg-surface/80">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-text-secondary">
                Son sinyal
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-medium text-text-primary">
                {lastSignalAt}
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="mb-8">
          <Card className="border-border bg-surface/80">
            <CardHeader>
              <CardTitle className="text-base">İzleme listesi</CardTitle>
            </CardHeader>
            <CardContent>
              <DashboardWatchlist watchlist={watchlist} />
            </CardContent>
          </Card>
        </section>

        <section>
          <Card className="border-border bg-surface/80">
            <CardHeader>
              <CardTitle className="text-base">Kayıtlı sinyaller</CardTitle>
            </CardHeader>
            <CardContent>
              <DashboardSignals signals={savedSignals} totalCount={savedSignalsCount} />
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
