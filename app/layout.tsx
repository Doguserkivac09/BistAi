import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Toaster } from 'sonner';
import { PwaRegister } from '@/components/PwaRegister';
import { PwaInstallBanner } from '@/components/PwaInstallBanner';
import { OnboardingBanner } from '@/components/OnboardingBanner';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://investableedge.vercel.app';

export const viewport: Viewport = {
  themeColor: '#6366f1',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: 'Investable Edge — BIST Hisselerinde AI Destekli Sinyal Analizi',
    template: '%s | Investable Edge',
  },
  description: 'BIST hisselerini tarayın, teknik analiz sinyallerini ve yapay zeka açıklamalarını görün.',
  keywords: ['BIST', 'hisse senedi', 'teknik analiz', 'sinyal', 'yapay zeka', 'borsa istanbul', 'borsa', 'yatırım'],
  authors: [{ name: 'Investable Edge' }],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Investable Edge',
    startupImage: '/icons/apple-touch-icon.png',
  },
  icons: {
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'Investable Edge',
    title: 'Investable Edge — BIST Hisselerinde AI Destekli Sinyal Analizi',
    description: 'BIST hisselerini tarayın, teknik analiz sinyallerini ve yapay zeka açıklamalarını görün.',
    url: BASE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Investable Edge — BIST Hisselerinde AI Destekli Sinyal Analizi',
    description: 'BIST hisselerini tarayın, teknik analiz sinyallerini ve yapay zeka açıklamalarını görün.',
  },
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={`${inter.variable} antialiased min-h-screen bg-background text-text-primary flex flex-col`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: 'Investable Edge',
              url: BASE_URL,
              description: 'BIST hisse senetleri için AI destekli teknik analiz ve sinyal tarama platformu.',
              applicationCategory: 'FinanceApplication',
              operatingSystem: 'Web',
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'TRY' },
              inLanguage: 'tr',
            }),
          }}
        />
        <PwaRegister />
        <PwaInstallBanner />
        <OnboardingBanner />
        <Navbar />
        <div className="flex-1">
          {children}
        </div>
        <Footer />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: 'hsl(var(--surface))',
              border: '1px solid hsl(var(--border))',
              color: 'hsl(var(--text-primary))',
            },
          }}
          richColors
          closeButton
        />
        </body>
    </html>
  );
}
