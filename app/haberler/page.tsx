'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Newspaper, RefreshCw, ExternalLink, TrendingUp, Clock,
  Search, Copy, Check, ChevronDown, Bell,
} from 'lucide-react';
import type { HaberItem } from '@/app/api/haber/route';

// ─── Kaynak renkleri ──────────────────────────────────────────────────────────

const KAYNAK_RENK: Record<string, string> = {
  'NTV Ekonomi':       'bg-blue-500/20 text-blue-400',
  'Sabah Ekonomi':     'bg-orange-500/20 text-orange-400',
  'Hürriyet Ekonomi':  'bg-red-500/20 text-red-400',
  'Habertürk Ekonomi': 'bg-purple-500/20 text-purple-400',
  'Haber7 Ekonomi':    'bg-emerald-500/20 text-emerald-400',
};

// ─── Kategori tespiti ─────────────────────────────────────────────────────────

const CATEGORY_MAP: { keywords: string[]; label: string; cls: string }[] = [
  { keywords: ['tcmb', 'merkez bankası', 'faiz', 'para politikası', 'ppk'],         label: 'Merkez Bankası', cls: 'bg-violet-500/20 text-violet-400' },
  { keywords: ['dolar', 'euro', 'kur', 'döviz', 'sterlin', 'yen'],                  label: 'Döviz',          cls: 'bg-blue-500/20 text-blue-400'   },
  { keywords: ['borsa', 'bist', 'hisse', 'endeks', 'xu100', 'xu30'],                label: 'Borsa',          cls: 'bg-emerald-500/20 text-emerald-400' },
  { keywords: ['enflasyon', 'tüfe', 'üfe', 'fiyat artışı'],                         label: 'Enflasyon',      cls: 'bg-red-500/20 text-red-400'     },
  { keywords: ['büyüme', 'gsyh', 'gdp', 'ekonomi', 'resesyon'],                    label: 'Ekonomi',        cls: 'bg-yellow-500/20 text-yellow-400' },
  { keywords: ['petrol', 'doğalgaz', 'enerji', 'elektrik', 'ham petrol'],            label: 'Enerji',         cls: 'bg-orange-500/20 text-orange-400' },
  { keywords: ['altın', 'gümüş', 'emtia', 'bakır', 'demir'],                       label: 'Emtia',          cls: 'bg-amber-500/20 text-amber-400'  },
  { keywords: ['kredi', 'banka', 'finans', 'mevduat', 'sigorta'],                   label: 'Finans',         cls: 'bg-cyan-500/20 text-cyan-400'    },
  { keywords: ['ihracat', 'ithalat', 'dış ticaret', 'cari', 'ticaret dengesi'],     label: 'Dış Ticaret',   cls: 'bg-teal-500/20 text-teal-400'   },
];

function detectCategory(baslik: string): { label: string; cls: string } | null {
  const lower = baslik.toLowerCase();
  for (const { keywords, label, cls } of CATEGORY_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return { label, cls };
    }
  }
  return null;
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

function zamanFarki(tarihStr: string): string {
  if (!tarihStr) return '';
  const tarih = new Date(tarihStr);
  const simdi = new Date();
  const dk    = Math.floor((simdi.getTime() - tarih.getTime()) / 60000);
  if (dk < 1)    return 'Az önce';
  if (dk < 60)   return `${dk} dakika önce`;
  if (dk < 1440) return `${Math.floor(dk / 60)} saat önce`;
  return tarih.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

export default function HaberlerPage() {
  const [haberler,      setHaberler]      = useState<HaberItem[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [sonGuncelleme, setSonGuncelleme] = useState<Date | null>(null);

  // Filtre durumları
  const [activeKaynak,  setActiveKaynak]  = useState<string | null>(null);
  const [searchQuery,   setSearchQuery]   = useState('');

  // Pagination
  const [visibleCount, setVisibleCount] = useState(8);

  // Kopya
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Yeni haber banner
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingData,  setPendingData]  = useState<HaberItem[]>([]);
  const haberlerRef = useRef<HaberItem[]>([]);

  // İlk yükleme
  async function loadHaberler(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/haber');
      if (!res.ok) return;
      const data = await res.json();
      const fresh: HaberItem[] = data.haberler ?? [];
      setHaberler(fresh);
      haberlerRef.current = fresh;
      setSonGuncelleme(new Date());
      setPendingCount(0);
      setPendingData([]);
      setVisibleCount(8);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { void loadHaberler(); }, []);

  // Auto-refresh her 5 dakikada bir (sessiz)
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/haber');
        if (!res.ok) return;
        const data = await res.json();
        const fresh: HaberItem[] = data.haberler ?? [];
        const current = haberlerRef.current;
        const newOnes = fresh.filter(
          (h) => !current.some((old) => old.link === h.link),
        );
        if (newOnes.length > 0) {
          setPendingCount(newOnes.length);
          setPendingData(fresh);
        }
      } catch {
        // ignore
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // Benzersiz kaynaklar
  const kaynaklar = useMemo(
    () => [...new Set(haberler.map((h) => h.kaynak).filter(Boolean))],
    [haberler],
  );

  // Filtrelenmiş haberler
  const filteredHaberler = useMemo(() => {
    let list = haberler;
    if (activeKaynak) list = list.filter((h) => h.kaynak === activeKaynak);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((h) => h.baslik?.toLowerCase().includes(q));
    }
    return list;
  }, [haberler, activeKaynak, searchQuery]);

  const visible      = filteredHaberler.slice(0, visibleCount);
  const onceCikanlar = visible.slice(0, 3);
  const digerler     = visible.slice(3);
  const hasMore      = filteredHaberler.length > visibleCount;

  // Linki kopyala
  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(link);
      setTimeout(() => setCopiedLink(null), 2000);
    } catch {
      // ignore
    }
  }

  // Yeni haberleri göster
  function showPending() {
    setHaberler(pendingData);
    haberlerRef.current = pendingData;
    setPendingCount(0);
    setPendingData([]);
    setSonGuncelleme(new Date());
    setVisibleCount(8);
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-4xl">

        {/* Başlık */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-text-primary">
              <Newspaper className="h-6 w-6 text-primary" />
              Günün Öne Çıkan Haberleri
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Türk ekonomi medyasından derlenen güncel haberler
              {sonGuncelleme && (
                <span className="ml-2 text-text-muted">
                  · Son güncelleme: {sonGuncelleme.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => void loadHaberler(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:border-primary/40 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Yeni haber banner */}
        {pendingCount > 0 && (
          <button
            onClick={showPending}
            className="mb-4 w-full flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary hover:bg-primary/20 transition-colors animate-fade-in-up-sm"
          >
            <Bell className="h-4 w-4" />
            {pendingCount} yeni haber yüklendi — göster
          </button>
        )}

        {/* Arama + Kaynak filtresi */}
        {!loading && haberler.length > 0 && (
          <div className="mb-5 space-y-3">
            {/* Arama */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Haberlerde ara..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(8); }}
                className="w-full rounded-xl border border-border bg-surface/50 pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/50 focus:outline-none transition-colors"
              />
            </div>

            {/* Kaynak filtre chips */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setActiveKaynak(null); setVisibleCount(8); }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeKaynak === null
                    ? 'bg-primary/20 text-primary border border-primary/40'
                    : 'bg-surface border border-border text-text-muted hover:text-text-primary'
                }`}
              >
                Tümü ({haberler.length})
              </button>
              {kaynaklar.map((k) => (
                <button
                  key={k}
                  onClick={() => { setActiveKaynak(k); setVisibleCount(8); }}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    activeKaynak === k
                      ? `${KAYNAK_RENK[k] ?? 'bg-zinc-500/20 text-zinc-400'} border border-current/30`
                      : 'bg-surface border border-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  {k?.replace(' Ekonomi', '')} ({haberler.filter((h) => h.kaynak === k).length})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-surface" />
            ))}
          </div>
        )}

        {/* İçerik */}
        {!loading && (
          <>
            {filteredHaberler.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center animate-fade-in">
                <Newspaper className="mb-4 h-12 w-12 text-text-muted" />
                <p className="text-text-secondary">
                  {haberler.length === 0
                    ? 'Şu an haber yüklenemiyor.'
                    : 'Bu kriterlere uyan haber bulunamadı.'}
                </p>
                {haberler.length === 0 && (
                  <button
                    onClick={() => void loadHaberler()}
                    className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-white"
                  >
                    Tekrar Dene
                  </button>
                )}
              </div>
            ) : (
              <div>
                {/* Öne çıkan 3 haber */}
                {onceCikanlar.length > 0 && (
                  <div className="mb-6 grid gap-4 md:grid-cols-3">
                    {onceCikanlar.map((haber, i) => {
                      const cat = detectCategory(haber.baslik ?? '');
                      return (
                        <div
                          key={haber.link ?? i}
                          className={`group flex flex-col rounded-xl border border-border bg-surface p-4 hover:border-primary/50 hover:bg-surface-alt transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 animate-fade-in-up-sm stagger-${i + 1}`}
                        >
                          <div className="mb-3 flex items-center justify-between gap-1 flex-wrap">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KAYNAK_RENK[haber.kaynak] ?? 'bg-zinc-500/20 text-zinc-400'}`}>
                              {haber.kaynak}
                            </span>
                            <div className="flex items-center gap-1">
                              {cat && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cat.cls}`}>
                                  {cat.label}
                                </span>
                              )}
                              {i === 0 && (
                                <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                                  <TrendingUp className="h-3 w-3" />
                                  Öne Çıkan
                                </span>
                              )}
                            </div>
                          </div>

                          <a
                            href={haber.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1"
                          >
                            <p className="text-sm font-medium leading-snug text-text-primary group-hover:text-primary transition-colors line-clamp-3">
                              {haber.baslik}
                            </p>
                          </a>

                          <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {zamanFarki(haber.tarih)}
                            </span>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.preventDefault(); void copyLink(haber.link ?? ''); }}
                                title="Linki kopyala"
                                className="hover:text-primary transition-colors"
                              >
                                {copiedLink === haber.link
                                  ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  : <Copy className="h-3.5 w-3.5" />
                                }
                              </button>
                              <a href={haber.link} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3 hover:text-primary transition-colors" />
                              </a>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Diğer haberler */}
                <div className="space-y-2">
                  {digerler.map((haber, i) => {
                    const cat = detectCategory(haber.baslik ?? '');
                    return (
                      <div
                        key={haber.link ?? (i + 3)}
                        className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:border-primary/40 hover:bg-surface-alt transition-all duration-150 animate-fade-in-up-sm"
                        style={{ animationDelay: `${240 + i * 40}ms` }}
                      >
                        <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${KAYNAK_RENK[haber.kaynak] ?? 'bg-zinc-500/20 text-zinc-400'}`}>
                          {haber.kaynak?.replace(' Ekonomi', '')}
                        </span>

                        {cat && (
                          <span className={`shrink-0 hidden sm:inline rounded-md px-2 py-0.5 text-[10px] font-semibold ${cat.cls}`}>
                            {cat.label}
                          </span>
                        )}

                        <a
                          href={haber.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-0"
                        >
                          <p className="text-sm text-text-primary group-hover:text-primary transition-colors line-clamp-1">
                            {haber.baslik}
                          </p>
                        </a>

                        <div className="shrink-0 flex items-center gap-2 text-xs text-text-muted">
                          <span className="hidden sm:block">{zamanFarki(haber.tarih)}</span>
                          <button
                            onClick={() => void copyLink(haber.link ?? '')}
                            title="Linki kopyala"
                            className="opacity-0 group-hover:opacity-100 hover:text-primary transition-all"
                          >
                            {copiedLink === haber.link
                              ? <Check className="h-3.5 w-3.5 text-emerald-400" />
                              : <Copy className="h-3.5 w-3.5" />
                            }
                          </button>
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Daha fazla yükle */}
                {hasMore && (
                  <button
                    onClick={() => setVisibleCount((c) => c + 8)}
                    className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-surface/50 py-3 text-sm text-text-secondary hover:text-text-primary hover:bg-surface transition-colors animate-fade-in"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Daha fazla yükle ({filteredHaberler.length - visibleCount} haber kaldı)
                  </button>
                )}

                <p className="mt-6 text-center text-xs text-text-muted">
                  Haberler NTV, Sabah, Hürriyet ve Habertürk&apos;ten derlenmektedir · Her 5 dakikada kontrol edilir
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
