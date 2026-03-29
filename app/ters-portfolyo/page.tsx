'use client';

/**
 * Portföy Dışı Fırsatlar — "Ters Portföy"
 *
 * Kullanıcının portföyünde veya watchlist'inde OLMAYAN hisseler arasından
 * güçlü sektörlere göre fırsat önerileri sunar.
 *
 * Step 12 — Sonnet kısmı (UI + sektör bazlı öneriler)
 * Opus kısmı (AI öneri prompt + kişiselleştirilmiş analiz) sonraya bırakıldı.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus, Compass, RefreshCw, Eye, Info, Sparkles, Bot } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { SECTORS, getSectorId, getAllSectors } from '@/lib/sectors';
import { BIST_SYMBOLS } from '@/types';
import type { SectorId } from '@/lib/sectors';
import { WatchlistButton } from '@/components/WatchlistButton';

// ─── Sektör momentum API tipi ─────────────────────────────────────────────────

interface SectorMomentumRow {
  id: SectorId;
  name: string;
  direction: 'yukari' | 'asagi' | 'nötr';
  compositeScore: number;
  momentum20d: number;
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function directionBadge(dir: 'yukari' | 'asagi' | 'nötr') {
  if (dir === 'yukari') return (
    <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
      <TrendingUp className="h-2.5 w-2.5" /> Yükseliş
    </span>
  );
  if (dir === 'asagi') return (
    <span className="inline-flex items-center gap-0.5 rounded border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
      <TrendingDown className="h-2.5 w-2.5" /> Düşüş
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-zinc-500/30 bg-zinc-500/10 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
      <Minus className="h-2.5 w-2.5" /> Yatay
    </span>
  );
}

// ─── Hisse Kartı ─────────────────────────────────────────────────────────────

function HisseKart({
  sembol,
  isWatchlisted,
}: {
  sembol: string;
  isWatchlisted: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2.5 hover:border-primary/30 transition-colors">
      <Link
        href={`/hisse/${sembol}`}
        className="flex items-center gap-2 min-w-0 flex-1"
      >
        <span className="text-sm font-bold text-text-primary">{sembol}</span>
        <Eye className="h-3.5 w-3.5 text-text-muted opacity-0 group-hover:opacity-100" />
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href={`/hisse/${sembol}`}
          className="text-[11px] text-primary hover:underline"
        >
          İncele
        </Link>
        <WatchlistButton sembol={sembol} isInWatchlist={isWatchlisted} />
      </div>
    </div>
  );
}

// ─── Sektör Bölümü ────────────────────────────────────────────────────────────

function SektorBolum({
  sektorId,
  momentum,
  semboller,
  watchlistedSet,
  portfolyoSet,
}: {
  sektorId: SectorId;
  momentum: SectorMomentumRow | undefined;
  semboller: string[];
  watchlistedSet: Set<string>;
  portfolyoSet: Set<string>;
}) {
  const sektor  = SECTORS[sektorId];
  const disinda = semboller.filter(s => !portfolyoSet.has(s));
  if (disinda.length === 0) return null;

  const portfoydeVar = semboller.filter(s => portfolyoSet.has(s));
  const dir          = momentum?.direction ?? 'nötr';

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {/* Başlık */}
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">{sektor.name}</h3>
          {directionBadge(dir)}
          {momentum && (
            <span className={`text-xs font-mono ${momentum.compositeScore >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {momentum.compositeScore > 0 ? '+' : ''}{momentum.compositeScore}
            </span>
          )}
        </div>
        {portfoydeVar.length > 0 && (
          <span className="text-[11px] text-text-muted">
            Portföyünüzde: {portfoydeVar.join(', ')}
          </span>
        )}
      </div>

      {/* Hisseler */}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {disinda.slice(0, 6).map(s => (
          <HisseKart key={s} sembol={s} isWatchlisted={watchlistedSet.has(s)} />
        ))}
      </div>
      {disinda.length > 6 && (
        <p className="mt-2 text-[11px] text-text-muted text-right">
          +{disinda.length - 6} hisse daha
        </p>
      )}
    </div>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function TersPortfolyoPage() {
  const [portfolyoSet,  setPortfolyoSet]  = useState<Set<string>>(new Set());
  const [watchlistedSet, setWatchlistedSet] = useState<Set<string>>(new Set());
  const [sektorMomentum, setSektorMomentum] = useState<SectorMomentumRow[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [sectorLoading, setSectorLoading] = useState(true);
  const [loggedIn,      setLoggedIn]      = useState<boolean | null>(null);
  const [sadeceCPh,     setSadeceCPh]     = useState(false); // sadece çıkmış potansiyel
  const [aiAnaliz,      setAiAnaliz]      = useState('');
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiError,       setAiError]       = useState<string | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);

  // 1. Auth + Portföy + Watchlist
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        setLoggedIn(!!user);
        if (!user) return;

        const [{ data: poz }, { data: watch }] = await Promise.all([
          supabase.from('portfolyo_pozisyonlar').select('sembol').eq('user_id', user.id),
          supabase.from('watchlist').select('sembol').eq('user_id', user.id),
        ]);

        setPortfolyoSet(new Set((poz ?? []).map((p: { sembol: string }) => p.sembol)));
        setWatchlistedSet(new Set((watch ?? []).map((w: { sembol: string }) => w.sembol)));
      } catch { /* sessizce geç */ }
      finally { setLoading(false); }
    })();
  }, []);

  // 2. Sektör momentum
  useEffect(() => {
    setSectorLoading(true);
    fetch('/api/sectors')
      .then(r => r.ok ? r.json() : null)
      .then((data) => {
        if (!data?.sectors) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setSektorMomentum(data.sectors.map((s: any) => ({
          id:             s.id,
          name:           s.name,
          direction:      s.direction ?? 'nötr',
          compositeScore: Math.round(s.compositeScore ?? 0),
          momentum20d:    s.momentum20d ?? 0,
        })));
      })
      .catch(() => {})
      .finally(() => setSectorLoading(false));
  }, []);

  // Sektör → semboller haritası (BIST_SYMBOLS'dan)
  const sektorSembolMap = useMemo(() => {
    const map = new Map<SectorId, string[]>();
    for (const sembol of BIST_SYMBOLS as readonly string[]) {
      const id = getSectorId(sembol);
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(sembol);
    }
    return map;
  }, []);

  // Momentum'a göre sıralı sektörler
  const siralanmisSektorler = useMemo(() => {
    const momentumMap = new Map(sektorMomentum.map(m => [m.id, m]));
    return getAllSectors()
      .map(s => ({
        ...s,
        momentum: momentumMap.get(s.id as SectorId),
        semboller: sektorSembolMap.get(s.id as SectorId) ?? [],
        disindaCount: (sektorSembolMap.get(s.id as SectorId) ?? []).filter(sym => !portfolyoSet.has(sym)).length,
      }))
      .filter(s => s.disindaCount > 0)
      .sort((a, b) => {
        const aScore = a.momentum?.compositeScore ?? 0;
        const bScore = b.momentum?.compositeScore ?? 0;
        return bScore - aScore;
      });
  }, [sektorMomentum, sektorSembolMap, portfolyoSet]);

  const filtrelenmis = useMemo(() => {
    if (!sadeceCPh) return siralanmisSektorler;
    return siralanmisSektorler.filter(s => s.momentum?.direction === 'yukari');
  }, [siralanmisSektorler, sadeceCPh]);

  const toplamDisinda = useMemo(
    () => (BIST_SYMBOLS as readonly string[]).filter(s => !portfolyoSet.has(s)).length,
    [portfolyoSet]
  );

  // Giriş yapılmamış
  if (loggedIn === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-sm w-full rounded-xl border border-border bg-surface p-8 text-center">
          <Compass className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold text-text-primary mb-2">Portföy Dışı Fırsatlar</h2>
          <p className="text-sm text-text-secondary mb-6">
            Portföyünüzde olmayan hisseleri görmek için giriş yapmanız gerekiyor.
          </p>
          <Link
            href="/giris"
            className="inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
          >
            Giriş Yap
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Compass className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-text-primary">Portföy Dışı Fırsatlar</h1>
          </div>
          <p className="text-sm text-text-secondary">
            Portföyünüzde bulunmayan hisseler, sektör momentumuna göre sıralandı.
            {!loading && portfolyoSet.size > 0 && (
              <span className="ml-2 text-xs text-text-muted">
                {portfolyoSet.size} hisse takip ediyorsunuz · {toplamDisinda} hisse henüz portföyünüzde değil
              </span>
            )}
          </p>
        </div>

        {/* AI Analiz Butonu + Panel */}
        {!loading && loggedIn && (
          <div className="mb-5">
            {!aiAnaliz && (
              <button
                onClick={async () => {
                  if (aiLoading) return;
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
                }}
                disabled={aiLoading}
                className="flex items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-sm font-medium text-violet-400 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
              >
                {aiLoading
                  ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> AI analiz ediliyor…</>
                  : <><Sparkles className="h-3.5 w-3.5" /> AI ile Fırsat Analizi Yap</>
                }
              </button>
            )}

            {aiError && (
              <p className="mt-2 text-xs text-red-400">{aiError}</p>
            )}

            {aiAnaliz && (
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-5">
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

        {/* Filtreler */}
        <div className="mb-5 flex items-center gap-3 flex-wrap">
          <button
            onClick={() => setSadeceCPh(v => !v)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
              sadeceCPh
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                : 'border-border text-text-secondary hover:border-primary/30'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            Sadece Yükseliş Trendindeki Sektörler
          </button>

          {sectorLoading && (
            <span className="flex items-center gap-1.5 text-xs text-text-muted">
              <RefreshCw className="h-3 w-3 animate-spin" /> Sektör verisi yükleniyor…
            </span>
          )}
        </div>

        {/* Info banner */}
        {portfolyoSet.size === 0 && !loading && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-300 font-medium">Portföyünüz boş</p>
              <p className="text-xs text-text-secondary mt-0.5">
                Portföye hisse eklediğinizde, o hisseler bu listeden kaldırılır ve takip etmediğiniz fırsatlar öne çıkar.{' '}
                <Link href="/portfolyo" className="text-primary hover:underline">Portföy ekle →</Link>
              </p>
            </div>
          </div>
        )}

        {/* Sektörler */}
        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-surface" />
            ))}
          </div>
        ) : filtrelenmis.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface py-12 text-center">
            <TrendingUp className="h-8 w-8 text-text-muted" />
            <p className="text-sm text-text-secondary">
              {sadeceCPh
                ? 'Şu an yükseliş trendinde sektör bulunamadı.'
                : 'Tüm hisseler portföyünüzde. Tebrikler!'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtrelenmis.map(s => (
              <SektorBolum
                key={s.id}
                sektorId={s.id as SectorId}
                momentum={s.momentum}
                semboller={s.semboller}
                watchlistedSet={watchlistedSet}
                portfolyoSet={portfolyoSet}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
