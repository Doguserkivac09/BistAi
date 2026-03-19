'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Star } from 'lucide-react';
import { addToWatchlist, removeFromWatchlist } from '@/app/hisse/[sembol]/actions';
import { toast } from 'sonner';

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
        toast.success(`${sembol} izleme listesinden çıkarıldı`);
      } else {
        await addToWatchlist(sembol);
        setOptimisticInList(true);
        toast.success(`${sembol} izleme listesine eklendi`);
      }
      router.refresh();
    } catch {
      setOptimisticInList(isInWatchlist);
      toast.error('İşlem başarısız oldu');
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
