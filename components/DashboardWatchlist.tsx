'use client';

import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DashboardWatchlistItem } from '@/components/DashboardWatchlistItem';
import { Search, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';

const PAGE_SIZE = 6;

interface DashboardWatchlistProps {
  watchlist: { id: string; sembol: string; created_at: string }[];
}

type SortMode = 'date' | 'alpha';

export function DashboardWatchlist({ watchlist }: DashboardWatchlistProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('date');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    let items = [...watchlist];

    // Arama filtresi
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      items = items.filter((w) => w.sembol.toUpperCase().includes(q));
    }

    // Sıralama
    if (sort === 'alpha') {
      items.sort((a, b) => a.sembol.localeCompare(b.sembol));
    } else {
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return items;
  }, [watchlist, search, sort]);

  return (
    <div>
      {watchlist.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-secondary" aria-hidden="true" />
            <Input
              placeholder="Sembol ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 border-border bg-background/50 pl-8 text-sm"
              aria-label="İzleme listesinde sembol ara"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSort(sort === 'date' ? 'alpha' : 'date')}
            className="gap-1 text-xs text-text-secondary"
          >
            <ArrowUpDown className="h-3 w-3" />
            {sort === 'date' ? 'Tarih' : 'A-Z'}
          </Button>
        </div>
      )}

      {watchlist.length === 0 ? (
        <p className="text-text-secondary">
          İzleme listeniz boş. Tarama veya hisse sayfalarından hisse ekleyebilirsiniz.
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-text-secondary">
          &quot;{search}&quot; ile eşleşen sembol bulunamadı.
        </p>
      ) : (
        <>
          <ul className="space-y-2">
            {filtered.slice(0, visibleCount).map((item) => (
              <DashboardWatchlistItem key={item.id} sembol={item.sembol} />
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            {visibleCount < filtered.length && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="flex-1 gap-1 text-text-secondary"
              >
                <ChevronDown className="h-4 w-4" />
                Daha fazla göster ({filtered.length - visibleCount} kalan)
              </Button>
            )}
            {visibleCount > PAGE_SIZE && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVisibleCount(PAGE_SIZE)}
                className="flex-1 gap-1 text-text-secondary"
              >
                <ChevronUp className="h-4 w-4" />
                Daha az göster
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
