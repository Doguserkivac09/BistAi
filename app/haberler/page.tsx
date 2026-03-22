'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Newspaper, RefreshCw, ExternalLink, TrendingUp, Clock } from 'lucide-react';
import type { HaberItem } from '@/app/api/haber/route';

const KAYNAK_RENK: Record<string, string> = {
  'NTV Ekonomi':       'bg-blue-500/20 text-blue-400',
  'Sabah Ekonomi':     'bg-orange-500/20 text-orange-400',
  'Hürriyet Ekonomi':  'bg-red-500/20 text-red-400',
  'Habertürk Ekonomi': 'bg-purple-500/20 text-purple-400',
  'Haber7 Ekonomi':    'bg-emerald-500/20 text-emerald-400',
};

function zamanFarki(tarihStr: string): string {
  if (!tarihStr) return '';
  const tarih = new Date(tarihStr);
  const simdi = new Date();
  const dk = Math.floor((simdi.getTime() - tarih.getTime()) / 60000);
  if (dk < 1)   return 'Az önce';
  if (dk < 60)  return `${dk} dakika önce`;
  if (dk < 1440) return `${Math.floor(dk / 60)} saat önce`;
  return tarih.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
}

export default function HaberlerPage() {
  const [haberler, setHaberler] = useState<HaberItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sonGuncelleme, setSonGuncelleme] = useState<Date | null>(null);

  async function loadHaberler(silent = false) {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/haber');
      if (!res.ok) return;
      const data = await res.json();
      setHaberler(data.haberler ?? []);
      setSonGuncelleme(new Date());
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadHaberler(); }, []);

  const onceCikanlar = haberler.slice(0, 3);
  const digerler = haberler.slice(3);

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-4xl">

        {/* Başlık */}
        <div className="mb-8 flex items-center justify-between">
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
            onClick={() => loadHaberler(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-text-secondary hover:border-primary/40 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Yenile
          </button>
        </div>

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
          <AnimatePresence>
            {haberler.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-24 text-center"
              >
                <Newspaper className="mb-4 h-12 w-12 text-text-muted" />
                <p className="text-text-secondary">Şu an haber yüklenemiyor.</p>
                <button
                  onClick={() => loadHaberler()}
                  className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm text-white"
                >
                  Tekrar Dene
                </button>
              </motion.div>
            ) : (
              <div>
                {/* Öne çıkan 3 haber — büyük kartlar */}
                <div className="mb-6 grid gap-4 md:grid-cols-3">
                  {onceCikanlar.map((haber, i) => (
                    <motion.a
                      key={i}
                      href={haber.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="group flex flex-col rounded-xl border border-border bg-surface p-4 hover:border-primary/50 hover:bg-surface-alt transition-all duration-200 hover:shadow-lg hover:shadow-primary/5"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${KAYNAK_RENK[haber.kaynak] ?? 'bg-zinc-500/20 text-zinc-400'}`}>
                          {haber.kaynak}
                        </span>
                        {i === 0 && (
                          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                            <TrendingUp className="h-3 w-3" />
                            Öne Çıkan
                          </span>
                        )}
                      </div>
                      <p className="flex-1 text-sm font-medium leading-snug text-text-primary group-hover:text-primary transition-colors line-clamp-3">
                        {haber.baslik}
                      </p>
                      <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {zamanFarki(haber.tarih)}
                        </span>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </motion.a>
                  ))}
                </div>

                {/* Diğer haberler — liste */}
                <div className="space-y-2">
                  {digerler.map((haber, i) => (
                    <motion.a
                      key={i + 3}
                      href={haber.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.24 + i * 0.05 }}
                      className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:border-primary/40 hover:bg-surface-alt transition-all duration-150"
                    >
                      <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${KAYNAK_RENK[haber.kaynak] ?? 'bg-zinc-500/20 text-zinc-400'}`}>
                        {haber.kaynak?.replace(' Ekonomi', '')}
                      </span>
                      <p className="flex-1 text-sm text-text-primary group-hover:text-primary transition-colors line-clamp-1">
                        {haber.baslik}
                      </p>
                      <div className="shrink-0 flex items-center gap-2 text-xs text-text-muted">
                        <span>{zamanFarki(haber.tarih)}</span>
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </motion.a>
                  ))}
                </div>

                <p className="mt-6 text-center text-xs text-text-muted">
                  Haberler NTV, Sabah, Hürriyet ve Habertürk'ten derlenmektedir · 15 dk'da bir güncellenir
                </p>
              </div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
