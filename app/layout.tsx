import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { Toaster } from 'sonner';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'BistAI — BIST Hisselerinde AI Destekli Sinyal Analizi',
  description: 'BIST hisselerini tarayın, teknik analiz sinyallerini ve yapay zeka açıklamalarını görün.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className={`${inter.variable} antialiased min-h-screen bg-background text-text-primary`}>
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
