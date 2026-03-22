'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Hataları production'da bir servise loglayabilirsiniz
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center max-w-md"
      >
        <div className="mb-6 flex justify-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10">
            <AlertTriangle className="h-10 w-10 text-red-400" />
          </div>
        </div>

        <h1 className="mb-3 text-2xl font-bold text-text-primary">
          Beklenmedik Bir Hata Oluştu
        </h1>
        <p className="mb-8 text-text-secondary">
          Bir şeyler ters gitti. Sayfayı yenilemek sorunu çözebilir.
          Sorun devam ederse daha sonra tekrar dene.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" />
            Tekrar Dene
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-text-primary transition hover:bg-surface"
          >
            <Home className="h-4 w-4" />
            Ana Sayfa
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
