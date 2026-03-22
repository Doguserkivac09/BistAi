'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  TrendingUp, TrendingDown, Plus, Trash2, RefreshCw,
  Briefcase, AlertCircle, X, ChevronUp, ChevronDown, Bell, BellOff, BarChart2,
} from 'lucide-react';
import { BIST_SYMBOLS } from '@/types';
import type { PortfolyoPozisyonWithStats } from '@/types';
import PortfolioPerformanceChart from '@/components/PortfolioPerformanceChart';

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

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtTL(n: number) {
  return '₺' + fmt(n);
}

function fmtPct(n: number) {
  return (n >= 0 ? '+' : '') + fmt(n) + '%';
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

  // En güçlü sinyali göster
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
  poz,
  sinyaller,
  onDelete,
}: {
  poz: PortfolyoPozisyonWithStats;
  sinyaller: SinvalInfo[];
  onDelete: (id: string) => void;
}) {
  const profit = (poz.kar_zarar ?? 0) >= 0;
  const hasPrice = poz.guncel_fiyat !== null;

  return (
    <motion.tr
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="border-b border-border/40 hover:bg-surface-hover/30 transition-colors"
    >
      {/* Sembol */}
      <td className="py-3.5 pl-4 pr-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
            {poz.sembol.slice(0, 2)}
          </div>
          <div>
            <div className="font-semibold text-text-primary text-sm">{poz.sembol}</div>
            <SinyalBadge sinyaller={sinyaller} />
          </div>
        </div>
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

      {/* Sil */}
      <td className="py-3.5 pl-3 pr-4 text-right">
        <button
          onClick={() => onDelete(poz.id)}
          className="rounded p-1 text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
          title="Pozisyonu sil"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </motion.tr>
  );
}

// ─── Ekle modal ───────────────────────────────────────────────────────────────

function AddModal({
  onClose,
  onSave,
  saving,
}: {
  onClose: () => void;
  onSave: (form: FormData) => Promise<void>;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormData>({
    sembol: '',
    miktar: '',
    alis_fiyati: '',
    alis_tarihi: new Date().toISOString().slice(0, 10),
    notlar: '',
  });
  const [query, setQuery] = useState('');
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
        {/* Başlık */}
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
              value={form.sembol}
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

          {/* Miktar + Fiyat */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Lot / Adet</label>
              <input
                type="number"
                min="0.01"
                step="1"
                value={form.miktar}
                onChange={(e) => set('miktar', e.target.value)}
                placeholder="100"
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Alış Fiyatı (₺)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.alis_fiyati}
                onChange={(e) => set('alis_fiyati', e.target.value)}
                placeholder="45.20"
                className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Tarih */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Alış Tarihi</label>
            <input
              type="date"
              value={form.alis_tarihi}
              onChange={(e) => set('alis_tarihi', e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-primary focus:outline-none"
            />
          </div>

          {/* Not */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Not (opsiyonel)</label>
            <input
              type="text"
              value={form.notlar}
              onChange={(e) => set('notlar', e.target.value)}
              placeholder="Örn: Temettü için aldım"
              className="w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Maliyet önizleme */}
        {form.miktar && form.alis_fiyati && (
          <div className="mt-4 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-text-secondary">
            Toplam maliyet:{' '}
            <span className="font-semibold text-text-primary">
              {fmtTL(Number(form.miktar) * Number(form.alis_fiyati))}
            </span>
          </div>
        )}

        {/* Butonlar */}
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

// ─── Ana sayfa ────────────────────────────────────────────────────────────────

export default function PortfolyoPage() {
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

      // Benzersiz semboller için fiyat + tarihsel veri çek
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

      // Sinyalleri çek — arka planda, UI'ı bloklamadan
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
          ...p,
          user_id: '',
          notlar: p.notlar ?? null,
          guncel_fiyat: guncel,
          maliyet,
          guncel_deger,
          kar_zarar,
          kar_zarar_yuzde,
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

  // ── Bildirim tercihleri yükle ──────────────────────────────────────────────
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
    } catch {} finally {
      setPrefSaving(false);
    }
  }

  // ── Pozisyon ekle ─────────────────────────────────────────────────────────

  async function handleSave(form: FormData) {
    setSaving(true);
    try {
      const res = await fetch('/api/portfolyo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sembol:      form.sembol,
          miktar:      Number(form.miktar),
          alis_fiyati: Number(form.alis_fiyati),
          alis_tarihi: form.alis_tarihi,
          notlar:      form.notlar || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Kayıt başarısız.');
      }
      setShowModal(false);
      await loadPozisyonlar(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt hatası');
    } finally {
      setSaving(false);
    }
  }

  // ── Pozisyon sil ──────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    if (!confirm('Bu pozisyonu silmek istiyor musun?')) return;
    try {
      const res = await fetch(`/api/portfolyo?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Silinemedi.');
      setPozisyonlar((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silme hatası');
    }
  }

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
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Portföyüm</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Hisse pozisyonlarını takip et, kar/zarar hesapla
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Bildirim toggle */}
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2">
              <button
                onClick={() => {
                  const next = !emailEnabled;
                  setEmailEnabled(next);
                  savePref(next, minSeverity);
                }}
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
              onClick={() => setShowModal(true)}
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

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}

        {/* İçerik */}
        {!loading && (
          <>
            {pozisyonlar.length === 0 ? (
              <EmptyPortfolio onAdd={() => setShowModal(true)} />
            ) : (
              <>
                {/* Özet kartlar */}
                <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {[
                    { label: 'Toplam Maliyet',    value: fmtTL(totalMaliyet),    icon: Briefcase,    color: 'text-text-primary' },
                    { label: 'Güncel Değer',       value: fmtTL(totalDeger),      icon: TrendingUp,   color: 'text-text-primary' },
                    {
                      label: 'Toplam K/Z',
                      value: fmtTL(Math.abs(totalKarZarar)),
                      icon: profit ? TrendingUp : TrendingDown,
                      color: profit ? 'text-emerald-400' : 'text-red-400',
                    },
                    {
                      label: 'Getiri',
                      value: fmtPct(totalKarZararPct),
                      icon: profit ? ChevronUp : ChevronDown,
                      color: profit ? 'text-emerald-400' : 'text-red-400',
                    },
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

                {/* Performans grafiği */}
                <PortfolioPerformanceChart pozisyonlar={pozisyonlar} ohlcvMap={ohlcvMap} />

                {/* Tablo */}
                <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-xs text-text-muted">
                        <th className="py-3 pl-4 pr-3 text-left font-medium">Hisse</th>
                        <th className="hidden sm:table-cell py-3 px-3 text-right font-medium">Lot</th>
                        <th className="hidden sm:table-cell py-3 px-3 text-right font-medium">Alış</th>
                        <th className="py-3 px-3 text-right font-medium">Güncel</th>
                        <th className="py-3 px-3 text-right font-medium">Maliyet</th>
                        <th className="py-3 px-3 text-right font-medium">Değer</th>
                        <th className="py-3 px-3 text-right font-medium">K/Z</th>
                        <th className="py-3 pl-3 pr-4 text-right font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence>
                        {pozisyonlar.map((poz) => (
                          <PozisyonRow key={poz.id} poz={poz} sinyaller={sinyalMap[poz.sembol] ?? []} onDelete={handleDelete} />
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

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <AddModal
            onClose={() => setShowModal(false)}
            onSave={handleSave}
            saving={saving}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
