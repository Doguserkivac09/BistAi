'use client';

import { useState, useEffect, useMemo } from 'react';
import { FileText, ExternalLink, RefreshCw, Building2, Search, ChevronDown } from 'lucide-react';
import type { KapDuyuru } from '@/lib/kap';

const KATEGORI_RENK: Record<string, string> = {
  'Özel Durum':     'bg-red-500/20 text-red-400',
  'Finansal Rapor': 'bg-emerald-500/20 text-emerald-400',
  'Finansal Tablo': 'bg-blue-500/20 text-blue-400',
  'Genel Kurul':    'bg-violet-500/20 text-violet-400',
  'BDDK':           'bg-orange-500/20 text-orange-400',
  'SPK Bildirimi':  'bg-cyan-500/20 text-cyan-400',
  'İhraç':          'bg-amber-500/20 text-amber-400',
};

function zamanFarki(tarihStr: string): string {
  if (!tarihStr) return '';
  const tarih = new Date(tarihStr);
  if (isNaN(tarih.getTime())) return tarihStr;
  const dk = Math.floor((Date.now() - tarih.getTime()) / 60000);
  if (dk < 1)    return 'Az önce';
  if (dk < 60)   return `${dk} dakika önce`;
  if (dk < 1440) return `${Math.floor(dk / 60)} saat önce`;
  if (dk < 2880) return 'Dün';
  return tarih.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export function TabKap() {
  const [duyurular,  setDuyurular]  = useState<KapDuyuru[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeKat,  setActiveKat]  = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(15);

  async function loadDuyurular(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/kap');
      if (!res.ok) return;
      const data = await res.json();
      setDuyurular(data.duyurular ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }

  useEffect(() => { void loadDuyurular(); }, []);

  // Benzersiz kategoriler
  const kategoriler = useMemo(
    () => [...new Set(duyurular.map((d) => d.kategoriAdi).filter(Boolean))],
    [duyurular],
  );

  // Filtrelenmiş liste
  const filtered = useMemo(() => {
    let list = duyurular;
    if (activeKat) list = list.filter((d) => d.kategoriAdi === activeKat);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) => d.baslik?.toLowerCase().includes(q) || d.sirket?.toLowerCase().includes(q) || d.sembol?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [duyurular, activeKat, searchQuery]);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = filtered.length > visibleCount;

  return (
    <div>
      {/* Açıklama */}
      <p className="mb-5 text-sm text-text-secondary">
        KAP (Kamuyu Aydınlatma Platformu) üzerinden yayımlanan şirket bildirimleri
      </p>

      {/* Arama + Filtre + Yenile */}
      {!loading && duyurular.length > 0 && (
        <div className="mb-5 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                placeholder="Şirket, sembol veya başlık ara..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(15); }}
                className="w-full rounded-xl border border-border bg-surface/50 pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-primary/50 focus:outline-none transition-colors"
              />
            </div>
            <button
              onClick={() => void loadDuyurular(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-text-secondary hover:border-primary/40 transition-colors disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>

          {/* Kategori filtre chips */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setActiveKat(null); setVisibleCount(15); }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeKat === null
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-surface border border-border text-text-muted hover:text-text-primary'
              }`}
            >
              Tümü ({duyurular.length})
            </button>
            {kategoriler.map((k) => (
              <button
                key={k}
                onClick={() => { setActiveKat(k); setVisibleCount(15); }}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  activeKat === k
                    ? `${KATEGORI_RENK[k] ?? 'bg-zinc-500/20 text-zinc-400'} border border-current/30`
                    : 'bg-surface border border-border text-text-muted hover:text-text-primary'
                }`}
              >
                {k} ({duyurular.filter((d) => d.kategoriAdi === k).length})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface" />
          ))}
        </div>
      )}

      {/* Boş */}
      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <FileText className="mb-4 h-12 w-12 text-text-muted" />
          <p className="text-text-secondary">
            {duyurular.length === 0 ? 'KAP bildirimleri yüklenemiyor.' : 'Bu kriterlere uyan bildirim bulunamadı.'}
          </p>
          {duyurular.length === 0 && (
            <button
              onClick={() => void loadDuyurular()}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-white"
            >
              Tekrar Dene
            </button>
          )}
        </div>
      )}

      {/* Liste */}
      {!loading && visible.length > 0 && (
        <div className="space-y-2">
          {visible.map((d) => (
            <a
              key={d.id}
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:border-primary/40 hover:bg-surface-alt transition-all duration-150"
            >
              {/* Sol: kategori badge */}
              <span className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold ${KATEGORI_RENK[d.kategoriAdi] ?? 'bg-zinc-500/20 text-zinc-400'}`}>
                {d.kategoriAdi}
              </span>

              {/* Orta: içerik */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text-primary group-hover:text-primary transition-colors line-clamp-1">
                  {d.baslik}
                </p>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-muted">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="font-medium text-text-secondary">{d.sembol}</span>
                  <span>·</span>
                  <span className="line-clamp-1">{d.sirket}</span>
                </div>
              </div>

              {/* Sağ: zaman + link */}
              <div className="shrink-0 flex flex-col items-end gap-1 text-[11px] text-text-muted">
                <span>{zamanFarki(d.tarih)}</span>
                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Daha fazla */}
      {hasMore && (
        <button
          onClick={() => setVisibleCount((c) => c + 15)}
          className="mt-5 w-full flex items-center justify-center gap-2 rounded-xl border border-border bg-surface/50 py-3 text-sm text-text-secondary hover:text-text-primary hover:bg-surface transition-colors"
        >
          <ChevronDown className="h-4 w-4" />
          Daha fazla yükle ({filtered.length - visibleCount} bildirim kaldı)
        </button>
      )}

      {!loading && duyurular.length > 0 && (
        <p className="mt-6 text-center text-xs text-text-muted">
          Veriler kap.org.tr üzerinden alınmaktadır · 15 dakikada bir güncellenir
        </p>
      )}
    </div>
  );
}
