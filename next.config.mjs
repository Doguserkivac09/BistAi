/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '1mb',
    },
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
    ];
  },
};

export default nextConfig;
