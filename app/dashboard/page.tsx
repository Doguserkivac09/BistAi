'use client';

import { useState, useEffect } from 'react';
import { Navbar } from '@/components/Navbar';
import { WatchlistPanel } from '@/components/WatchlistPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase';
import { fetchOHLCVClient } from '@/lib/api-client';
import { detectAllSignals } from '@/lib/signals';
import { BIST_SYMBOLS } from '@/types';
import type { StockSignal, OHLCVCandle } from '@/types';
import Link from 'next/link';
import { SignalBadge } from '@/components/SignalBadge';

interface RecentSignal {
  sembol: string;
  signal: StockSignal;
}

export default function DashboardPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [recentSignals, setRecentSignals] = useState<RecentSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id ?? null);
      setUserEmail(user?.email ?? null);
    });
  }, []);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const collected: RecentSignal[] = [];
      for (const sembol of BIST_SYMBOLS) {
        if (collected.length >= 10) break;
        try {
          const candles = await fetchOHLCVClient(sembol, 90);
          const signals = detectAllSignals(sembol, candles);
          for (const sig of signals) {
            collected.push({ sembol, signal: sig });
            if (collected.length >= 10) break;
          }
        } catch {
          // skip
        }
      }
      if (!cancelled) setRecentSignals(collected.slice(0, 10));
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (userId === null && !userEmail) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto flex min-h-[60vh] items-center justify-center px-4">
          <Card className="w-full max-w-md p-6 text-center">
            <p className="text-text-secondary mb-4">
              Dashboardu görmek için giriş yapmalısınız.
            </p>
            <Link
              href="/giris"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90"
            >
              Giriş Yap
            </Link>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-text-secondary">
            Hoş geldiniz{userEmail ? `, ${userEmail}` : ''}.
          </p>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row">
          <div className="flex-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Son Sinyaller</CardTitle>
                <p className="text-sm text-text-secondary">
                  Taradığımız hisselerden son tespit edilen sinyaller (en fazla 10).
                </p>
              </CardHeader>
              <CardContent>
                {loading && (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                )}
                {!loading && recentSignals.length === 0 && (
                  <p className="text-text-secondary">
                    Henüz sinyal yok. Tarama sayfasından &quot;Tümünü Tara&quot; ile güncel
                    sinyalleri çekin.
                  </p>
                )}
                {!loading && recentSignals.length > 0 && (
                  <ul className="space-y-3">
                    {recentSignals.map(({ sembol, signal }, i) => (
                      <li key={`${sembol}-${signal.type}-${i}`}>
                        <Link
                          href={`/hisse/${encodeURIComponent(sembol)}`}
                          className="flex items-center justify-between rounded-lg border border-border bg-surface/50 p-3 transition hover:border-primary/50"
                        >
                          <span className="font-mono font-medium text-text-primary">
                            {sembol}
                          </span>
                          <SignalBadge
                            type={signal.type}
                            direction={signal.direction}
                            severity={signal.severity}
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
          <aside className="lg:w-80">
            {userId && <WatchlistPanel userId={userId} />}
          </aside>
        </div>
      </main>
    </div>
  );
}
