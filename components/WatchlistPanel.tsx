'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase';
import type { WatchlistItem } from '@/types';
import { Star, Trash2 } from 'lucide-react';

interface WatchlistPanelProps {
  userId: string;
}

export function WatchlistPanel({ userId }: WatchlistPanelProps) {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchWatchlist = async () => {
    try {
      const { data, error: err } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (err) throw err;
      setItems((data as WatchlistItem[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Liste yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, [userId]);

  const remove = async (sembol: string) => {
    try {
      await supabase
        .from('watchlist')
        .delete()
        .eq('user_id', userId)
        .eq('sembol', sembol);
      setItems((prev) => prev.filter((i) => i.sembol !== sembol));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <Card className="w-full max-w-xs">
        <CardHeader>
          <CardTitle className="text-base">İzleme Listesi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-xs">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" />
          İzleme Listesi
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {error && (
          <p className="text-sm text-bearish">{error}</p>
        )}
        {items.length === 0 && !error && (
          <p className="text-sm text-text-secondary">Henüz hisse eklemediniz.</p>
        )}
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface/50 px-3 py-2"
          >
            <Link
              href={`/hisse/${encodeURIComponent(item.sembol)}`}
              className="font-mono text-sm font-medium text-primary hover:underline"
            >
              {item.sembol}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-text-secondary hover:text-bearish"
              onClick={() => remove(item.sembol)}
              aria-label={`${item.sembol} kaldır`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
