/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
    optimizePackageImports: ['lucide-react', 'recharts', 'framer-motion'],
    serverComponentsExternalPackages: ['yahoo-finance2'],
  },
  async headers() {
    return [
      {
        source: '/api/explain',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/api/signal-performance',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
      {
        source: '/api/ohlcv',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=60, stale-while-revalidate=300' }],
      },
      {
        source: '/api/haber',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=600' }],
      },
      {
        source: '/api/macro',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=600' }],
      },
      {
        source: '/api/sectors',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=600' }],
      },
      {
        source: '/api/risk',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=600' }],
      },
      {
        source: '/api/signal-stats',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=600' }],
      },
      {
        source: '/api/backtesting',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=600' }],
      },
      {
        source: '/api/alerts',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=30, stale-while-revalidate=60' }],
      },
    ];
  },
};

export default nextConfig;
