'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { SavedSignal } from '@/types';

interface DashboardSignalsProps {
  signals: SavedSignal[];
  totalCount: number;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '\u2026';
}

const PAGE_SIZE = 10;

export function DashboardSignals({ signals, totalCount }: DashboardSignalsProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [typeFilter, setTypeFilter] = useState('Tümü');

  // Benzersiz sinyal tipleri
  const signalTypes = useMemo(() => {
    const types = new Set(signals.map((s) => s.signal_type));
    return ['Tümü', ...Array.from(types).sort()];
  }, [signals]);

  // Filtrele
  const filtered = useMemo(() => {
    if (typeFilter === 'Tümü') return signals;
    return signals.filter((s) => s.signal_type === typeFilter);
  }, [signals, typeFilter]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  return (
    <div>
      {signals.length > 0 && (
        <div className="mb-3 flex items-center justify-between">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-[180px] border-border bg-background/50 text-sm">
              <SelectValue placeholder="Sinyal tipi" />
            </SelectTrigger>
            <SelectContent>
              {signalTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-text-secondary">
            {filtered.length} / {totalCount} sinyal
          </span>
        </div>
      )}

      {signals.length === 0 ? (
        <p className="text-text-secondary">Henüz kayıtlı sinyal yok.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-text-secondary">
          Bu filtre ile eşleşen sinyal bulunamadı.
        </p>
      ) : (
        <>
          <ul className="space-y-4">
            {visible.map((sig) => (
              <li
                key={sig.id}
                className="rounded-lg border border-border bg-background/50 p-3"
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Link
                    href={`/hisse/${encodeURIComponent(sig.sembol)}`}
                    className="font-mono font-semibold text-primary hover:underline"
                  >
                    {sig.sembol}
                  </Link>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                    {sig.signal_type}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {formatDate(sig.created_at)}
                  </span>
                </div>
                <p className="text-sm text-text-secondary">
                  {truncate(sig.ai_explanation ?? '', 120)}
                </p>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex gap-2">
            {hasMore && (
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
