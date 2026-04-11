'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, RefreshCw, Star,
  AlertTriangle, ChevronRight, Activity, Zap, Users, Clock,
} from 'lucide-react';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import type { FirsatItem, FirsatlarResponse } from '@/app/api/firsatlar/route';

// ── Sinyal güç seviyeleri ────────────────────────────────────────────

const SINYAL_GUC: Record<string, 'guclu' | 'orta' | 'destekleyici'> = {
  'Altın Çapraz':            'guclu',
  'Trend Başlangıcı':        'guclu',
  'Destek/Direnç Kırılımı':  'guclu',
  'RSI Uyumsuzluğu':         'orta',
  'MACD Kesişimi':           'orta',
  'RSI Seviyesi':            'orta',
  'Hacim Anomalisi':         'destekleyici',
  'Bollinger Sıkışması':     'destekleyici',
};

const SINYAL_KISALT: Record<string, string> = {
  'RSI Uyumsuzluğu':        'RSI Div.',
  'Hacim Anomalisi':         'Hacim',
  'Trend Başlangıcı':        'Trend',
  'Destek/Direnç Kırılımı': 'D/D Kır.',
  'MACD Kesişimi':           'MACD',
  'RSI Seviyesi':            'RSI',
  'Altın Çapraz':            'Altın Çpz.',
  'Bollinger Sıkışması':     'BB Sık.',
};

function sinyalEtiket(sinyal: string) {
  const guc = SINYAL_GUC[sinyal] ?? 'destekleyici';
  const kisalt = SINYAL_KISALT[sinyal] ?? sinyal;
  const stil = {
    guclu:        'bg-green-500/15 border-green-500/30 text-green-400',
    orta:         'bg-yellow-500/15 border-yellow-500/30 text-yellow-400',
    destekleyici: 'bg-blue-500/15 border-blue-500/30 text-blue-400',
  }[guc];
  return (
    <span key={sinyal} title={sinyal} className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${stil}`}>
      {kisalt}
    </span>
  );
}

// ── Yardımcılar ──────────────────────────────────────────────────────

function sinyalYasi(entryTime: string): string {
  const diff = Date.now() - new Date(entryTime).getTime();
  const saat = Math.floor(diff / (1000 * 60 * 60));
  if (saat < 24) return 'Bugün';
  if (saat < 48) return 'Dün';
  return `${Math.floor(saat / 24)}g önce`;
}

function confluenceColor(score: number) {
  if (score >= 70) return 'text-green-400';
  if (score >= 55) return 'text-yellow-400';
  return 'text-orange-400';
}

function confluenceBg(score: number) {
  if (score >= 70) return 'bg-green-500/15 border-green-500/30';
  if (score >= 55) return 'bg-yellow-500/15 border-yellow-500/30';
  return 'bg-orange-500/15 border-orange-500/30';
}

function confluenceLabel(score: number) {
  if (score >= 70) return 'Güçlü';
  if (score >= 55) return 'Orta';
  return 'Zayıf';
}

// ── Sektör badge ─────────────────────────────────────────────────────

function SektorBadge({ sektorAdi, sektorSinyalSayisi }: { sektorAdi: string; sektorSinyalSayisi: number }) {
  if (sektorSinyalSayisi >= 3) return (
    <span className="flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-400 border border-purple-500/25">
      <Users className="h-2.5 w-2.5" /> {sektorAdi}: {sektorSinyalSayisi} hisse
    </span>
  );
  if (sektorSinyalSayisi === 2) return (
    <span className="flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-400 border border-indigo-500/25">
      <Users className="h-2.5 w-2.5" /> {sektorAdi}: 2 hisse
    </span>
  );
  return (
    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-text-muted border border-border">
      {sektorAdi}
    </span>
  );
}

// ── Makro Bar ────────────────────────────────────────────────────────

function MakroBar({ score, regime }: { score: number | null; regime: string | null }) {
  const scoreColor = score === null ? 'text-text-muted'
    : score >= 30 ? 'text-green-400'
    : score >= -30 ? 'text-yellow-400'
    : 'text-red-400';

  const regimeMap: Record<string, { label: string; cls: string }> = {
    bull_trend: { label: 'Boğa Piyasası', cls: 'text-green-400 bg-green-500/10 border-green-500/25' },
    bear_trend: { label: 'Ayı Piyasası',  cls: 'text-red-400 bg-red-500/10 border-red-500/25' },
    sideways:   { label: 'Yatay Piyasa',  cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/25' },
  };
  const r = regime ? (regimeMap[regime] ?? { label: regime, cls: 'text-text-muted bg-white/5 border-border' }) : null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface/50 px-4 py-3">
      <Activity className="h-4 w-4 shrink-0 text-text-muted" />
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-text-muted">Makro:</span>
        <span className={`text-sm font-bold ${scoreColor}`}>
          {score !== null ? `${score > 0 ? '+' : ''}${score}` : '—'}
        </span>
      </div>
      {r && (
        <>
          <span className="text-text-muted">·</span>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${r.cls}`}>{r.label}</span>
        </>
      )}
      <div className="ml-auto hidden sm:flex items-center gap-x-4 flex-wrap text-[10px] text-text-muted">
        <span className="opacity-50">Sinyal:</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-400" /> Güçlü</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-yellow-400" /> Orta</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-400" /> Destekleyici</span>
        <span className="w-px h-3 bg-border mx-1" />
        <span className="opacity-50">Sektör:</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-purple-400" /> 3+ hisse</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-indigo-400" /> 2 hisse</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-zinc-500" /> Tek hisse</span>
      </div>
    </div>
  );
}

// ── Özet Satırı ──────────────────────────────────────────────────────

function OzetSatiri({ firsatlar }: { firsatlar: FirsatItem[] }) {
  const toplamAl  = firsatlar.filter((f) => f.direction === 'yukari').length;
  const toplamSat = firsatlar.filter((f) => f.direction === 'asagi').length;

  // En çok sinyal veren sektör
  const sektorSayac = new Map<string, number>();
  for (const f of firsatlar) {
    sektorSayac.set(f.sektorAdi, (sektorSayac.get(f.sektorAdi) ?? 0) + 1);
  }
  const oneSektör = [...sektorSayac.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
      <span>
        <span className="font-semibold text-text-primary">{firsatlar.length}</span> fırsat
      </span>
      {toplamAl > 0 && (
        <span className="text-green-400">· ↑ {toplamAl} AL</span>
      )}
      {toplamSat > 0 && (
        <span className="text-red-400">· ↓ {toplamSat} SAT</span>
      )}
      {oneSektör && oneSektör[1] >= 2 && (
        <span className="text-text-muted">
          · <span className="text-purple-400 font-medium">{oneSektör[0]}</span> öne çıkıyor ({oneSektör[1]} hisse)
        </span>
      )}
    </div>
  );
}

// ── Watchlist Butonu (mini) ───────────────────────────────────────────

function MiniWatchlistBtn({ sembol, inList, onToggle }: {
  sembol: string;
  inList: boolean;
  onToggle: (sembol: string, currentState: boolean) => void;
}) {
  return (
    <button
      onClick={(e) => { e.preventDefault(); onToggle(sembol, inList); }}
      title={inList ? 'İzleme listesinden çıkar' : 'İzleme listesine ekle'}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors ${
        inList
          ? 'border-primary/40 bg-primary/10 text-primary'
          : 'border-border bg-surface text-text-muted hover:border-primary/40 hover:text-primary'
      }`}
    >
      <Star className={`h-3.5 w-3.5 ${inList ? 'fill-primary' : ''}`} />
    </button>
  );
}

// ── Fırsat Kartı ──────────────────────────────────────────────────────

function FirsatKarti({
  firsat, index, inWatchlist, onWatchlistToggle,
}: {
  firsat: FirsatItem;
  index: number;
  inWatchlist: boolean;
  onWatchlistToggle: (sembol: string, currentState: boolean) => void;
}) {
  const isAl  = firsat.direction === 'yukari';
  const isSat = firsat.direction === 'asagi';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.25 }}
    >
      <Link
        href={`/hisse/${firsat.sembol}`}
        className="block rounded-xl border border-border bg-surface p-4 transition-all hover:border-primary/40 hover:bg-white/5 hover:shadow-lg hover:shadow-primary/5"
      >
        {/* Üst: sembol + yön + confluence */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg font-bold text-text-primary">{firsat.sembol}</span>
              {isAl && (
                <span className="flex items-center gap-0.5 rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-bold text-green-400 border border-green-500/25">
                  <TrendingUp className="h-3 w-3" /> AL
                </span>
              )}
              {isSat && (
                <span className="flex items-center gap-0.5 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-400 border border-red-500/25">
                  <TrendingDown className="h-3 w-3" /> SAT
                </span>
              )}
              {/* Sinyal yaşı */}
              <span className="flex items-center gap-0.5 text-[10px] text-text-muted">
                <Clock className="h-2.5 w-2.5" />
                {sinyalYasi(firsat.entryTime)}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 shrink-0">
            {/* Watchlist butonu */}
            <MiniWatchlistBtn
              sembol={firsat.sembol}
              inList={inWatchlist}
              onToggle={onWatchlistToggle}
            />
            {/* Confluence skoru */}
            <div className={`flex flex-col items-center rounded-xl border px-3 py-1.5 ${confluenceBg(firsat.confluenceScore)}`}>
              <span className={`text-xl font-bold leading-none ${confluenceColor(firsat.confluenceScore)}`}>
                {firsat.confluenceScore}
              </span>
              <span className={`text-[9px] font-semibold uppercase tracking-wide ${confluenceColor(firsat.confluenceScore)}`}>
                {confluenceLabel(firsat.confluenceScore)}
              </span>
            </div>
          </div>
        </div>

        {/* Sinyal etiketleri */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {firsat.sinyaller.map((s) => sinyalEtiket(s))}
        </div>

        {/* Alt: sektör + fiyat + ok */}
        <div className="flex items-center justify-between gap-2">
          <SektorBadge sektorAdi={firsat.sektorAdi} sektorSinyalSayisi={firsat.sektorSinyalSayisi} />
          <div className="flex items-center gap-1.5 text-xs text-text-muted">
            <span className="font-semibold text-text-secondary">{firsat.entryPrice.toFixed(2)} ₺</span>
            <ChevronRight className="h-3.5 w-3.5 text-primary" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ── Boş ekran ────────────────────────────────────────────────────────

function BosEkran() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Zap className="mx-auto mb-4 h-12 w-12 text-text-muted opacity-30" />
      <h2 className="mb-2 text-xl font-bold text-text-primary">Henüz Fırsat Yok</h2>
      <p className="max-w-sm text-sm text-text-secondary leading-relaxed">
        Sistem her iş günü sabah sinyalleri tarar. Yüksek kaliteli sinyaller burada otomatik görünür.
      </p>
    </div>
  );
}

// ── Ana Sayfa ────────────────────────────────────────────────────────

export default function FirsatlarPage() {
  const [data,      setData]      = useState<FirsatlarResponse | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [watchlist,    setWatchlist]    = useState<Set<string>>(new Set());
  const [watchlistIds, setWatchlistIds] = useState<Map<string, string>>(new Map()); // sembol → id

  // Filtreler
  const [dirFilter,    setDirFilter]    = useState<'tumu' | 'yukari' | 'asagi'>('tumu');
  const [minScore,     setMinScore]     = useState<number>(0);
  const [sektorFilter, setSektorFilter] = useState<string>('tumu');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/firsatlar');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: FirsatlarResponse = await res.json();
      setData(json);
      setLastFetch(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri alınamadı');
    } finally {
      setLoading(false);
    }
  }, []);

  // Watchlist'i çek
  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlist');
      if (!res.ok) return;
      const json = await res.json() as { id: string; sembol?: string }[];
      setWatchlist(new Set(json.map((r) => r.sembol ?? '')));
      setWatchlistIds(new Map(json.map((r) => [r.sembol ?? '', r.id])));
    } catch { /* kullanıcı giriş yapmamış olabilir */ }
  }, []);

  useEffect(() => {
    void fetchData();
    void fetchWatchlist();
  }, [fetchData, fetchWatchlist]);

  // Watchlist toggle
  const handleWatchlistToggle = useCallback(async (sembol: string, currentState: boolean) => {
    // Optimistik güncelle
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (currentState) next.delete(sembol); else next.add(sembol);
      return next;
    });
    try {
      if (currentState) {
        const id = watchlistIds.get(sembol);
        if (id) await fetch(`/api/watchlist?id=${id}`, { method: 'DELETE' });
        toast.success(`${sembol} izleme listesinden çıkarıldı`);
        setWatchlistIds((prev) => { const n = new Map(prev); n.delete(sembol); return n; });
      } else {
        const res = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sembol }),
        });
        const json = await res.json() as { id?: string };
        if (json.id) setWatchlistIds((prev) => new Map(prev).set(sembol, json.id!));
        toast.success(`${sembol} izleme listesine eklendi`);
      }
    } catch {
      // Geri al
      setWatchlist((prev) => {
        const next = new Set(prev);
        if (currentState) next.add(sembol); else next.delete(sembol);
        return next;
      });
      toast.error('İşlem başarısız');
    }
  }, []);

  // Benzersiz sektörler
  const sektorler = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of data?.firsatlar ?? []) {
      map.set(f.sektorAdi, (map.get(f.sektorAdi) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  // Filtrele
  const filtered = useMemo(() => (data?.firsatlar ?? []).filter((f) => {
    if (dirFilter !== 'tumu' && f.direction !== dirFilter) return false;
    if (minScore > 0 && f.confluenceScore < minScore) return false;
    if (sektorFilter !== 'tumu' && f.sektorAdi !== sektorFilter) return false;
    return true;
  }), [data, dirFilter, minScore, sektorFilter]);

  const alSayisi  = (data?.firsatlar ?? []).filter((f) => f.direction === 'yukari').length;
  const satSayisi = (data?.firsatlar ?? []).filter((f) => f.direction === 'asagi').length;

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">

      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Zap className="h-8 w-8 text-yellow-400" />
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Fırsatlar</h1>
            <p className="text-sm text-text-secondary">Yüksek kaliteli, güncel sinyaller</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && (
            <span className="text-xs text-text-muted">
              {lastFetch.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:bg-white/10 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>
      </div>

      {/* Makro bar */}
      {data && <MakroBar score={data.makroScore} regime={data.regime} />}

      {/* Filtreler */}
      {!loading && !error && data && (
        <div className="mb-4 flex flex-col gap-3">
          {/* Satır 1: yön + kalite */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Yön */}
            <div className="flex overflow-hidden rounded-lg border border-border">
              {([
                { val: 'tumu',   label: `Tümü (${data.firsatlar.length})` },
                { val: 'yukari', label: `↑ AL (${alSayisi})`              },
                { val: 'asagi',  label: `↓ SAT (${satSayisi})`            },
              ] as const).map((opt) => (
                <button key={opt.val} onClick={() => setDirFilter(opt.val)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    dirFilter === opt.val ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >{opt.label}</button>
              ))}
            </div>

            {/* Min kalite */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Min Kalite:</span>
              <div className="flex overflow-hidden rounded-lg border border-border">
                {([
                  { val: 0,  label: 'Tümü' },
                  { val: 55, label: '>55'  },
                  { val: 70, label: '>70'  },
                ] as const).map((opt) => (
                  <button key={opt.val} onClick={() => setMinScore(opt.val)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      minScore === opt.val ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Satır 2: Sektör filtresi */}
          {sektorler.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-text-muted">Sektör:</span>
              <button
                onClick={() => setSektorFilter('tumu')}
                className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${
                  sektorFilter === 'tumu'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-text-muted hover:text-text-primary'
                }`}
              >
                Tümü
              </button>
              {sektorler.map(([ad, sayi]) => (
                <button
                  key={ad}
                  onClick={() => setSektorFilter(ad)}
                  className={`rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${
                    sektorFilter === ad
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  {ad} ({sayi})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Özet satırı */}
      {!loading && !error && data && data.firsatlar.length > 0 && (
        <OzetSatiri firsatlar={filtered} />
      )}

      {/* Loading */}
      {loading && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-400" />
          <p className="mb-4 text-red-300">{error}</p>
          <button onClick={() => void fetchData()} className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/80">
            Tekrar Dene
          </button>
        </div>
      )}

      {/* İçerik */}
      {!loading && !error && (
        <>
          {filtered.length === 0 ? <BosEkran /> : (
            <div className="grid gap-3 sm:grid-cols-2">
              <AnimatePresence mode="popLayout">
                {filtered.map((f, i) => (
                  <FirsatKarti
                    key={f.sembol}
                    firsat={f}
                    index={i}
                    inWatchlist={watchlist.has(f.sembol)}
                    onWatchlistToggle={handleWatchlistToggle}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
          {filtered.length > 0 && (
            <p className="mt-6 text-center text-xs text-text-muted">
              Son 3 günlük tarama · Confluence ≥ 45 · Yatırım tavsiyesi değildir
            </p>
          )}
        </>
      )}
    </div>
  );
}
