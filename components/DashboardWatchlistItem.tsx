'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { removeFromWatchlist } from '@/app/dashboard/actions';

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
      router.refresh();
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
