'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { removeFromWatchlist } from '@/app/dashboard/actions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PriceData {
  price: number;
  change1d: number;
}

interface DashboardWatchlistItemProps {
  sembol: string;
  priceData?: PriceData;
  priceLoading?: boolean;
}

export function DashboardWatchlistItem({ sembol, priceData, priceLoading }: DashboardWatchlistItemProps) {
  const router = useRouter();
  const [removed, setRemoved] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleRemove() {
    setRemoved(true);
    setPending(true);
    try {
      await removeFromWatchlist(sembol);
      toast.success(`${sembol} izleme listesinden çıkarıldı`);
      router.refresh();
    } catch {
      setRemoved(false);
      toast.error('İşlem başarısız oldu');
    } finally {
      setPending(false);
    }
  }

  if (removed) return null;

  return (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-2.5 hover:border-white/15 hover:bg-white/[0.05] transition-all">
      <Link
        href={`/hisse/${encodeURIComponent(sembol)}`}
        className="font-mono font-semibold text-primary hover:underline text-sm"
      >
        {sembol}
      </Link>

      <div className="flex items-center gap-3 ml-auto">
        {/* Fiyat + Değişim */}
        {priceLoading ? (
          <div className="h-4 w-16 rounded bg-white/5 animate-pulse" />
        ) : priceData ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white tabular-nums">
              {priceData.price.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span
              className={cn(
                'text-xs font-medium tabular-nums rounded-full px-1.5 py-0.5',
                priceData.change1d >= 0
                  ? 'text-emerald-400 bg-emerald-500/10'
                  : 'text-red-400 bg-red-500/10'
              )}
            >
              {priceData.change1d >= 0 ? '+' : ''}
              {priceData.change1d.toFixed(2)}%
            </span>
          </div>
        ) : null}

        {/* Kaldır butonu */}
        <button
          onClick={handleRemove}
          disabled={pending}
          className="text-white/20 hover:text-red-400 transition-colors text-sm font-bold disabled:opacity-40 leading-none"
        >
          {pending ? '…' : '×'}
        </button>
      </div>
    </li>
  );
}
