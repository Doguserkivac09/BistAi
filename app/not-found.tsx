import Link from 'next/link';
import { Home, Search, TrendingUp } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center animate-fade-in-up">
        {/* 404 numarası */}
        <div className="relative mb-6">
          <span className="text-[120px] font-black leading-none text-primary/10 select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <TrendingUp className="h-16 w-16 text-primary" />
          </div>
        </div>

        {/* Mesaj */}
        <h1 className="mb-3 text-2xl font-bold text-text-primary">
          Sayfa Bulunamadı
        </h1>
        <p className="mb-8 text-text-secondary max-w-sm mx-auto">
          Aradığın sayfa taşınmış, silinmiş ya da hiç var olmamış olabilir.
          Hisse taramasına dönüp yeniden dene.
        </p>

        {/* Aksiyonlar */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white transition hover:bg-primary/90"
          >
            <Home className="h-4 w-4" />
            Ana Sayfa
          </Link>
          <Link
            href="/tarama"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-text-primary transition hover:bg-surface"
          >
            <Search className="h-4 w-4" />
            Hisse Tara
          </Link>
        </div>
      </div>
    </div>
  );
}
