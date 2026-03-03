'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { addToWatchlist, removeFromWatchlist } from '@/app/hisse/[sembol]/actions';

interface WatchlistButtonProps {
  sembol: string;
  isInWatchlist: boolean;
}

export function WatchlistButton({ sembol, isInWatchlist }: WatchlistButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [optimisticInList, setOptimisticInList] = useState(isInWatchlist);

  async function handleClick() {
    setPending(true);
    try {
      if (optimisticInList) {
        await removeFromWatchlist(sembol);
        setOptimisticInList(false);
      } else {
        await addToWatchlist(sembol);
        setOptimisticInList(true);
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant={optimisticInList ? 'secondary' : 'outline'}
      size="sm"
      onClick={handleClick}
      disabled={pending}
      className="gap-2"
    >
      <Star
        className={`h-4 w-4 ${optimisticInList ? 'fill-primary text-primary' : ''}`}
      />
      {pending ? '...' : optimisticInList ? 'İzleme listesinde' : 'İzleme listesine ekle'}
    </Button>
  );
}
