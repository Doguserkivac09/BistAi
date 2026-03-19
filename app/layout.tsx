import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: {
    default: 'BistAI — BIST Hisselerinde AI Destekli Sinyal Analizi',
    template: '%s | BistAI',
  },
  description: 'BIST hisselerini tarayın, teknik analiz sinyallerini ve yapay zeka açıklamalarını görün.',
  keywords: ['BIST', 'hisse senedi', 'teknik analiz', 'sinyal', 'yapay zeka', 'borsa istanbul'],
  authors: [{ name: 'BistAI' }],
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'BistAI',
    title: 'BistAI — BIST Hisselerinde AI Destekli Sinyal Analizi',
    description: 'BIST hisselerini tarayın, teknik analiz sinyallerini ve yapay zeka açıklamalarını görün.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased min-h-screen bg-background text-text-primary">
        <Navbar />
        {children}
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
