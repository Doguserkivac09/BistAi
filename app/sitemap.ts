import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://bistai.vercel.app';

// Taranabilir hisse sembolleri (sadece öne çıkanlar)
const FEATURED_SYMBOLS = [
  'THYAO', 'GARAN', 'ASELS', 'KCHOL', 'SISE',
  'EREGL', 'BIMAS', 'AKBNK', 'TUPRS', 'FROTO',
  'SAHOL', 'PETKM', 'KOZAL', 'TCELL', 'YKBNK',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  // Statik sayfalar
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/tarama`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/makro`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/haberler`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/backtesting`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/topluluk`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/fiyatlandirma`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/giris`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/kayit`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ];

  // Öne çıkan hisse detay sayfaları
  const stockRoutes: MetadataRoute.Sitemap = FEATURED_SYMBOLS.map((sembol) => ({
    url: `${BASE_URL}/hisse/${sembol}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...stockRoutes];
}
