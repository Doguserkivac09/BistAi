import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <SearchX className="mb-4 h-12 w-12 text-text-secondary" />
      <h2 className="mb-2 text-xl font-semibold text-text-primary">Sayfa Bulunamadı</h2>
      <p className="mb-6 text-sm text-text-secondary">
        Aradığınız sayfa mevcut değil veya taşınmış olabilir.
      </p>
      <Button asChild>
        <Link href="/">Ana Sayfaya Dön</Link>
      </Button>
    </div>
  );
}
