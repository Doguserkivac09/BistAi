'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Bookmark, TrendingUp, TrendingDown, Trash2, RefreshCw, Bell, AlertTriangle } from 'lucide-react';

interface TrackedSignal {
  id: string;
  sembol: string;
  signal_type: string;
  direction: string | null;
  tracked_at: string;
  entry_price: number;
  confluence_score: number | null;
  sector_name: string | null;
  current_price: number;
  return_pct: number;
}

function fmtTL(v: number) {
  return v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '₺';
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function SinyalTakipPage() {
  const [items, setItems]     = useState<TrackedSignal[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/signal-tracker');
      if (res.ok) {
        const json = await res.json();
        setItems(json.items ?? []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleRemove = async (sembol: string, signal_type: string) => {
    const params = new URLSearchParams({ sembol, signal_type });
    await fetch(`/api/signal-tracker?${params}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((i) => !(i.sembol === sembol && i.signal_type === signal_type)));
  };

  const winners  = items.filter((i) => i.return_pct > 0);
  const losers   = items.filter((i) => i.return_pct <= 0);
  const avgRet   = items.length > 0
    ? items.reduce((s, i) => s + i.return_pct, 0) / items.length
    : null;

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-4xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Bookmark className="h-6 w-6 text-violet-400" />
              <h1 className="text-2xl font-bold text-text-primary">Sinyal Takipçisi</h1>
            </div>
            <p className="text-sm text-text-secondary">
              Takibe aldığın sinyaller buraya kaydedilir. Fiyat hareketi bildirim gönderir.
            </p>
          </div>
          <button onClick={() => void loadData()} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 shrink-0">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Özet bar */}
        {items.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="rounded-xl border border-border bg-surface p-4 text-center">
              <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Takipteki</p>
              <p className="text-2xl font-bold text-text-primary">{items.length}</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${winners.length > losers.length ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-surface'}`}>
              <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Kazanan / Kaybeden</p>
              <p className="text-2xl font-bold">
                <span className="text-emerald-400">{winners.length}</span>
                <span className="text-text-muted mx-1">/</span>
                <span className="text-red-400">{losers.length}</span>
              </p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${(avgRet ?? 0) > 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-surface'}`}>
              <p className="text-[11px] text-text-muted uppercase tracking-wider mb-1">Ort. Değişim</p>
              <p className={`text-2xl font-bold tabular-nums ${(avgRet ?? 0) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {avgRet != null ? `${avgRet > 0 ? '+' : ''}${avgRet.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        )}

        {/* Liste */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl border border-border bg-surface/30 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface/30 p-12 text-center">
            <Bookmark className="mx-auto h-10 w-10 text-text-muted/40 mb-3" />
            <p className="text-sm font-medium text-text-muted mb-1">Henüz takip edilen sinyal yok</p>
            <p className="text-xs text-text-muted/60 mb-4">
              Fırsatlar sayfasında bir sinyalin "Takibe Al" butonuna bas.
            </p>
            <Link href="/firsatlar"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors">
              Fırsatları Gör
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <SignalCard key={item.id} item={item} onRemove={handleRemove} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function SignalCard({ item, onRemove }: { item: TrackedSignal; onRemove: (s: string, t: string) => void }) {
  const isUp  = item.return_pct > 0;
  const isPos = item.direction === 'yukari';

  const alertThresholds = [
    { pct: 10,  label: '+%10',  cls: 'text-emerald-400' },
    { pct: 20,  label: '+%20',  cls: 'text-emerald-400 font-bold' },
    { pct: 50,  label: '+%50',  cls: 'text-amber-400 font-bold' },
    { pct: -8,  label: '-%8',   cls: 'text-red-400' },
  ];

  return (
    <div className={`rounded-xl border p-4 transition-colors ${isUp ? 'border-emerald-500/20 bg-emerald-500/3' : 'border-red-500/20 bg-red-500/3'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Link href={`/hisse/${item.sembol}`}
              className="text-base font-bold text-text-primary hover:text-primary transition-colors">
              {item.sembol}
            </Link>
            <span className={`text-xs font-medium ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPos ? '▲ AL' : '▼ SAT'}
            </span>
            <span className="text-xs text-text-muted">{item.signal_type}</span>
            {item.sector_name && (
              <span className="text-[10px] text-text-muted border border-border rounded-full px-2 py-0.5">{item.sector_name}</span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
            <div className="text-[11px]">
              <p className="text-text-muted">Takip Fiyatı</p>
              <p className="font-mono font-semibold text-text-primary">{fmtTL(item.entry_price)}</p>
            </div>
            <div className="text-[11px]">
              <p className="text-text-muted">Güncel Fiyat</p>
              <p className="font-mono font-semibold text-text-primary">{fmtTL(item.current_price)}</p>
            </div>
            <div className="text-[11px]">
              <p className="text-text-muted">Değişim</p>
              <p className={`font-bold tabular-nums text-sm ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                {item.return_pct > 0 ? '+' : ''}{item.return_pct.toFixed(2)}%
              </p>
            </div>
            <div className="text-[11px]">
              <p className="text-text-muted">Takibe Alındı</p>
              <p className="text-text-secondary">{fmtDate(item.tracked_at)}</p>
            </div>
          </div>

          {/* Bildirim eşikleri */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <Bell className="h-3 w-3 text-text-muted/60" />
            <span className="text-[10px] text-text-muted/60">Bildirim eşikleri:</span>
            {alertThresholds.map((t) => (
              <span key={t.pct} className={`text-[10px] ${t.cls}`}>{t.label}</span>
            ))}
          </div>
        </div>

        {/* Kaldır butonu */}
        <button
          onClick={() => onRemove(item.sembol, item.signal_type)}
          className="shrink-0 rounded-lg border border-border p-2 text-text-muted hover:text-red-400 hover:border-red-500/30 transition-colors"
          title="Takipten çıkar">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
