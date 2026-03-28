'use client';

/**
 * KAP Duyuruları Sayfası
 *
 * Kamuyu Aydınlatma Platformu'ndan gelen resmi şirket bildirimlerini gösterir.
 * Arama, kategori ve şirket filtresi desteklenir.
 *
 * Step 8 — Sonnet kısmı (veri + UI; AI özetleme Opus bekliyor)
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { FileText, RefreshCw, ExternalLink, Search, Clock, Building2, Tag } from 'lucide-react';
import type { KapDuyuru } from '@/lib/kap';

// ─── Kategori badge renkleri ──────────────────────────────────────────────────

const KATEGORI_RENK: Record<string, string> = {
  'Özel Durum':      'bg-amber-500/15 text-amber-400 border-amber-500/30',
  'Finansal Rapor':  'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  'Finansal Tablo':  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Genel Kurul':     'bg-violet-500/15 text-violet-400 border-violet-500/30',
  'BDDK':            'bg-red-500/15 text-red-400 border-red-500/30',
  'SPK Bildirimi':   'bg-orange-500/15 text-orange-400 border-orange-500/30',
  'İhraç':           'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

function kategoriRenk(adi: string) {
  return KATEGORI_RENK[adi] ?? 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30';
}

// ─── Zaman farkı ─────────────────────────────────────────────────────────────

function zamanFarki(tarih: string): string {
  if (!tarih) return '';
  try {
    const d    = new Date(tarih);
    const diff = Date.now() - d.getTime();
    const dk   = Math.floor(diff / 60000);
    if (dk < 1)  return 'Az önce';
    if (dk < 60) return `${dk}dk önce`;
    const sa = Math.floor(dk / 60);
    if (sa < 24) return `${sa}sa önce`;
    const gun = Math.floor(sa / 24);
    return `${gun}g önce`;
  } catch { return ''; }
}

function formatTarih(tarih: string): string {
  if (!tarih) return '';
  try {
    return new Date(tarih).toLocaleDateString('tr-TR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return tarih; }
}

// ─── Duyuru Kartı ─────────────────────────────────────────────────────────────

function DuyuruKart({ d }: { d: KapDuyuru }) {
  const renkCls = kategoriRenk(d.kategoriAdi);
  return (
    <a
      href={d.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary/40 hover:bg-surface-alt/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {d.sembol && (
              <Link
                href={`/hisse/${d.sembol}`}
                onClick={(e) => e.stopPropagation()}
                className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary hover:bg-primary/20 transition-colors"
              >
                {d.sembol}
              </Link>
            )}
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${renkCls}`}>
              {d.kategoriAdi}
            </span>
          </div>
          <p className="text-sm font-medium text-text-primary leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {d.baslik || 'Başlık yok'}
          </p>
          {d.sirket && (
            <p className="mt-1 text-xs text-text-secondary truncate">
              <Building2 className="inline h-3 w-3 mr-0.5 opacity-60" />
              {d.sirket}
            </p>
          )}
        </div>
        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity mt-0.5" />
      </div>
      <div className="flex items-center gap-1 text-[11px] text-text-muted">
        <Clock className="h-3 w-3" />
        <span title={formatTarih(d.tarih)}>{zamanFarki(d.tarih) || formatTarih(d.tarih)}</span>
      </div>
    </a>
  );
}

// ─── Ana Sayfa ────────────────────────────────────────────────────────────────

const SAYFA_BOYUTU = 20;

export default function KapPage() {
  const [duyurular, setDuyurular]   = useState<KapDuyuru[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [arama, setArama]           = useState('');
  const [seciliKat, setSeciliKat]   = useState('');
  const [sayfaNo, setSayfaNo]       = useState(1);
  const [son, setSon]               = useState('');

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/kap');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Veri alınamadı');
      setDuyurular(data.duyurular ?? []);
      setSon(new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata oluştu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filtrele
  const filtered = useMemo(() => {
    let list = duyurular;
    if (arama.trim()) {
      const q = arama.toLowerCase();
      list = list.filter(d =>
        d.baslik.toLowerCase().includes(q) ||
        d.sirket.toLowerCase().includes(q) ||
        d.sembol.toLowerCase().includes(q)
      );
    }
    if (seciliKat) list = list.filter(d => d.kategoriAdi === seciliKat);
    return list;
  }, [duyurular, arama, seciliKat]);

  const kategoriler = useMemo(() => {
    const set = new Set(duyurular.map(d => d.kategoriAdi).filter(Boolean));
    return Array.from(set).sort();
  }, [duyurular]);

  const sayfadakiler = filtered.slice(0, sayfaNo * SAYFA_BOYUTU);
  const dahaVar      = sayfadakiler.length < filtered.length;

  // Filtre değişince sayfayı sıfırla
  useEffect(() => { setSayfaNo(1); }, [arama, seciliKat]);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold text-text-primary">KAP Duyuruları</h1>
            </div>
            <p className="text-sm text-text-secondary">
              Kamuyu Aydınlatma Platformu — resmi şirket bildirimleri
              {son && <span className="ml-2 text-xs text-text-muted">Son güncelleme: {son}</span>}
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="mt-3 flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:border-text-muted transition-colors disabled:opacity-50 sm:mt-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

        {/* Filtreler */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          {/* Arama */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Şirket, sembol veya konu ara…"
              value={arama}
              onChange={e => setArama(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface pl-8 pr-3 py-2 text-sm text-text-primary placeholder-text-muted/50 focus:border-primary focus:outline-none"
            />
          </div>
          {/* Kategori filtresi */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setSeciliKat('')}
              className={`flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                !seciliKat ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-text-secondary hover:border-primary/30'
              }`}
            >
              <Tag className="h-3 w-3" /> Tümü
            </button>
            {kategoriler.map(k => (
              <button
                key={k}
                onClick={() => setSeciliKat(k === seciliKat ? '' : k)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  seciliKat === k
                    ? kategoriRenk(k) + ' ' + 'border-current/50'
                    : 'border-border text-text-secondary hover:border-primary/30'
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        {/* İçerik */}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-surface" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 py-12 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <p className="text-xs text-text-muted">KAP API geçici olarak erişilemez olabilir.</p>
            <button
              onClick={() => load()}
              className="mt-1 rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:border-primary/40 transition-colors"
            >
              Tekrar Dene
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface py-12 text-center">
            <FileText className="h-8 w-8 text-text-muted" />
            <p className="text-sm text-text-secondary">
              {arama || seciliKat ? 'Arama kriterlerine uygun duyuru bulunamadı.' : 'Şu an duyuru yok.'}
            </p>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between text-xs text-text-muted">
              <span>{filtered.length} duyuru</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {sayfadakiler.map(d => (
                <DuyuruKart key={d.id} d={d} />
              ))}
            </div>

            {dahaVar && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setSayfaNo(n => n + 1)}
                  className="rounded-lg border border-border px-6 py-2.5 text-sm text-text-secondary hover:border-primary/40 transition-colors"
                >
                  Daha Fazla Göster ({filtered.length - sayfadakiler.length} kaldı)
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
