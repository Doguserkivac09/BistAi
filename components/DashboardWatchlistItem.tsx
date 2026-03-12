'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { removeFromWatchlist } from '@/app/dashboard/actions';
import { toast } from 'sonner';

interface DashboardWatchlistItemProps {
  sembol: string;
}

export function DashboardWatchlistItem({ sembol }: DashboardWatchlistItemProps) {
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

  if (removed) {
    return null;
  }

  return (
    <li className="flex items-center justify-between gap-2">
      <Link
        href={`/hisse/${encodeURIComponent(sembol)}`}
        className="font-mono font-medium text-primary hover:underline"
      >
        {sembol}
      </Link>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRemove}
        disabled={pending}
        className="text-text-secondary hover:text-bearish shrink-0"
      >
        {pending ? '...' : 'Kaldır'}
      </Button>
    </li>
  );
}
