'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function HisseError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error('[HisseError]', error); }, [error]);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center max-w-sm">
        <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-amber-400" />
        <h1 className="mb-2 text-xl font-bold text-text-primary">Hisse Yüklenemedi</h1>
        <p className="mb-6 text-sm text-text-secondary">
          Yahoo Finance veya veri kaynağında geçici bir sorun olabilir. Birkaç saniye bekleyip tekrar dene.
        </p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition">
            <RefreshCw className="h-3.5 w-3.5" /> Tekrar Dene
          </button>
          <Link href="/tarama" className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition">
            <ArrowLeft className="h-3.5 w-3.5" /> Taramaya Dön
          </Link>
        </div>
      </div>
    </div>
  );
}
