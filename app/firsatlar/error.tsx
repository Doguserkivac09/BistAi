'use client';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error('[firsatlarError]', error); }, [error]);
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center px-4">
      <AlertTriangle className="mb-3 h-10 w-10 text-amber-400" />
      <h2 className="mb-2 text-lg font-bold text-text-primary">Bir Hata Oluştu</h2>
      <p className="mb-4 text-sm text-text-secondary text-center max-w-xs">
        Veri yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.
      </p>
      <button onClick={reset} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition">
        <RefreshCw className="h-3.5 w-3.5" /> Tekrar Dene
      </button>
    </div>
  );
}
