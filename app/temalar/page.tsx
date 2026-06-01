'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { getAllThemes } from '@/lib/theme-descriptions';
import { Skeleton } from '@/components/ui/skeleton';

interface ThemeCard {
  id: string;
  emoji: string;
  title: string;
  perf1d: number;
  topStock: string;
  topStockPerf: number;
  stockCount: number;
  latestNews: string;
}

export default function TemasPage() {
  const [themes, setThemes] = useState<ThemeCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadThemes = async () => {
      try {
        const themeDescs = getAllThemes();
        const cards: ThemeCard[] = [];

        for (const theme of themeDescs) {
          try {
            // Fetch performance data
            const perfRes = await fetch(`/api/tema-performans?tema=${theme.id}`);
            let perfData = null;
            if (perfRes.ok) {
              perfData = await perfRes.json();
            }

            // Fetch news data
            const newsRes = await fetch(`/api/tema-haberleri?tema=${theme.id}`);
            let newsData = null;
            if (newsRes.ok) {
              newsData = await newsRes.json();
            }

            const topStock = perfData?.topGainers?.[0];
            const latestNews = newsData?.news?.[0];

            cards.push({
              id: theme.id,
              emoji: theme.emoji,
              title: theme.title,
              perf1d: perfData?.themeAverage?.avg_1d ?? 0,
              topStock: topStock?.symbol ?? '—',
              topStockPerf: topStock?.pct_1d ?? 0,
              stockCount: perfData?.stockCount ?? 0,
              latestNews: latestNews?.title ?? 'Haber yok',
            });
          } catch (err) {
            console.error(`Error loading theme ${theme.id}:`, err);
            cards.push({
              id: theme.id,
              emoji: theme.emoji,
              title: theme.title,
              perf1d: 0,
              topStock: '—',
              topStockPerf: 0,
              stockCount: 0,
              latestNews: 'Haber yok',
            });
          }
        }

        setThemes(cards);
      } catch (error) {
        console.error('Error loading themes:', error);
      } finally {
        setLoading(false);
      }
    };

    loadThemes();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">Temalar</h1>
            <p className="text-slate-400">Tematik yatırım fırsatları</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Temalar</h1>
          <p className="text-slate-400">
            US Borsası'nın en güçlü tematik alanları
          </p>
        </div>

        {/* Theme Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {themes.map((theme) => (
            <Link
              key={theme.id}
              href={`/tema/${theme.id}`}
              className="group"
            >
              <div className="h-full bg-slate-800/50 border border-slate-700 rounded-lg p-6 hover:border-blue-500 hover:bg-slate-800/80 transition-all duration-200 cursor-pointer">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{theme.emoji}</span>
                    <div>
                      <h3 className="text-lg font-semibold text-white group-hover:text-blue-400 transition-colors">
                        {theme.title}
                      </h3>
                      <p className="text-sm text-slate-400">
                        {theme.stockCount} hisse
                      </p>
                    </div>
                  </div>

                  {/* 1D Performance Badge */}
                  <div
                    className={`flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${
                      theme.perf1d >= 0
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {theme.perf1d >= 0 ? (
                      <ArrowUp size={14} />
                    ) : (
                      <ArrowDown size={14} />
                    )}
                    {Math.abs(theme.perf1d).toFixed(2)}%
                  </div>
                </div>

                {/* Top Stock */}
                <div className="mb-4 p-3 bg-slate-900/50 rounded border border-slate-700">
                  <p className="text-xs text-slate-400 mb-1">En Yüksek Gainer</p>
                  <div className="flex items-center justify-between">
                    <p className="text-white font-medium">{theme.topStock}</p>
                    <span
                      className={`text-sm font-semibold ${
                        theme.topStockPerf >= 0
                          ? 'text-green-400'
                          : 'text-red-400'
                      }`}
                    >
                      {theme.topStockPerf >= 0 ? '+' : ''}
                      {theme.topStockPerf.toFixed(2)}%
                    </span>
                  </div>
                </div>

                {/* Latest News */}
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded">
                  <p className="text-xs text-blue-400 mb-1">Son Haber</p>
                  <p className="text-sm text-white line-clamp-2">
                    {theme.latestNews}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
