'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[BistAI Error]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <AlertTriangle className="mb-4 h-12 w-12 text-bearish" />
      <h2 className="mb-2 text-xl font-semibold text-text-primary">Bir şeyler ters gitti</h2>
      <p className="mb-6 max-w-md text-sm text-text-secondary">
        Sayfa yüklenirken bir hata oluştu. Lütfen tekrar deneyin.
      </p>
      <Button onClick={reset} variant="outline">
        Tekrar Dene
      </Button>
    </div>
  );
}
