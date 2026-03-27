import Link from 'next/link';
import { TrendingUp, AlertTriangle } from 'lucide-react';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-20 mt-auto border-t border-border bg-background">
      {/* Yasal uyarı bandı — mobilde daha kompakt */}
      <div className="border-b border-border/60 bg-amber-500/5 px-4 py-2 sm:py-3">
        <div className="container mx-auto flex items-start gap-2 sm:gap-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400 sm:h-4 sm:w-4" />
          <p className="text-[11px] leading-snug text-text-muted sm:text-xs sm:leading-relaxed">
            <span className="font-semibold text-amber-400">Yasal Uyarı: </span>
            <span className="hidden sm:inline">
              BistAI yalnızca bilgilendirme amaçlıdır ve yatırım tavsiyesi niteliği taşımaz.
              Buradaki sinyaller, göstergeler ve analizler teknik veriye dayanır; kesin getiri
              veya kayıp garantisi verilmez. Yatırım kararlarınızı vermeden önce lisanslı bir
              yatırım danışmanına başvurmanız tavsiye edilir. Tüm yatırımlar risk içerir ve
              geçmiş performans gelecek sonuçların güvencesi değildir.
            </span>
            <span className="sm:hidden">
              BistAI yalnızca bilgilendirme amaçlıdır, yatırım tavsiyesi değildir.
              Tüm yatırımlar risk içerir.
            </span>
          </p>
        </div>
      </div>

      {/* Ana footer */}
      <div className="container mx-auto px-4 py-5 sm:py-8">
        {/* Mobil: 2 sütun kompakt — Desktop: 4 sütun orijinal */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">

          {/* Marka */}
          <div className="col-span-2 sm:col-span-2 lg:col-span-1">
            <Link href="/" className="mb-2 inline-flex items-center gap-1.5 sm:mb-3 sm:gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/20 sm:h-7 sm:w-7 sm:rounded-lg">
                <TrendingUp className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" />
              </div>
              <span className="text-sm font-bold text-text-primary">BistAI</span>
            </Link>
            <p className="text-[11px] leading-snug text-text-muted sm:text-xs sm:leading-relaxed">
              BIST hisselerinde yapay zeka destekli teknik analiz ve sinyal platformu.
            </p>
          </div>

          {/* Platform */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted sm:mb-3 sm:text-xs">Platform</p>
            <ul className="space-y-0.5 sm:space-y-2">
              {[
                { href: '/tarama',      label: 'Sinyal Tarama' },
                { href: '/sektorler',   label: 'Sektör Analizi' },
                { href: '/karsilastir', label: 'Hisse Karşılaştır' },
                { href: '/makro',       label: 'Makro Radar' },
                { href: '/backtesting', label: 'Backtesting' },
                { href: '/topluluk',    label: 'Topluluk' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-[11px] text-text-muted transition-colors hover:text-text-primary sm:text-xs">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Hesap + Yasal (mobilde birleşik, desktop'ta ayrı) */}
          <div className="flex flex-col gap-3 sm:gap-0">
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted sm:mb-3 sm:text-xs">Hesap</p>
              <ul className="space-y-0.5 sm:space-y-2">
                {[
                  { href: '/dashboard',  label: 'Dashboard' },
                  { href: '/portfolyo',  label: 'Portföyüm' },
                  { href: '/watchlist',  label: 'Watchlist' },
                  { href: '/profil',     label: 'Profil & Ayarlar' },
                ].map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="text-[11px] text-text-muted transition-colors hover:text-text-primary sm:text-xs">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Yasal — mobilde Hesap altında, desktop'ta ayrı sütun */}
            <div className="lg:hidden">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Yasal</p>
              <ul className="space-y-0.5">
                {[
                  { href: '/yasal',              label: 'Yasal Uyarı' },
                  { href: '/gizlilik',           label: 'Gizlilik Politikası' },
                  { href: '/kullanim-kosullari', label: 'Kullanım Koşulları' },
                ].map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="text-[11px] text-text-muted transition-colors hover:text-text-primary">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Yasal — sadece desktop (lg+) */}
          <div className="hidden lg:block">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Yasal</p>
            <ul className="space-y-2">
              {[
                { href: '/yasal',              label: 'Yasal Uyarı' },
                { href: '/gizlilik',           label: 'Gizlilik Politikası' },
                { href: '/kullanim-kosullari', label: 'Kullanım Koşulları' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-xs text-text-muted transition-colors hover:text-text-primary">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Alt çizgi */}
        <div className="mt-4 flex flex-col items-center justify-between gap-1 border-t border-border/60 pt-3 sm:mt-8 sm:flex-row sm:gap-2 sm:pt-6">
          <p className="text-[10px] text-text-muted sm:text-xs">
            © {year} BistAI. Tüm hakları saklıdır.
          </p>
          <p className="text-[10px] text-text-muted sm:text-xs">
            Fiyat verileri Yahoo Finance · 15 dk gecikmeli olabilir
          </p>
        </div>
      </div>
    </footer>
  );
}
