'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronDown, ChevronUp, Search, ExternalLink, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SavedSignal } from '@/types';

const PAGE_SIZE = 10;

const DIRECTION_STYLE: Record<string, string> = {
  yukari: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  asagi:  'bg-red-500/15 text-red-400 border-red-500/30',
  nötr:   'bg-white/5 text-white/40 border-white/10',
};

const DIRECTION_LABEL: Record<string, string> = {
  yukari: '↑ AL',
  asagi:  '↓ SAT',
  nötr:   '→ Nötr',
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}sa önce`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}g önce`;
  return `${Math.floor(days / 30)}ay önce`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '\u2026';
}

function renderBoldText(text: string) {
  const parts = text.split('**');
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-semibold text-text-primary">{part}</strong>
      : part
  );
}

function SignalCard({
  sig,
  selected,
  onToggle,
}: {
  sig: SavedSignal;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const MAX_LEN = 120;
  const text = sig.ai_explanation ?? '';
  const isLong = text.length > MAX_LEN;
  const direction = sig.signal_data?.direction as string | undefined;

  const cardBg =
    direction === 'yukari' ? 'border-emerald-500/15 bg-emerald-500/[0.04]' :
    direction === 'asagi'  ? 'border-red-500/15 bg-red-500/[0.04]' :
    'border-border bg-background/50';

  return (
    <li className={cn('rounded-lg border p-3', cardBg)}>
      <div className="flex items-start gap-2.5">
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-3.5 w-3.5 rounded border-border accent-primary flex-shrink-0 mt-0.5"
        />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Link
              href={`/hisse/${encodeURIComponent(sig.sembol)}`}
              className="font-mono font-semibold text-primary hover:underline"
            >
              {sig.sembol}
            </Link>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
              {sig.signal_type}
            </span>
            {direction && (
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                  DIRECTION_STYLE[direction] ?? DIRECTION_STYLE['nötr']
                )}
              >
                {DIRECTION_LABEL[direction] ?? direction}
              </span>
            )}
            <span
              className="text-xs text-text-secondary"
              title={formatDate(sig.created_at)}
            >
              {timeAgo(sig.created_at)}
            </span>
          </div>

          {/* AI açıklaması */}
          <p className="text-sm text-text-secondary leading-relaxed">
            {renderBoldText(expanded || !isLong ? text : truncate(text, MAX_LEN))}
            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="ml-1.5 text-xs text-primary hover:underline"
              >
                {expanded ? 'Daha az' : 'Devamını gör'}
              </button>
            )}
          </p>

          {/* Footer */}
          <div className="mt-1.5 flex items-center">
            <Link
              href={`/hisse/${encodeURIComponent(sig.sembol)}`}
              className="ml-auto flex items-center gap-1 text-xs text-text-secondary hover:text-primary transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="h-3 w-3" />
              Hisseye Git
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}

interface DashboardSignalsProps {
  signals: SavedSignal[];
  totalCount: number;
}

export function DashboardSignals({ signals, totalCount }: DashboardSignalsProps) {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [typeFilter, setTypeFilter] = useState('Tümü');
  const [sembolSearch, setSembolSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const signalTypes = useMemo(() => {
    const types = new Set(signals.map((s) => s.signal_type));
    return ['Tümü', ...Array.from(types).sort()];
  }, [signals]);

  const filtered = useMemo(() => {
    let items = typeFilter === 'Tümü' ? signals : signals.filter((s) => s.signal_type === typeFilter);
    if (sembolSearch.trim()) {
      items = items.filter((s) => s.sembol.includes(sembolSearch.trim()));
    }
    return items;
  }, [signals, typeFilter, sembolSearch]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleBulkDelete = async () => {
    if (!confirm(`${selected.size} sinyali silmek istediğinize emin misiniz?`)) return;
    await Promise.all(
      Array.from(selected).map((id) =>
        fetch(`/api/signals/${id}`, { method: 'DELETE' }).catch(() => null)
      )
    );
    setSelected(new Set());
    router.refresh();
  };

  return (
    <div>
      {signals.length > 0 && (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
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

          {/* Sembol arama */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-secondary pointer-events-none" />
            <input
              value={sembolSearch}
              onChange={(e) => setSembolSearch(e.target.value.toUpperCase())}
              placeholder="THYAO..."
              className="h-8 rounded-lg border border-border bg-background/50 pl-8 pr-3 text-sm text-text-primary placeholder-text-secondary/40 focus:border-primary focus:outline-none w-28"
            />
          </div>

          <span className="text-xs text-text-secondary ml-auto">
            {filtered.length} / {totalCount} sinyal
          </span>

          {/* Toplu silme */}
          {selected.size > 0 && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1 text-xs text-red-400 hover:underline"
            >
              <Trash2 className="h-3 w-3" />
              {selected.size} sinyali sil
            </button>
          )}
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
          <ul className="space-y-3">
            {visible.map((sig) => (
              <SignalCard
                key={sig.id}
                sig={sig}
                selected={selected.has(sig.id)}
                onToggle={() => toggleSelect(sig.id)}
              />
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
