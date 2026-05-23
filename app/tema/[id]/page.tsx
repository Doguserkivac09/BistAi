'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ArrowUp, ArrowDown, TrendingUp, TrendingDown } from 'lucide-react';
import { getThemeById } from '@/lib/theme-descriptions';
import { ALL_THEMES } from '@/lib/us-symbols';
import { Skeleton } from '@/components/ui/skeleton';

interface Stock {
  symbol: string;
  current_price: number;
  pct_1d: number;
  pct_1h: number;
  pct_1m: number;
}

interface NewsItem {
  title: string;
  description: string;
  link: string;
  source: string;
  pubDate: string;
  symbol?: string;
}

interface PerformanceData {
  theme: string;
  stocks: Stock[];
  topGainers: Stock[];
  topLosers: Stock[];
  themeAverage: {
    avg_1d: number;
    avg_1h: number;
    avg_1m: number;
  };
}

interface NewsData {
  news: NewsItem[];
}

export default function ThemePage() {
  const params = useParams();
  const themeId = params.id as string;

  const [themeDesc, setThemeDesc] = useState<ReturnType<typeof getThemeById> | undefined>(
    undefined
  );
  const [perfData, setPerfData] = useState<PerformanceData | null>(null);
  const [newsData, setNewsData] = useState<NewsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Validate theme
        if (!ALL_THEMES.includes(themeId as any)) {
          throw new Error('Invalid theme');
        }

        const theme = getThemeById(themeId);
        setThemeDesc(theme);

        // Load performance
        const perfRes = await fetch(`/api/tema-performans?tema=${themeId}`);
        if (perfRes.ok) {
          const perfData = await perfRes.json();
          setPerfData(perfData);
        }

        // Load news
        const newsRes = await fetch(`/api/tema-haberleri?tema=${themeId}`);
        if (newsRes.ok) {
          const newsData = await newsRes.json();
          setNewsData(newsData);
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [themeId]);

  if (loading || !themeDesc) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-6 lg:p-8">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-48 rounded-lg mb-6" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
          <Skeleton className="h-96 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-lg p-8 mb-8 border border-slate-600">
          <div className="flex items-start gap-6 mb-4">
            <span className="text-6xl">{themeDesc.emoji}</span>
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">
                {themeDesc.title}
              </h1>
              <p className="text-slate-300 text-lg">
                {themeDesc.shortDescription}
              </p>
            </div>
          </div>

          {/* Performance Row */}
          {perfData && (
            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-600">
              <div>
                <p className="text-slate-400 text-sm mb-1">1 Günlük</p>
                <p
                  className={`text-2xl font-bold ${
                    perfData.themeAverage.avg_1d >= 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}
                >
                  {perfData.themeAverage.avg_1d >= 0 ? '+' : ''}
                  {perfData.themeAverage.avg_1d.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-1">1 Saatlik</p>
                <p
                  className={`text-2xl font-bold ${
                    perfData.themeAverage.avg_1h >= 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}
                >
                  {perfData.themeAverage.avg_1h >= 0 ? '+' : ''}
                  {perfData.themeAverage.avg_1h.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-slate-400 text-sm mb-1">1 Aylık</p>
                <p
                  className={`text-2xl font-bold ${
                    perfData.themeAverage.avg_1m >= 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}
                >
                  {perfData.themeAverage.avg_1m >= 0 ? '+' : ''}
                  {perfData.themeAverage.avg_1m.toFixed(2)}%
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Top Gainers & Losers */}
        {perfData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Top Gainers */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="text-green-400" />
                <h2 className="text-xl font-bold text-white">
                  En Yüksek Yükselen
                </h2>
              </div>
              <div className="space-y-3">
                {perfData.topGainers.map((stock) => (
                  <div
                    key={stock.symbol}
                    className="flex items-center justify-between p-3 bg-slate-900/50 rounded border border-slate-700"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {stock.symbol}
                      </p>
                      <p className="text-xs text-slate-400">
                        ${stock.current_price.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-400">
                        +{stock.pct_1d.toFixed(2)}%
                      </p>
                      <p className="text-xs text-slate-400">
                        {stock.pct_1h >= 0 ? '+' : ''}
                        {stock.pct_1h.toFixed(2)}% (1h)
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Losers */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="text-red-400" />
                <h2 className="text-xl font-bold text-white">
                  En Yüksek Düşen
                </h2>
              </div>
              <div className="space-y-3">
                {perfData.topLosers.map((stock) => (
                  <div
                    key={stock.symbol}
                    className="flex items-center justify-between p-3 bg-slate-900/50 rounded border border-slate-700"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {stock.symbol}
                      </p>
                      <p className="text-xs text-slate-400">
                        ${stock.current_price.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-400">
                        {stock.pct_1d.toFixed(2)}%
                      </p>
                      <p className="text-xs text-slate-400">
                        {stock.pct_1h >= 0 ? '+' : ''}
                        {stock.pct_1h.toFixed(2)}% (1h)
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* All Stocks Table */}
        {perfData && perfData.stocks.length > 0 && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">
              Tüm Hisseler ({perfData.stocks.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-600">
                  <tr>
                    <th className="text-left py-2 px-3 text-slate-400 font-semibold">
                      Sembol
                    </th>
                    <th className="text-right py-2 px-3 text-slate-400 font-semibold">
                      Fiyat
                    </th>
                    <th className="text-right py-2 px-3 text-slate-400 font-semibold">
                      1 Gün %
                    </th>
                    <th className="text-right py-2 px-3 text-slate-400 font-semibold">
                      1 Saat %
                    </th>
                    <th className="text-right py-2 px-3 text-slate-400 font-semibold">
                      1 Ay %
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {perfData.stocks.map((stock) => (
                    <tr
                      key={stock.symbol}
                      className="hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-3 px-3 font-semibold text-white">
                        {stock.symbol}
                      </td>
                      <td className="py-3 px-3 text-right text-slate-300">
                        ${stock.current_price.toFixed(2)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-semibold ${
                          stock.pct_1d >= 0
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        {stock.pct_1d >= 0 ? '+' : ''}
                        {stock.pct_1d.toFixed(2)}%
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-semibold ${
                          stock.pct_1h >= 0
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        {stock.pct_1h >= 0 ? '+' : ''}
                        {stock.pct_1h.toFixed(2)}%
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-semibold ${
                          stock.pct_1m >= 0
                            ? 'text-green-400'
                            : 'text-red-400'
                        }`}
                      >
                        {stock.pct_1m >= 0 ? '+' : ''}
                        {stock.pct_1m.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* News Section */}
        {newsData && newsData.news.length > 0 && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">Son Haberler</h2>
            <div className="space-y-4">
              {newsData.news.slice(0, 5).map((news, idx) => (
                <a
                  key={idx}
                  href={news.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-4 bg-slate-900/50 rounded border border-slate-700 hover:border-blue-500 hover:bg-slate-900/80 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors line-clamp-2 flex-1">
                      {news.title}
                    </h3>
                    {news.symbol && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded whitespace-nowrap">
                        {news.symbol}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 line-clamp-1 mb-2">
                    {news.description}
                  </p>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{news.source}</span>
                    <span>
                      {new Date(news.pubDate).toLocaleDateString('tr-TR')}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Long Description */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Tema Açıklaması</h2>
          <p className="text-slate-300 leading-relaxed">
            {themeDesc.longDescription}
          </p>
        </div>
      </div>
    </div>
  );
}
