'use client';

/**
 * Portföy Dışı Fırsatlar — "Ters Portföy" v3 (2026-04-26)
 *
 * Tema: Kişisel Çeşitlendirme Asistanı (sadece "fırsatlar - portföy" değil)
 *  - Portföy sektör dağılımı görseli
 *  - Eksik sektörler (kullanıcının HİÇ pozisyonu olmayan güçlü sektörler)
 *  - Konsantrasyon riski uyarısı (≥%50 tek sektör)
 *  - AI fırsat analizi (Pro/Premium)
 *  - Sektör bazlı fırsat listesi
 *
 * Tek SoT: /api/firsatlar?excludeOwned=true (skor parite /firsatlar ile)
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  TrendingUp, Compass, RefreshCw, Sparkles, Bot, AlertTriangle,
  Layers, Target, Award, Crown, Lock, PieChart, ArrowRight, Shield,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { FirsatKarti } from '@/components/FirsatKarti';
import { getSectorId, getSector } from '@/lib/sectors';
import type { FirsatItem, FirsatlarResponse } from '@/app/api/firsatlar/route';

// ── /api/sectors response ─────────────────────────────────────────────

interface SectorApiItem {
  id?: string;
  sectorId?: string;
  name?: string;
  sectorName?: string;
  shortName?: string;
  compositeScore?: number;
  signal?: string;
  perf20d?: number;
  momentum20d?: number;
}

// Tailwind-safe sektör renk paleti (id → renk)
const SECTOR_COLORS = [
  'bg-blue-500',  'bg-emerald-500', 'bg-purple-500', 'bg-amber-500',
  'bg-pink-500',  'bg-cyan-500',    'bg-indigo-500', 'bg-orange-500',
  'bg-teal-500',  'bg-rose-500',    'bg-violet-500', 'bg-lime-500',
];
function colorFor(idx: number) { return SECTOR_COLORS[idx % SECTOR_COLORS.length]; }

type Tier = 'free' | 'pro' | 'premium';

// ── Yardımcılar ─────────────────────────────────────────────────────────────

// ── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function TersPortfolyoPage() {
  const [data,         setData]         = useState<FirsatlarResponse | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [loggedIn,     setLoggedIn]     = useState<boolean | null>(null);
  const [tier,         setTier]         = useState<Tier>('free');
  const [watchlist,    setWatchlist]    = useState<Set<string>>(new Set());
  const [watchlistIds, setWatchlistIds] = useState<Map<string, string>>(new Map());
  const [portfoyo,     setPortfoyo]     = useState<string[]>([]); // user portföy semboller
  const [sectorData,   setSectorData]   = useState<SectorApiItem[]>([]);

  // Filtreler — /firsatlar ile paralel
  const [dirFilter, setDirFilter] = useState<'tumu' | 'yukari' | 'asagi'>('tumu');
  const [minScore,  setMinScore]  = useState<number>(0);
  const [minRR,     setMinRR]     = useState<number>(0);
  const [mtfOnly,   setMtfOnly]   = useState<boolean>(false);
  const [hideKap,   setHideKap]   = useState<boolean>(false);

  // AI analiz
  const [aiAnaliz,  setAiAnaliz]  = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError,   setAiError]   = useState<string | null>(null);
  const aiAbortRef  = useRef<AbortController | null>(null);

  // 1. Auth + tier + portföy semboller — soft login
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setLoggedIn(!!user);
        if (user) {
          const [{ data: prof }, { data: poz }] = await Promise.all([
            supabase.from('profiles').select('tier').eq('id', user.id).single(),
            supabase.from('portfolyo_pozisyonlar').select('sembol').eq('user_id', user.id),
          ]);
          setTier(((prof as { tier?: Tier } | null)?.tier ?? 'free'));
          setPortfoyo((poz ?? []).map((p: { sembol: string }) => p.sembol));
        }
      } catch {
        setLoggedIn(false);
      }
    })();
  }, []);

  // 2. Sektör momentum verisi (eksik sektörler hesaplaması için)
  useEffect(() => {
    fetch('/api/sectors')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.sectors) setSectorData(d.sectors as SectorApiItem[]); })
      .catch(() => {});
  }, []);

  // 2. Fırsat verisi — anonim ise tümü, login ise portföy hariç
  const fetchData = useCallback(async () => {
    if (loggedIn === null) return; // auth henüz hazır değil
    setLoading(true);
    setError(null);
    try {
      const url = loggedIn
        ? '/api/firsatlar?excludeOwned=true'
        : '/api/firsatlar';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: FirsatlarResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Veri alınamadı');
    } finally {
      setLoading(false);
    }
  }, [loggedIn]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // 3. Watchlist (login varsa)
  const fetchWatchlist = useCallback(async () => {
    try {
      const res = await fetch('/api/watchlist');
      if (!res.ok) return;
      const json = await res.json() as { id: string; sembol?: string }[];
      setWatchlist(new Set(json.map((r) => r.sembol ?? '')));
      setWatchlistIds(new Map(json.map((r) => [r.sembol ?? '', r.id])));
    } catch { /* sessizce */ }
  }, []);

  useEffect(() => {
    if (loggedIn) void fetchWatchlist();
  }, [loggedIn, fetchWatchlist]);

  const handleWatchlistToggle = useCallback(async (sembol: string, currentState: boolean) => {
    if (!loggedIn) {
      toast.info('İzleme listesi için giriş yapın');
      return;
    }
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
        const j = await res.json() as { id?: string };
        if (j.id) setWatchlistIds((prev) => new Map(prev).set(sembol, j.id!));
        toast.success(`${sembol} izleme listesine eklendi`);
      }
    } catch {
      setWatchlist((prev) => {
        const next = new Set(prev);
        if (currentState) next.add(sembol); else next.delete(sembol);
        return next;
      });
      toast.error('İşlem başarısız');
    }
  }, [loggedIn, watchlistIds]);

  // ── Çeşitlendirme analizi ──────────────────────────────────────────────

  // Portföy sektör dağılımı
  const portfoyDagilim = useMemo(() => {
    if (portfoyo.length === 0) return [];
    const map = new Map<string, { sektorId: string; sektorAdi: string; semboller: string[] }>();
    for (const s of portfoyo) {
      const sid  = getSectorId(s);
      const meta = getSector(sid);
      if (!map.has(sid)) map.set(sid, { sektorId: sid, sektorAdi: meta.name, semboller: [] });
      map.get(sid)!.semboller.push(s);
    }
    return [...map.values()]
      .map((g) => ({ ...g, oran: g.semboller.length / portfoyo.length }))
      .sort((a, b) => b.oran - a.oran);
  }, [portfoyo]);

  // Konsantrasyon riski — tek sektör ≥%50
  const konsantrasyonRiski = useMemo(() => {
    if (portfoyo.length < 3) return null;
    const top = portfoyDagilim[0];
    if (!top || top.oran < 0.5) return null;
    return { sektorAdi: top.sektorAdi, oran: top.oran, sayi: top.semboller.length };
  }, [portfoyDagilim, portfoyo]);

  // Eksik sektörler — portföyde olmayan + güçlü momentum
  const eksikSektorler = useMemo(() => {
    if (portfoyo.length === 0 || sectorData.length === 0) return [];
    const ownedSet = new Set(portfoyDagilim.map((p) => p.sektorId));
    return sectorData
      .map((s) => ({
        id:    s.sectorId ?? s.id ?? '',
        ad:    s.sectorName ?? s.name ?? s.shortName ?? '—',
        skor:  Math.round(s.compositeScore ?? 0),
      }))
      .filter((s) => s.id && !ownedSet.has(s.id) && s.skor > 0)
      .sort((a, b) => b.skor - a.skor)
      .slice(0, 3);
  }, [portfoyDagilim, sectorData, portfoyo]);

  // ── Türetilmiş veriler ─────────────────────────────────────────────────

  const filtered: FirsatItem[] = useMemo(() => (data?.firsatlar ?? []).filter((f) => {
    if (dirFilter !== 'tumu' && f.direction !== dirFilter) return false;
    if (minScore > 0 && f.adjustedScore < minScore) return false;
    if (minRR > 0 && (f.riskRewardRatio === null || f.riskRewardRatio < minRR)) return false;
    if (mtfOnly && f.weeklyAligned !== true) return false;
    if (hideKap && f.kapUyarisi?.var) return false;
    return true;
  }), [data, dirFilter, minScore, minRR, mtfOnly, hideKap]);

  // Sektör gruplama (top 5 + "Tümünü gör")
  const sektorGruplari = useMemo(() => {
    const groups = new Map<string, { sektorAdi: string; sektorId: string; items: FirsatItem[]; avgScore: number }>();
    for (const f of filtered) {
      if (!groups.has(f.sektorId)) {
        groups.set(f.sektorId, { sektorAdi: f.sektorAdi, sektorId: f.sektorId, items: [], avgScore: 0 });
      }
      groups.get(f.sektorId)!.items.push(f);
    }
    // Sektör içi sıralama — en yüksek skorlular önce
    for (const g of groups.values()) {
      g.items.sort((a, b) => b.adjustedScore - a.adjustedScore);
      g.avgScore = g.items.reduce((s, x) => s + x.adjustedScore, 0) / g.items.length;
    }
    // Sektörler arası — ortalama skora göre (kalite öncelikli)
    return [...groups.values()].sort((a, b) => b.avgScore - a.avgScore);
  }, [filtered]);

  // Özet istatistikler
  const stats = useMemo(() => {
    const items = filtered;
    if (items.length === 0) return null;
    const scores = items.map((f) => f.adjustedScore);
    const avgScore = Math.round(scores.reduce((s, x) => s + x, 0) / items.length);
    const topScore = Math.max(...scores);
    const enGuclu  = sektorGruplari[0];
    const buyCount = items.filter((f) => f.direction === 'yukari').length;
    return { total: items.length, avgScore, topScore, enGuclu, buyCount };
  }, [filtered, sektorGruplari]);

  const alSayisi  = (data?.firsatlar ?? []).filter((f) => f.direction === 'yukari').length;
  const satSayisi = (data?.firsatlar ?? []).filter((f) => f.direction === 'asagi').length;

  // ── AI Analiz ─────────────────────────────────────────────────────────

  const startAiAnalysis = useCallback(async () => {
    if (aiLoading || tier === 'free') return;
    setAiError(null);
    setAiLoading(true);
    setAiAnaliz('');
    aiAbortRef.current = new AbortController();
    try {
      const res = await fetch('/api/ters-portfolyo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: aiAbortRef.current.signal,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAiError(d.error ?? 'Bir hata oluştu.');
        return;
      }
      const reader = res.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of dec.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const p = JSON.parse(line.slice(6));
            if (p.text) { acc += p.text; setAiAnaliz(acc); }
            if (p.error) setAiError(p.error);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setAiError('Bağlantı hatası.');
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, tier]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-6">

        {/* Başlık */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Compass className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Portföy Dışı Fırsatlar</h1>
              <p className="text-sm text-text-secondary">
                {loggedIn
                  ? 'Portföyünde olmayan, en güçlü sinyalli hisseler — sektör bazlı'
                  : 'Tüm BIST evreninde aktif sinyaller — giriş yapınca portföyün hariç tutulur'}
              </p>
            </div>
          </div>
          <button
            onClick={() => void fetchData()}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-primary transition-colors hover:bg-white/10 disabled:opacity-50 self-start"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Soft login uyarısı (anonim) */}
        {loggedIn === false && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-500/25 bg-blue-500/5 p-4">
            <Compass className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-300">Giriş yapmadın</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Şu anda tüm BIST hisselerini görüyorsun.{' '}
                <Link href="/giris" className="text-primary hover:underline">Giriş yapınca</Link>
                {' '}portföy ve izleme listendeki hisseler bu listeden otomatik çıkarılır.
              </p>
            </div>
          </div>
        )}

        {/* Excluded count badge (login + portföy var) */}
        {loggedIn && data?.excludedOwnedCount !== undefined && data.excludedOwnedCount > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300/90">
            <span>✓</span>
            <span>
              {data.excludedOwnedCount} hisse{' '}
              <span className="text-text-muted">(portföy/izleme listende olduğu için)</span>
              {' '}listeden çıkarıldı
            </span>
          </div>
        )}

        {/* Veri tazelenme rozeti — gün içi 3 kez güncelleniyor */}
        {(data?.lastRefreshedAt || data?.scannedAt) && (() => {
          const refreshAt = data.lastRefreshedAt ?? data.scannedAt!;
          const diffMs = Date.now() - new Date(refreshAt).getTime();
          const h = Math.floor(diffMs / 3_600_000);
          const m = Math.floor((diffMs % 3_600_000) / 60_000);
          const ageText = h < 1 ? `${m} dk önce` : h < 24 ? `${h} sa ${m} dk önce` : `${Math.floor(h / 24)} gün önce`;
          const fresh = h < 6;
          const stale = h >= 24;
          const cls = fresh
            ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300/90'
            : stale
            ? 'border-zinc-500/25 bg-zinc-500/5 text-zinc-400'
            : 'border-amber-500/20 bg-amber-500/5 text-amber-300/90';
          return (
            <div className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${cls}`}>
              <span>{fresh ? '✓' : stale ? '⏱️' : '🔄'}</span>
              <span>
                <strong>Son güncelleme:</strong>{' '}
                {new Date(refreshAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                {' · '}{ageText}
              </span>
              <span className="ml-auto text-[10px] opacity-70 hidden sm:inline">
                Veri günde 3× yenilenir (07:30 · 12:00 · 19:00)
              </span>
            </div>
          );
        })()}

        {/* ── Çeşitlendirme Asistanı Bloğu ────────────────────────────── */}

        {/* 1. Portföy Sektör Dağılımı */}
        {loggedIn && portfoyo.length > 0 && portfoyDagilim.length > 0 && (
          <section className="mb-4 rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <PieChart className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-text-primary">Portföy Sektör Dağılımı</h2>
              <span className="ml-auto text-xs text-text-muted">{portfoyo.length} hisse · {portfoyDagilim.length} sektör</span>
            </div>

            {/* Yığın bar */}
            <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-white/5">
              {portfoyDagilim.map((g, i) => (
                <div
                  key={g.sektorId}
                  className={colorFor(i)}
                  style={{ width: `${g.oran * 100}%` }}
                  title={`${g.sektorAdi}: %${Math.round(g.oran * 100)}`}
                />
              ))}
            </div>

            {/* Liste */}
            <div className="grid gap-1.5 sm:grid-cols-2">
              {portfoyDagilim.map((g, i) => (
                <div key={g.sektorId} className="flex items-center gap-2 text-xs">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${colorFor(i)}`} />
                  <span className="text-text-secondary truncate">{g.sektorAdi}</span>
                  <span className="text-text-muted ml-auto shrink-0">
                    {g.semboller.length} · %{Math.round(g.oran * 100)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 2. Konsantrasyon riski uyarısı */}
        {konsantrasyonRiski && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
            <Shield className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-300">
                Konsantrasyon Riski — {konsantrasyonRiski.sektorAdi}
              </p>
              <p className="mt-0.5 text-xs text-amber-200/80">
                Portföyünün %{Math.round(konsantrasyonRiski.oran * 100)}'i tek sektörde
                ({konsantrasyonRiski.sayi}/{portfoyo.length} hisse). Çeşitlendirmek riski azaltır —
                aşağıdaki güçlü sektörlerden seçim yapabilirsin.
              </p>
            </div>
          </div>
        )}

        {/* 3. Eksik sektörler — öne çıkarılmış */}
        {eksikSektorler.length > 0 && (
          <section className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Award className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-emerald-300">
                Portföyünde Olmayan Güçlü Sektörler
              </h2>
              <span className="ml-auto text-[11px] text-emerald-300/60">Çeşitlendirme önerisi</span>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {eksikSektorler.map((s) => (
                <Link
                  key={s.id}
                  href={`/firsatlar?sektor=${encodeURIComponent(s.id)}`}
                  className="group flex items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">{s.ad}</div>
                    <div className="text-[11px] text-emerald-300/80">
                      Momentum skor: <span className="font-semibold">{s.skor}</span>
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-emerald-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </Link>
              ))}
            </div>

            <p className="mt-2.5 text-[11px] text-text-muted">
              Bu sektörlerde aktif sinyaller görmek için karta tıkla. Skor yüksekse sektör genelinde momentum güçlüdür.
            </p>
          </section>
        )}

        {/* AI Analiz Butonu / Tier Gate */}
        {!loading && (
          <div className="mb-5">
            {tier === 'free' || !loggedIn ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
                <Lock className="h-4 w-4 text-violet-400" />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-medium text-violet-300">AI Fırsat Analizi</p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Portföyüne özel kişiselleştirilmiş analiz — Pro ve Premium planlarda
                  </p>
                </div>
                <Link
                  href="/fiyatlandirma"
                  className="flex items-center gap-1.5 rounded-lg bg-violet-500/20 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/30 transition-colors"
                >
                  <Crown className="h-3 w-3" />
                  Yükselt
                </Link>
              </div>
            ) : !aiAnaliz ? (
              <button
                onClick={() => void startAiAnalysis()}
                disabled={aiLoading}
                className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
              >
                {aiLoading
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> AI analiz ediliyor…</>
                  : <><Sparkles className="h-3.5 w-3.5" /> AI ile Fırsat Analizi Yap</>
                }
              </button>
            ) : null}

            {aiError && <p className="mt-2 text-xs text-red-400">{aiError}</p>}

            {aiAnaliz && (
              <div className="mt-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Bot className="h-4 w-4 text-violet-400" />
                  <span className="text-xs font-semibold text-violet-400 uppercase tracking-wider">AI Portföy Analizi</span>
                  <button
                    onClick={() => { setAiAnaliz(''); setAiError(null); }}
                    className="ml-auto text-[11px] text-text-muted hover:text-text-secondary transition-colors"
                  >
                    Kapat
                  </button>
                </div>
                <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
                  {aiAnaliz}
                  {aiLoading && <span className="inline-block h-4 w-0.5 animate-pulse bg-violet-400 align-middle ml-0.5" />}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4 Stat kart */}
        {!loading && stats && (
          <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                icon: Layers,
                label: 'Toplam Fırsat',
                value: String(stats.total),
                sub: `↑ ${stats.buyCount} AL · ↓ ${stats.total - stats.buyCount} SAT`,
                color: 'text-text-primary',
              },
              {
                icon: Target,
                label: 'Ortalama Skor',
                value: String(stats.avgScore),
                sub: stats.avgScore >= 70 ? 'Güçlü' : stats.avgScore >= 55 ? 'Orta' : 'Zayıf',
                color: stats.avgScore >= 70 ? 'text-green-400' : stats.avgScore >= 55 ? 'text-yellow-400' : 'text-orange-400',
              },
              {
                icon: Award,
                label: 'En Güçlü Sektör',
                value: stats.enGuclu?.sektorAdi ?? '—',
                sub: stats.enGuclu ? `${stats.enGuclu.items.length} hisse · ort. ${Math.round(stats.enGuclu.avgScore)}` : '',
                color: 'text-primary',
              },
              {
                icon: TrendingUp,
                label: 'En Yüksek Skor',
                value: String(stats.topScore),
                sub: stats.topScore >= 70 ? 'Güçlü' : stats.topScore >= 55 ? 'Orta' : 'Zayıf',
                color: stats.topScore >= 70 ? 'text-green-400' : stats.topScore >= 55 ? 'text-yellow-400' : 'text-orange-400',
              },
            ].map(({ icon: Icon, label, value, sub, color }) => (
              <div key={label} className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-1 flex items-center gap-1.5 text-xs text-text-muted">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </div>
                <div className={`text-lg font-bold truncate ${color}`}>{value}</div>
                {sub && <div className="mt-0.5 text-[11px] text-text-muted truncate">{sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Filtreler — /firsatlar ile paralel */}
        {!loading && !error && data && data.firsatlar.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
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

            {/* Min R/R */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">Min R/R:</span>
              <div className="flex overflow-hidden rounded-lg border border-border">
                {([
                  { val: 0,   label: 'Tümü' },
                  { val: 1.5, label: '≥1.5' },
                  { val: 2,   label: '≥2'   },
                  { val: 3,   label: '≥3'   },
                ] as const).map((opt) => (
                  <button key={opt.val} onClick={() => setMinRR(opt.val)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      minRR === opt.val ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            {/* MTF */}
            <button
              onClick={() => setMtfOnly((v) => !v)}
              aria-pressed={mtfOnly}
              title="Sadece haftalık trend ile uyumlu sinyalleri göster"
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                mtfOnly
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : 'border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              MTF ✓ {mtfOnly ? 'Açık' : 'Kapalı'}
            </button>

            {/* KAP gizle */}
            <button
              onClick={() => setHideKap((v) => !v)}
              aria-pressed={hideKap}
              title="Son 7 günde kritik KAP duyurusu olan sinyalleri gizle"
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                hideKap
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
                  : 'border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              KAP Gizle
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
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

        {/* Boş durum */}
        {!loading && !error && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Compass className="mx-auto mb-4 h-12 w-12 text-text-muted opacity-30" />
            <h2 className="mb-2 text-xl font-bold text-text-primary">Sonuç Yok</h2>
            <p className="max-w-sm text-sm text-text-secondary">
              {data?.firsatlar.length === 0
                ? 'Şu an aktif sinyal bulunmuyor. Sistem her iş günü sabah taranır.'
                : 'Mevcut filtrelerle eşleşen fırsat yok — filtreleri gevşetmeyi dene.'}
            </p>
          </div>
        )}

        {/* Sektör grupları */}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-6">
            {sektorGruplari.map((grup) => {
              const top5 = grup.items.slice(0, 5);
              const totalForSector = grup.items.length;
              return (
                <section key={grup.sektorId}>
                  <div className="mb-3 flex items-end justify-between gap-2 flex-wrap">
                    <div>
                      <h2 className="text-base font-bold text-text-primary">{grup.sektorAdi}</h2>
                      <p className="text-xs text-text-muted">
                        {totalForSector} fırsat · ortalama skor{' '}
                        <span className={
                          grup.avgScore >= 70 ? 'text-green-400' :
                          grup.avgScore >= 55 ? 'text-yellow-400' : 'text-orange-400'
                        }>{Math.round(grup.avgScore)}</span>
                      </p>
                    </div>
                    {totalForSector > 5 && (
                      <Link
                        href={`/firsatlar?sektor=${encodeURIComponent(grup.sektorId)}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Tümünü gör ({totalForSector}) →
                      </Link>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {top5.map((f, i) => (
                      <FirsatKarti
                        key={f.sembol}
                        firsat={f}
                        index={i}
                        inWatchlist={watchlist.has(f.sembol)}
                        onWatchlistToggle={handleWatchlistToggle}
                        source="tersportfolyo"
                      />
                    ))}
                  </div>
                </section>
              );
            })}
            <p className="mt-6 text-center text-xs text-text-muted">
              {loggedIn
                ? 'Portföyünde / izleme listende olmayan hisseler · Confluence ≥ 45 · Yatırım tavsiyesi değildir'
                : 'Tüm BIST · Confluence ≥ 45 · Yatırım tavsiyesi değildir'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
