'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  Star, Plus, Trash2, RefreshCw, TrendingUp, TrendingDown,
  AlertCircle, X, Search, Eye, Briefcase, ChevronDown,
} from 'lucide-react';
import { BIST_SYMBOLS } from '@/types';
import Link from 'next/link';

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface WatchlistItem {
  id: string;
  sembol: string;
  notlar: string | null;
  created_at: string;
}

interface SinvalInfo {
  type: string;
  direction: 'yukari' | 'asagi' | 'nötr';
  severity: 'güçlü' | 'orta' | 'zayıf';
}

interface FiyatInfo {
  fiyat: number;
  degisim: number;
  candles: number[]; // son 14 kapanış
}

type SortBy = 'date' | 'change' | 'signal' | 'alpha';

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function dirColor(d: string) {
  if (d === 'yukari') return 'text-emerald-400';
  if (d === 'asagi')  return 'text-red-400';
  return 'text-zinc-400';
}

function sevBadge(s: string) {
  if (s === 'güçlü') return 'bg-red-500/20 text-red-400';
  if (s === 'orta')  return 'bg-amber-500/20 text-amber-400';
  return 'bg-zinc-500/20 text-zinc-400';
}

// ─── Sparkline (inline SVG) ───────────────────────────────────────────────────

function Sparkline({ closes }: { closes: number[] }) {
  if (closes.length < 2) return <div className="h-6 w-12 shrink-0" />;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const W = 48, H = 24;
  const pts = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * W;
    const y = H - 2 - ((c - min) / range) * (H - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const isUp = closes[closes.length - 1]! >= closes[0]!;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 opacity-80">
      <polyline
        points={pts}
        fill="none"
        stroke={isUp ? '#34d399' : '#f87171'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Boş durum ────────────────────────────────────────────────────────────────

function EmptyWatchlist({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Star className="h-10 w-10 text-primary/60" />
      </div>
      <h2 className="mb-2 text-xl font-semibold text-text-primary">İzleme listeniz boş</h2>
      <p className="mb-8 max-w-sm text-sm text-text-secondary">
        Takip etmek istediğin hisseleri ekle, sinyal çıktığında e-posta ile bildirim al.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Hisse Ekle
      </button>
    </motion.div>
  );
}

// ─── Hisse satırı ─────────────────────────────────────────────────────────────

function WatchRow({
  item, fiyat, sinyaller, onDelete, isSelected, onToggleSelect,
  target, onTargetChange,
}: {
  item: WatchlistItem;
  fiyat: FiyatInfo | null;
  sinyaller: SinvalInfo[];
  onDelete: (id: string) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  target: string;
  onTargetChange: (sembol: string, value: string) => void;
}) {
  const router = useRouter();
  const up = fiyat && fiyat.degisim >= 0;
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState(target);
  const targetRef = useRef<HTMLInputElement>(null);

  const targetNum = parseFloat(target);
  const hitTarget = fiyat && target && !isNaN(targetNum) && fiyat.fiyat >= targetNum;

  useEffect(() => {
    setTargetInput(target);
  }, [target]);

  function commitTarget() {
    setEditingTarget(false);
    onTargetChange(item.sembol, targetInput.trim());
  }

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`border-b border-border/40 hover:bg-surface-alt/30 transition-colors ${hitTarget ? 'bg-amber-500/5' : ''}`}
    >
      {/* Checkbox */}
      <td className="py-3 pl-3 pr-1">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(item.id)}
          className="h-3.5 w-3.5 cursor-pointer accent-primary"
        />
      </td>

      {/* Sembol */}
      <td className="py-3 pl-2 pr-3">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary ${hitTarget ? 'animate-pulse' : ''}`}>
            {item.sembol.slice(0, 2)}
          </div>
          <div>
            <div className={`font-semibold ${hitTarget ? 'text-amber-400' : 'text-text-primary'}`}>
              {item.sembol}
              {hitTarget && <span className="ml-1 animate-bounce inline-block">🔔</span>}
            </div>
            {item.notlar && (
              <div className="text-xs text-text-muted truncate max-w-[120px]">{item.notlar}</div>
            )}
          </div>
        </div>
      </td>

      {/* Fiyat + sparkline */}
      <td className="py-3 px-3 text-right">
        <div className="flex items-center justify-end gap-2">
          {fiyat && fiyat.candles.length > 1 && (
            <Sparkline closes={fiyat.candles} />
          )}
          <div>
            {fiyat ? (
              <>
                <div className="text-xs sm:text-sm font-medium text-text-primary">
                  ₺{fiyat.fiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
                <div className={`flex items-center justify-end gap-0.5 text-xs ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                  {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {up ? '+' : ''}{fiyat.degisim.toFixed(2)}%
                </div>
              </>
            ) : (
              <span className="text-text-muted">—</span>
            )}
          </div>
        </div>
      </td>

      {/* Hedef fiyat */}
      <td className="hidden sm:table-cell py-3 px-3 text-right">
        {editingTarget ? (
          <input
            ref={targetRef}
            type="number"
            step="0.01"
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            onBlur={commitTarget}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTarget(); if (e.key === 'Escape') setEditingTarget(false); }}
            className="w-20 rounded border border-primary/50 bg-surface px-2 py-1 text-xs text-text-primary focus:outline-none text-right"
            autoFocus
          />
        ) : (
          <button
            onClick={() => { setEditingTarget(true); setTimeout(() => targetRef.current?.focus(), 0); }}
            className="group flex items-center justify-end gap-1 text-xs transition-colors"
            title="Hedef fiyat belirle"
          >
            <span className="text-[10px] opacity-50 group-hover:opacity-100">🎯</span>
            <span className={target ? (hitTarget ? 'font-semibold text-amber-400' : 'text-text-secondary') : 'text-text-muted/50 group-hover:text-text-muted'}>
              {target ? `₺${parseFloat(target).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}` : 'Hedef ekle'}
            </span>
          </button>
        )}
      </td>

      {/* Sinyaller */}
      <td className="hidden sm:table-cell py-3 px-3">
        {sinyaller.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {sinyaller.slice(0, 2).map((sig, i) => (
              <span key={i} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${sevBadge(sig.severity)}`}>
                <span className={dirColor(sig.direction)}>
                  {sig.direction === 'yukari' ? '▲' : sig.direction === 'asagi' ? '▼' : '→'}
                </span>
                {sig.type}
              </span>
            ))}
            {sinyaller.length > 2 && (
              <span className="text-xs text-text-muted">+{sinyaller.length - 2}</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-text-muted">Sinyal yok</span>
        )}
      </td>

      {/* İşlemler */}
      <td className="py-3 pl-3 pr-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/hisse/${item.sembol}`}
            className="rounded-lg p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
            title="Detay"
          >
            <Eye className="h-4 w-4" />
          </Link>
          <button
            onClick={() => router.push(`/portfolyo?add=${item.sembol}`)}
            className="rounded-lg p-1.5 text-text-muted hover:text-emerald-400 hover:bg-emerald-400/10 transition-colors"
            title="Portföye Ekle"
          >
            <Briefcase className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="rounded-lg p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Kaldır"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}

// ─── Hisse Ekle Modal ─────────────────────────────────────────────────────────

const TAKIP_SECENEKLERI = [
  { value: '', label: 'Seçiniz (opsiyonel)' },
  { value: 'Kısa vadeli takip', label: '📈 Kısa vadeli takip' },
  { value: 'Uzun vadeli takip', label: '🏦 Uzun vadeli takip' },
  { value: 'Temettü takibi',    label: '💰 Temettü takibi' },
  { value: 'Teknik analiz',     label: '📊 Teknik analiz' },
  { value: 'Sinyal bekleniyor', label: '🔔 Sinyal bekleniyor' },
];

function AddModal({
  onClose, onSave,
}: {
  onClose: () => void;
  onSave: (sembol: string, notlar: string) => Promise<void>;
}) {
  const [search, setSearch]   = useState('');
  const [notlar, setNotlar]   = useState('');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [selected, setSelected] = useState('');

  const filtered = search.length >= 1
    ? BIST_SYMBOLS.filter((s) => s.includes(search.toUpperCase())).slice(0, 8)
    : [];

  async function handleSave() {
    if (!selected) { setError('Hisse seçmelisin'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(selected, notlar);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata oluştu');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
            <Star className="h-4 w-4 text-primary" />
            Watchlist'e Ekle
          </h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3">
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">
            Hisse Sembolü <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={selected || search}
              onChange={(e) => { setSearch(e.target.value); setSelected(''); setError(null); }}
              placeholder="THYAO, GARAN…"
              className="w-full rounded-lg border border-border bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none"
            />
          </div>
          {filtered.length > 0 && !selected && (
            <div className="mt-1 rounded-lg border border-border bg-surface shadow-lg overflow-hidden">
              {filtered.map((s) => (
                <button
                  key={s}
                  onClick={() => { setSelected(s); setSearch(''); }}
                  className="w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-surface-alt transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-text-secondary">
            Takip Sebebi <span className="text-text-muted">(opsiyonel)</span>
          </label>
          <select
            value={notlar}
            onChange={(e) => setNotlar(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-primary focus:outline-none cursor-pointer"
          >
            {TAKIP_SECENEKLERI.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2.5 text-sm text-text-secondary hover:border-text-muted transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !selected}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Ekleniyor…' : '+ Ekle'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function WatchlistPage() {
  const [items, setItems]           = useState<WatchlistItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [fiyatlar, setFiyatlar]     = useState<Record<string, FiyatInfo>>({});
  const [sinyalMap, setSinyalMap]   = useState<Record<string, SinvalInfo[]>>({});
  const [sortBy, setSortBy]         = useState<SortBy>('date');
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [targets, setTargets]       = useState<Record<string, string>>({});
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // localStorage'dan hedef fiyatları yükle
  useEffect(() => {
    if (items.length === 0) return;
    const loaded: Record<string, string> = {};
    items.forEach((item) => {
      const val = localStorage.getItem(`bistai_targets_${item.sembol}`);
      if (val) loaded[item.sembol] = val;
    });
    setTargets(loaded);
  }, [items]);

  function handleTargetChange(sembol: string, value: string) {
    setTargets((prev) => ({ ...prev, [sembol]: value }));
    if (value) localStorage.setItem(`bistai_targets_${sembol}`, value);
    else localStorage.removeItem(`bistai_targets_${sembol}`);
  }

  // ── Veri yükle ────────────────────────────────────────────────────────────

  const loadItems = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await fetch('/api/watchlist');
      if (res.status === 401) { setError('Watchlist için giriş yapmalısın.'); return; }
      if (!res.ok) throw new Error('Yüklenemedi.');
      const data: WatchlistItem[] = await res.json();
      setItems(data);

      const semboller = data.map((d) => d.sembol);
      const fm: Record<string, FiyatInfo> = {};

      await Promise.allSettled(
        semboller.map(async (sembol) => {
          try {
            const r = await fetch(`/api/ohlcv?symbol=${sembol}&days=20`);
            if (!r.ok) return;
            const json: { candles: { close: number; open: number }[] } = await r.json();
            const candles = json.candles ?? [];
            if (candles.length < 2) return;
            const last = candles[candles.length - 1]!;
            const prev = candles[candles.length - 2]!;
            fm[sembol] = {
              fiyat: last.close,
              degisim: ((last.close - prev.close) / prev.close) * 100,
              candles: candles.slice(-14).map((c) => c.close),
            };
          } catch {}
        })
      );
      setFiyatlar(fm);

      if (semboller.length > 0) {
        fetch(`/api/portfolyo/sinyaller?semboller=${semboller.join(',')}`)
          .then((r) => r.json())
          .then((d: Record<string, SinvalInfo[]>) => { if (mountedRef.current) setSinyalMap(d); })
          .catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bilinmeyen hata');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── Sıralanmış liste ──────────────────────────────────────────────────────

  const sortedItems = [...items].sort((a, b) => {
    if (sortBy === 'date') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortBy === 'alpha') return a.sembol.localeCompare(b.sembol);
    if (sortBy === 'change') {
      const da = fiyatlar[a.sembol]?.degisim ?? -Infinity;
      const db = fiyatlar[b.sembol]?.degisim ?? -Infinity;
      return db - da;
    }
    if (sortBy === 'signal') {
      const sa = (sinyalMap[a.sembol] ?? []).length;
      const sb = (sinyalMap[b.sembol] ?? []).length;
      return sb - sa;
    }
    return 0;
  });

  // ── Toplu seçim ───────────────────────────────────────────────────────────

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  }

  // ── Toplu sil ────────────────────────────────────────────────────────────

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`${selected.size} hisseyi listeden kaldırmak istiyor musun?`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    await Promise.allSettled(
      ids.map((id) => fetch(`/api/watchlist?id=${id}`, { method: 'DELETE' }))
    );
    setItems((prev) => prev.filter((i) => !selected.has(i.id)));
    setSelected(new Set());
    setBulkDeleting(false);
  }

  // ── Tekil sil ─────────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm('Listeden kaldırmak istiyor musun?')) return;
    try {
      const res = await fetch(`/api/watchlist?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Silinemedi.');
      setItems((prev) => prev.filter((i) => i.id !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silme hatası');
    }
  }

  // ── Ekle ──────────────────────────────────────────────────────────────────

  async function handleSave(sembol: string, notlar: string) {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sembol, notlar: notlar || null }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? 'Eklenemedi');
    }
    setShowModal(false);
    await loadItems(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-5xl">

        {/* Başlık */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">İzleme Listem</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Takip ettiğin hisselerde sinyal çıkınca e-posta ile bildir
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadItems(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:border-text-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Güncelle
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Hisse Ekle
            </button>
          </div>
        </div>

        {/* Hata */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {!loading && (
          <>
            {items.length === 0 ? (
              <EmptyWatchlist onAdd={() => setShowModal(true)} />
            ) : (
              <>
                {/* Araç çubuğu */}
                <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <input
                      type="checkbox"
                      checked={selected.size === items.length && items.length > 0}
                      onChange={selectAll}
                      className="h-3.5 w-3.5 cursor-pointer accent-primary"
                    />
                    <span>{items.length} hisse takip ediliyor</span>
                  </div>

                  {/* Sıralama */}
                  <div className="relative flex items-center gap-1">
                    <span className="text-xs text-text-muted">Sırala:</span>
                    <div className="relative">
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortBy)}
                        className="appearance-none rounded-lg border border-border bg-surface pl-3 pr-7 py-1.5 text-xs text-text-secondary focus:outline-none focus:border-primary/50 cursor-pointer"
                      >
                        <option value="date">Eklenme Tarihi</option>
                        <option value="change">Fiyat Değişimi ↓</option>
                        <option value="signal">Sinyal Önce</option>
                        <option value="alpha">Alfabetik</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-muted" />
                    </div>
                  </div>
                </div>

                {/* Tablo */}
                <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-xs text-text-muted">
                        <th className="py-3 pl-3 pr-1 w-8"></th>
                        <th className="py-3 pl-2 pr-3 text-left font-medium">Hisse</th>
                        <th className="py-3 px-3 text-right font-medium">Fiyat</th>
                        <th className="hidden sm:table-cell py-3 px-3 text-right font-medium">Hedef</th>
                        <th className="hidden sm:table-cell py-3 px-3 text-left font-medium">Aktif Sinyaller</th>
                        <th className="py-3 pl-3 pr-4 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {sortedItems.map((item) => (
                          <WatchRow
                            key={item.id}
                            item={item}
                            fiyat={fiyatlar[item.sembol] ?? null}
                            sinyaller={sinyalMap[item.sembol] ?? []}
                            onDelete={handleDelete}
                            isSelected={selected.has(item.id)}
                            onToggleSelect={toggleSelect}
                            target={targets[item.sembol] ?? ''}
                            onTargetChange={handleTargetChange}
                          />
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>

                {/* Toplu silme */}
                <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-text-muted">
                    Fiyatlar Yahoo Finance'tan çekilir · 15 dk gecikmeli olabilir
                  </p>
                  <AnimatePresence>
                    {selected.size > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        className="flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2"
                      >
                        <span className="text-xs font-medium text-red-300">
                          {selected.size} hisse seçildi
                        </span>
                        <button
                          onClick={handleBulkDelete}
                          disabled={bulkDeleting}
                          className="flex items-center gap-1 rounded-md bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          {bulkDeleting ? 'Kaldırılıyor…' : 'Seçilenleri Kaldır'}
                        </button>
                        <button
                          onClick={() => setSelected(new Set())}
                          className="text-text-muted hover:text-text-primary"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <AddModal onClose={() => setShowModal(false)} onSave={handleSave} />
        )}
      </AnimatePresence>
    </div>
  );
}
