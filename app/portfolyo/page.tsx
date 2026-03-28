'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  TrendingUp, TrendingDown, Plus, Trash2, RefreshCw,
  Briefcase, AlertCircle, X, ChevronUp, ChevronDown, Bell, BellOff, BarChart2,
  Pencil, ChevronsUpDown,
} from 'lucide-react';
import { BIST_SYMBOLS } from '@/types';
import type { PortfolyoPozisyonWithStats } from '@/types';
import dynamic from 'next/dynamic';

const PortfolioPerformanceChart = dynamic(
  () => import('@/components/PortfolioPerformanceChart'),
  { ssr: false, loading: () => <div className="h-[300px] w-full animate-pulse rounded-xl bg-white/5" /> },
);

interface OhlcvCandle { date: string; close: number; }

// ─── Tipler ───────────────────────────────────────────────────────────────────

interface RawPozisyon {
  id: string;
  sembol: string;
  miktar: number;
  alis_fiyati: number;
  alis_tarihi: string;
  notlar?: string | null;
  created_at: string;
}

interface FormData {
  sembol: string;
  miktar: string;
  alis_fiyati: string;
  alis_tarihi: string;
  notlar: string;
}

type SortField = 'sembol' | 'kar_zarar' | 'kar_zarar_yuzde';

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtTL(n: number) { return '₺' + fmt(n); }
function fmtPct(n: number) { return (n >= 0 ? '+' : '') + fmt(n) + '%'; }

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
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 opacity-75">
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

// ─── Portföy Pasta Grafiği ────────────────────────────────────────────────────

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

function PortfolioPieChart({ pozisyonlar, totalDeger }: { pozisyonlar: PortfolyoPozisyonWithStats[]; totalDeger: number }) {
  if (pozisyonlar.length === 0 || totalDeger === 0) return null;

  const withValue = pozisyonlar
    .filter((p) => (p.guncel_deger ?? 0) > 0)
    .sort((a, b) => (b.guncel_deger ?? 0) - (a.guncel_deger ?? 0));

  const top6 = withValue.slice(0, 6);
  const rest = withValue.slice(6);

  const data: { label: string; value: number }[] = top6.map((p) => ({
    label: p.sembol,
    value: p.guncel_deger ?? 0,
  }));
  if (rest.length > 0) {
    data.push({ label: 'Diğer', value: rest.reduce((s, p) => s + (p.guncel_deger ?? 0), 0) });
  }

  const CX = 70, CY = 70, R = 55, IR = 34;
  let cumAngle = -Math.PI / 2;

  function polar(angle: number, radius: number) {
    return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
  }

  const slices = data.map((item, idx) => {
    const pct = item.value / totalDeger;
    const sweep = pct * 2 * Math.PI;
    const startAngle = cumAngle;
    cumAngle += sweep;
    const endAngle = cumAngle;

    const s1 = polar(startAngle, R);
    const e1 = polar(endAngle, R);
    const s2 = polar(endAngle, IR);
    const e2 = polar(startAngle, IR);
    const large = sweep > Math.PI ? 1 : 0;

    const d = `M ${s1.x.toFixed(2)} ${s1.y.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${e1.x.toFixed(2)} ${e1.y.toFixed(2)} L ${s2.x.toFixed(2)} ${s2.y.toFixed(2)} A ${IR} ${IR} 0 ${large} 0 ${e2.x.toFixed(2)} ${e2.y.toFixed(2)} Z`;
    const color = PIE_COLORS[idx % PIE_COLORS.length]!;
    return { d, color, label: item.label, pct };
  });

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Portföy Dağılımı</p>
      <div className="flex items-center gap-5">
        <svg width="140" height="140" viewBox="0 0 140 140" className="shrink-0">
          {slices.map((s, i) => (
            <path key={i} d={s.d} fill={s.color} fillOpacity={0.85} stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
          ))}
        </svg>
        <div className="min-w-0 space-y-1.5">
          {slices.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} />
              <span className="truncate text-text-secondary">{s.label}</span>
              <span className="ml-auto shrink-0 font-semibold text-text-primary">
                {(s.pct * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Boş durum ────────────────────────────────────────────────────────────────

function EmptyPortfolio({ onAdd }: { onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
        <Briefcase className="h-10 w-10 text-primary/60" />
      </div>
      <h2 className="mb-2 text-xl font-semibold text-text-primary">Portföyün boş</h2>
      <p className="mb-8 max-w-sm text-sm text-text-secondary">
        İlk hisse pozisyonunu ekleyerek kar/zarar takibine başla.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Pozisyon Ekle
      </button>
    </motion.div>
  );
}

// ─── Sinyal badge ────────────────────────────────────────────────────────────

interface SinvalInfo { type: string; direction: string; severity: string }

function SinyalBadge({ sinyaller }: { sinyaller: SinvalInfo[] }) {
  if (sinyaller.length === 0) return null;
  const order = ['güçlü', 'orta', 'zayıf'];
  const best = [...sinyaller].sort(
    (a, b) => order.indexOf(a.severity) - order.indexOf(b.severity)
  )[0]!;
  const isUp = best.direction === 'yukari';
  const color = isUp ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                     : 'bg-red-500/15 text-red-400 border-red-500/30';
  const arrow = isUp ? '↑' : '↓';
  return (
    <div className="mt-0.5 flex items-center gap-1">
      <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
        {arrow} {best.type}
      </span>
      {sinyaller.length > 1 && (
        <span className="text-[10px] text-text-muted">+{sinyaller.length - 1}</span>
      )}
    </div>
  );
}

// ─── Pozisyon satırı ──────────────────────────────────────────────────────────

function PozisyonRow({
  poz, sinyaller, onDelete, onEdit, sparkline, isBest, isWorst,
}: {
  poz: PortfolyoPozisyonWithStats;
  sinyaller: SinvalInfo[];
  onDelete: (id: string) => void;
  onEdit: (poz: PortfolyoPozisyonWithStats) => void;
  sparkline: number[];
  isBest: boolean;
  isWorst: boolean;
}) {
  const profit = (poz.kar_zarar ?? 0) >= 0;
  const hasPrice = poz.guncel_fiyat !== null;

  return (
    <motion.tr
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className={`border-b border-border/40 hover:bg-surface-hover/30 transition-colors ${
        isBest ? 'bg-emerald-500/5 border-l-2 border-l-emerald-500/50' :
        isWorst ? 'bg-red-500/5 border-l-2 border-l-red-500/50' : ''
      }`}
    >
      {/* Sembol + sparkline */}
      <td className="py-3.5 pl-4 pr-3">
        <Link href={`/hisse/${poz.sembol}`} className="flex items-center gap-2 group">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary shrink-0 group-hover:bg-primary/20 transition-colors">
            {poz.sembol.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-text-primary text-sm group-hover:text-primary transition-colors">{poz.sembol}</div>
            <SinyalBadge sinyaller={sinyaller} />
          </div>
          <Sparkline closes={sparkline} />
        </Link>
      </td>

      {/* Miktar */}
      <td className="hidden sm:table-cell py-3.5 px-3 text-right text-xs sm:text-sm text-text-secondary">
        {fmt(poz.miktar, 0)} lot
      </td>

      {/* Alış fiyatı */}
      <td className="hidden sm:table-cell py-3.5 px-3 text-right text-xs sm:text-sm text-text-secondary">
        {fmtTL(poz.alis_fiyati)}
      </td>

      {/* Güncel fiyat */}
      <td className="py-3.5 px-3 text-right text-xs sm:text-sm">
        {hasPrice ? (
          <span className="text-text-primary">{fmtTL(poz.guncel_fiyat!)}</span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>

      {/* Maliyet */}
      <td className="py-3.5 px-3 text-right text-xs sm:text-sm text-text-secondary">
        {fmtTL(poz.maliyet)}
      </td>

      {/* Güncel değer */}
      <td className="py-3.5 px-3 text-right text-xs sm:text-sm">
        {hasPrice ? fmtTL(poz.guncel_deger!) : <span className="text-text-muted">—</span>}
      </td>

      {/* K/Z */}
      <td className="py-3.5 px-3 text-right">
        {hasPrice ? (
          <div className={`flex flex-col items-end text-xs font-medium ${profit ? 'text-emerald-400' : 'text-red-400'}`}>
            <span className="flex items-center gap-0.5">
              {profit ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {fmtTL(Math.abs(poz.kar_zarar!))}
            </span>
            <span>{fmtPct(poz.kar_zarar_yuzde!)}</span>
          </div>
        ) : (
          <span className="text-text-muted text-xs">—</span>
        )}
      </td>

      {/* İşlemler */}
      <td className="py-3.5 pl-3 pr-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onEdit(poz)}
            className="rounded p-1 text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
            title="Düzenle"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(poz.id)}
            className="rounded p-1 text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
            title="Pozisyonu sil"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </motion.tr>
  );
}

// ─── Sıralama başlığı ─────────────────────────────────────────────────────────

function SortTh({
  label, field, sortField, sortDir, onSort, className = '',
}: {
  label: string; field: SortField; sortField: SortField; sortDir: 'asc' | 'desc';
  onSort: (f: SortField) => void; className?: string;
}) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`cursor-pointer select-none py-3 px-3 text-right font-medium text-xs text-text-muted hover:text-text-primary transition-colors ${className}`}
    >
      <span className="inline-flex items-center justify-end gap-1">
        {label}
        {active ? (
          sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}

// ─── Ekle Modal ───────────────────────────────────────────────────────────────

function AddModal({
  onClose, onSave, saving, initialSembol = '',
}: {
  onClose: () => void;
  onSave: (form: FormData) => Promise<void>;
  saving: boolean;
  initialSembol?: string;
}) {
  const [form, setForm] = useState<FormData>({
    sembol: initialSembol,
    miktar: '',
    alis_fiyati: '',
    alis_tarihi: new Date().toISOString().slice(0, 10),
    notlar: '',
  });
  const [query, setQuery] = useState(initialSembol);
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = query.length >= 1
    ? BIST_SYMBOLS.filter((s) => s.startsWith(query.toUpperCase())).slice(0, 8)
    : [];

  function set(field: keyof FormData, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Pozisyon Ekle</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Sembol */}
          <div className="relative">
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Hisse Sembolü</label>
            <input
              type="text"
              value={form.sembol || query}
              onChange={(e) => {
                set('sembol', e.target.value.toUpperCase());
                setQuery(e.target.value);
                setShowDropdown(true);
              }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
              placeholder="THYAO"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none"
            />
            {showDropdown && filtered.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-surface shadow-lg">
                {filtered.map((s) => (
                  <button
                    key={s}
                    className="w-full px-3 py-2 text-left text-sm text-zinc-900 hover:bg-zinc-100"
                    onMouseDown={() => { set('sembol', s); setShowDropdown(false); setQuery(s); }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Lot / Adet</label>
              <input
                type="number" min="0.01" step="1" value={form.miktar}
                onChange={(e) => set('miktar', e.target.value)} placeholder="100"
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Alış Fiyatı (₺)</label>
              <input
                type="number" min="0.01" step="0.01" value={form.alis_fiyati}
                onChange={(e) => set('alis_fiyati', e.target.value)} placeholder="45.20"
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Alış Tarihi</label>
            <input
              type="date" value={form.alis_tarihi} onChange={(e) => set('alis_tarihi', e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-primary focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Not (opsiyonel)</label>
            <input
              type="text" value={form.notlar} onChange={(e) => set('notlar', e.target.value)}
              placeholder="Örn: Temettü için aldım"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {form.miktar && form.alis_fiyati && (
          <div className="mt-4 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-text-secondary">
            Toplam maliyet:{' '}
            <span className="font-semibold text-text-primary">
              {fmtTL(Number(form.miktar) * Number(form.alis_fiyati))}
            </span>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2.5 text-sm text-text-secondary hover:border-text-muted transition-colors"
          >
            İptal
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.sembol || !form.miktar || !form.alis_fiyati || !form.alis_tarihi}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({
  poz, onClose, onSave, saving,
}: {
  poz: PortfolyoPozisyonWithStats;
  onClose: () => void;
  onSave: (id: string, miktar: number, notlar: string | null) => Promise<void>;
  saving: boolean;
}) {
  const [miktar, setMiktar] = useState(String(poz.miktar));
  const [notlar, setNotlar] = useState(poz.notlar ?? '');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Pozisyon Düzenle</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-text-muted hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Kilitli alanlar */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-surface/50 border border-border/50 px-3 py-2.5">
            <p className="text-xs text-text-muted mb-0.5">Sembol</p>
            <p className="text-sm font-semibold text-text-secondary">{poz.sembol}</p>
          </div>
          <div className="rounded-lg bg-surface/50 border border-border/50 px-3 py-2.5">
            <p className="text-xs text-text-muted mb-0.5">Alış Fiyatı</p>
            <p className="text-sm font-semibold text-text-secondary">{fmtTL(poz.alis_fiyati)}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Lot / Adet</label>
            <input
              type="number" min="0.01" step="1" value={miktar}
              onChange={(e) => setMiktar(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Not</label>
            <input
              type="text" value={notlar} onChange={(e) => setNotlar(e.target.value)}
              placeholder="Örn: Temettü için aldım"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2.5 text-sm text-text-secondary hover:border-text-muted transition-colors"
          >
            İptal
          </button>
          <button
            onClick={() => onSave(poz.id, Number(miktar), notlar || null)}
            disabled={saving || !miktar}
            className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Kaydediliyor…' : 'Güncelle'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── BIST100 Alfa Bandı ───────────────────────────────────────────────────────

function AlphaBand({ portfolioReturn, bist100Return }: { portfolioReturn: number; bist100Return: number }) {
  const alpha = portfolioReturn - bist100Return;
  const alphaColor = alpha >= 0 ? 'text-emerald-400' : 'text-red-400';
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface/50 px-4 py-2.5 text-xs text-text-secondary">
      <span>
        Portföyün 90 günde:{' '}
        <span className={portfolioReturn >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-red-400'}>
          {fmtPct(portfolioReturn)}
        </span>
      </span>
      <span className="text-text-muted">·</span>
      <span>
        BIST100:{' '}
        <span className={bist100Return >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-red-400'}>
          {fmtPct(bist100Return)}
        </span>
      </span>
      <span className="text-text-muted">→</span>
      <span>
        <span className={`font-semibold ${alphaColor}`}>{fmtPct(alpha)}</span>{' '}
        <span className="text-text-muted">alfa</span>
      </span>
    </div>
  );
}

// ─── Ana sayfa ────────────────────────────────────────────────────────────────

export default function PortfolyoPage() {
  const searchParams = useSearchParams();

  const [pozisyonlar, setPozisyonlar]   = useState<PortfolyoPozisyonWithStats[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [showModal, setShowModal]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [fiyatlar, setFiyatlar]         = useState<Record<string, number>>({});
  const [ohlcvMap, setOhlcvMap]         = useState<Record<string, OhlcvCandle[]>>({});
  const [sinyalMap, setSinyalMap]       = useState<Record<string, SinvalInfo[]>>({});
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [minSeverity, setMinSeverity]   = useState<'güçlü' | 'orta' | 'zayıf'>('orta');
  const [prefSaving, setPrefSaving]     = useState(false);
  const [sortField, setSortField]       = useState<SortField>('sembol');
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('asc');
  const [editingPoz, setEditingPoz]     = useState<PortfolyoPozisyonWithStats | null>(null);
  const [editSaving, setEditSaving]     = useState(false);
  const [bist100Return, setBist100Return] = useState<number | null>(null);
  const [initialSembol, setInitialSembol] = useState('');

  // URL ?add=SEMBOL parametresini oku
  useEffect(() => {
    const addSembol = searchParams.get('add');
    if (addSembol) {
      setInitialSembol(addSembol.toUpperCase());
      setShowModal(true);
    }
  }, [searchParams]);

  // BIST100 getiri hesapla
  useEffect(() => {
    fetch('/api/ohlcv?symbol=XU100.IS&days=90')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d?.candles?.length || d.candles.length < 2) return;
        const first = d.candles[0].close;
        const last = d.candles[d.candles.length - 1].close;
        if (first && last) setBist100Return(((last - first) / first) * 100);
      })
      .catch(() => {});
  }, []);

  // ── Veri çek ──────────────────────────────────────────────────────────────

  const loadPozisyonlar = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await fetch('/api/portfolyo');
      if (res.status === 401) { setError('Portföyü görmek için giriş yapmalısın.'); return; }
      if (!res.ok) throw new Error('Pozisyonlar yüklenemedi.');
      const data: RawPozisyon[] = await res.json();

      const semboller = Array.from(new Set(data.map((p) => p.sembol)));
      const fiyatMap: Record<string, number> = { ...fiyatlar };
      const newOhlcvMap: Record<string, OhlcvCandle[]> = {};

      await Promise.allSettled(
        semboller.map(async (sembol) => {
          try {
            const r = await fetch(`/api/ohlcv?symbol=${sembol}&days=90`);
            if (!r.ok) return;
            const json: { candles: { date: string; close: number }[] } = await r.json();
            const candles = json.candles ?? [];
            if (candles.length > 0) {
              fiyatMap[sembol] = candles[candles.length - 1]!.close;
              newOhlcvMap[sembol] = candles.map((c) => ({ date: c.date, close: c.close }));
            }
          } catch {}
        })
      );

      setFiyatlar(fiyatMap);
      setOhlcvMap(newOhlcvMap);

      if (semboller.length > 0) {
        fetch(`/api/portfolyo/sinyaller?semboller=${semboller.join(',')}`)
          .then((r) => r.json())
          .then((d: Record<string, SinvalInfo[]>) => setSinyalMap(d))
          .catch(() => {});
      }

      const withStats: PortfolyoPozisyonWithStats[] = data.map((p) => {
        const guncel = fiyatMap[p.sembol] ?? null;
        const maliyet = p.miktar * p.alis_fiyati;
        const guncel_deger = guncel !== null ? p.miktar * guncel : null;
        const kar_zarar = guncel_deger !== null ? guncel_deger - maliyet : null;
        const kar_zarar_yuzde =
          kar_zarar !== null && maliyet > 0 ? (kar_zarar / maliyet) * 100 : null;
        return {
          ...p, user_id: '', notlar: p.notlar ?? null,
          guncel_fiyat: guncel, maliyet, guncel_deger, kar_zarar, kar_zarar_yuzde,
        };
      });

      setPozisyonlar(withStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bilinmeyen hata');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadPozisyonlar(); }, [loadPozisyonlar]);

  // Bildirim tercihleri
  useEffect(() => {
    fetch('/api/user/alert-preferences')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (!d) return;
        setEmailEnabled(d.email_enabled ?? true);
        setMinSeverity(d.min_severity ?? 'orta');
      })
      .catch(() => {});
  }, []);

  async function savePref(enabled: boolean, severity: 'güçlü' | 'orta' | 'zayıf') {
    setPrefSaving(true);
    try {
      await fetch('/api/user/alert-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_enabled: enabled, min_severity: severity }),
      });
    } catch {} finally { setPrefSaving(false); }
  }

  // ── Pozisyon ekle ─────────────────────────────────────────────────────────

  async function handleSave(form: FormData) {
    setSaving(true);
    try {
      const res = await fetch('/api/portfolyo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sembol: form.sembol, miktar: Number(form.miktar),
          alis_fiyati: Number(form.alis_fiyati), alis_tarihi: form.alis_tarihi,
          notlar: form.notlar || null,
        }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error ?? 'Kayıt başarısız.'); }
      setShowModal(false);
      setInitialSembol('');
      await loadPozisyonlar(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt hatası');
    } finally { setSaving(false); }
  }

  // ── Pozisyon düzenle ──────────────────────────────────────────────────────

  async function handleEdit(id: string, miktar: number, notlar: string | null) {
    setEditSaving(true);
    try {
      const res = await fetch('/api/portfolyo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, miktar, notlar }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Güncelleme başarısız.');
      }
      setEditingPoz(null);
      await loadPozisyonlar(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Güncelleme hatası');
      setEditingPoz(null);
    } finally { setEditSaving(false); }
  }

  // ── Pozisyon sil ──────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm('Bu pozisyonu silmek istiyor musun?')) return;
    try {
      const res = await fetch(`/api/portfolyo?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Silinemedi.');
      setPozisyonlar((prev) => prev.filter((p) => p.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : 'Silme hatası'); }
  }

  // ── Sıralama ──────────────────────────────────────────────────────────────

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const sortedPozisyonlar = useMemo(() => {
    return [...pozisyonlar].sort((a, b) => {
      let diff = 0;
      if (sortField === 'sembol') diff = a.sembol.localeCompare(b.sembol);
      else if (sortField === 'kar_zarar') diff = (a.kar_zarar ?? 0) - (b.kar_zarar ?? 0);
      else diff = (a.kar_zarar_yuzde ?? 0) - (b.kar_zarar_yuzde ?? 0);
      return sortDir === 'asc' ? diff : -diff;
    });
  }, [pozisyonlar, sortField, sortDir]);

  // ── En iyi / en kötü ──────────────────────────────────────────────────────

  const withPct = pozisyonlar.filter((p) => p.kar_zarar_yuzde !== null);
  const bestId = withPct.length > 1
    ? withPct.reduce((b, p) => (p.kar_zarar_yuzde! > b.kar_zarar_yuzde! ? p : b)).id
    : null;
  const worstId = withPct.length > 1
    ? withPct.reduce((b, p) => (p.kar_zarar_yuzde! < b.kar_zarar_yuzde! ? p : b)).id
    : null;

  // ── Özet istatistikler ────────────────────────────────────────────────────

  const totalMaliyet    = pozisyonlar.reduce((s, p) => s + p.maliyet, 0);
  const totalDeger      = pozisyonlar.reduce((s, p) => s + (p.guncel_deger ?? p.maliyet), 0);
  const totalKarZarar   = totalDeger - totalMaliyet;
  const totalKarZararPct = totalMaliyet > 0 ? (totalKarZarar / totalMaliyet) * 100 : 0;
  const profit          = totalKarZarar >= 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-6xl">

        {/* Başlık */}
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Portföyüm</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Hisse pozisyonlarını takip et, kar/zarar hesapla
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Bildirim toggle */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2">
              <button
                onClick={() => { const next = !emailEnabled; setEmailEnabled(next); savePref(next, minSeverity); }}
                className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
                title={emailEnabled ? 'Bildirimleri kapat' : 'Bildirimleri aç'}
              >
                {emailEnabled
                  ? <Bell className="h-3.5 w-3.5 text-primary" />
                  : <BellOff className="h-3.5 w-3.5 text-text-muted" />}
                <span className={emailEnabled ? 'text-primary' : 'text-text-muted'}>
                  {prefSaving ? '…' : emailEnabled ? 'Bildirim Açık' : 'Bildirim Kapalı'}
                </span>
              </button>
              {emailEnabled && (
                <select
                  value={minSeverity}
                  onChange={(e) => {
                    const v = e.target.value as 'güçlü' | 'orta' | 'zayıf';
                    setMinSeverity(v);
                    savePref(emailEnabled, v);
                  }}
                  className="border-l border-border pl-2 bg-transparent text-xs text-text-secondary focus:outline-none cursor-pointer"
                >
                  <option value="zayıf">Tümü</option>
                  <option value="orta">Orta+</option>
                  <option value="güçlü">Sadece Güçlü</option>
                </select>
              )}
            </div>

            <button
              onClick={() => loadPozisyonlar(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:border-text-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Güncelle
            </button>
            <button
              onClick={() => { setInitialSembol(''); setShowModal(true); }}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Pozisyon Ekle
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
            {pozisyonlar.length === 0 ? (
              <EmptyPortfolio onAdd={() => setShowModal(true)} />
            ) : (
              <>
                {/* Özet kartlar */}
                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { label: 'Toplam Maliyet',  value: fmtTL(totalMaliyet),  icon: Briefcase,  color: 'text-text-primary' },
                    { label: 'Güncel Değer',     value: fmtTL(totalDeger),    icon: TrendingUp, color: 'text-text-primary' },
                    { label: 'Toplam K/Z',       value: fmtTL(Math.abs(totalKarZarar)), icon: profit ? TrendingUp : TrendingDown, color: profit ? 'text-emerald-400' : 'text-red-400' },
                    { label: 'Getiri',           value: fmtPct(totalKarZararPct), icon: profit ? ChevronUp : ChevronDown, color: profit ? 'text-emerald-400' : 'text-red-400' },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="rounded-xl border border-border bg-surface p-4">
                      <div className="mb-1 flex items-center gap-1.5 text-xs text-text-muted">
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </div>
                      <div className={`text-lg font-bold ${color}`}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Performans grafiği + Pasta grafiği */}
                <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <PortfolioPerformanceChart pozisyonlar={pozisyonlar} ohlcvMap={ohlcvMap} />
                    {bist100Return !== null && (
                      <AlphaBand portfolioReturn={totalKarZararPct} bist100Return={bist100Return} />
                    )}
                  </div>
                  <div>
                    <PortfolioPieChart pozisyonlar={pozisyonlar} totalDeger={totalDeger} />
                  </div>
                </div>

                {/* Tablo */}
                <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-xs text-text-muted">
                        <th
                          onClick={() => handleSort('sembol')}
                          className="cursor-pointer select-none py-3 pl-4 pr-3 text-left font-medium hover:text-text-primary transition-colors"
                        >
                          <span className="inline-flex items-center gap-1">
                            Hisse
                            {sortField === 'sembol' ? (
                              sortDir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                            ) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
                          </span>
                        </th>
                        <th className="hidden sm:table-cell py-3 px-3 text-right font-medium">Lot</th>
                        <th className="hidden sm:table-cell py-3 px-3 text-right font-medium">Alış</th>
                        <th className="py-3 px-3 text-right font-medium">Güncel</th>
                        <th className="py-3 px-3 text-right font-medium">Maliyet</th>
                        <th className="py-3 px-3 text-right font-medium">Değer</th>
                        <SortTh label="K/Z ₺" field="kar_zarar" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <SortTh label="K/Z %" field="kar_zarar_yuzde" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                        <th className="py-3 pl-3 pr-4 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {sortedPozisyonlar.map((poz) => (
                          <PozisyonRow
                            key={poz.id}
                            poz={poz}
                            sinyaller={sinyalMap[poz.sembol] ?? []}
                            onDelete={handleDelete}
                            onEdit={setEditingPoz}
                            sparkline={(ohlcvMap[poz.sembol] ?? []).slice(-30).map((c) => c.close)}
                            isBest={poz.id === bestId}
                            isWorst={poz.id === worstId}
                          />
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs text-text-muted">
                    Fiyatlar Yahoo Finance'tan çekilir · 15 dk gecikmeli olabilir
                  </p>
                  {pozisyonlar.length >= 2 && (
                    <Link
                      href={`/karsilastir?semboller=${pozisyonlar.slice(0, 3).map((p) => p.sembol).join(',')}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-primary/40 hover:text-text-primary transition-colors"
                    >
                      <BarChart2 className="h-3.5 w-3.5" />
                      Hisselerimi Karşılaştır
                    </Link>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showModal && (
          <AddModal
            onClose={() => { setShowModal(false); setInitialSembol(''); }}
            onSave={handleSave}
            saving={saving}
            initialSembol={initialSembol}
          />
        )}
        {editingPoz && (
          <EditModal
            poz={editingPoz}
            onClose={() => setEditingPoz(null)}
            onSave={handleEdit}
            saving={editSaving}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
