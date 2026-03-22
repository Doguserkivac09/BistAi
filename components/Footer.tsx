import Link from 'next/link';
import { TrendingUp, AlertTriangle } from 'lucide-react';

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-border bg-surface/40">
      {/* Yasal uyarı bandı */}
      <div className="border-b border-border/60 bg-amber-500/5 px-4 py-3">
        <div className="container mx-auto flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-text-muted">
            <span className="font-semibold text-amber-400">Yasal Uyarı: </span>
            BistAI yalnızca bilgilendirme amaçlıdır ve yatırım tavsiyesi niteliği taşımaz.
            Buradaki sinyaller, göstergeler ve analizler teknik veriye dayanır; kesin getiri
            veya kayıp garantisi verilmez. Yatırım kararlarınızı vermeden önce lisanslı bir
            yatırım danışmanına başvurmanız tavsiye edilir. Tüm yatırımlar risk içerir ve
            geçmiş performans gelecek sonuçların güvencesi değildir.
          </p>
        </div>
      </div>

      {/* Ana footer */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">

          {/* Marka */}
          <div className="col-span-1 sm:col-span-2 lg:col-span-1">
            <Link href="/" className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20">
                <TrendingUp className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-bold text-text-primary">BistAI</span>
            </Link>
            <p className="text-xs leading-relaxed text-text-muted">
              BIST hisselerinde yapay zeka destekli teknik analiz ve sinyal platformu.
            </p>
          </div>

          {/* Platform */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Platform</p>
            <ul className="space-y-2">
              {[
                { href: '/tarama',      label: 'Sinyal Tarama' },
                { href: '/karsilastir', label: 'Hisse Karşılaştır' },
                { href: '/makro',       label: 'Makro Radar' },
                { href: '/backtesting', label: 'Backtesting' },
                { href: '/topluluk',    label: 'Topluluk' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-xs text-text-muted transition-colors hover:text-text-primary">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Hesap */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Hesap</p>
            <ul className="space-y-2">
              {[
                { href: '/dashboard',  label: 'Dashboard' },
                { href: '/portfolyo',  label: 'Portföyüm' },
                { href: '/watchlist',  label: 'Watchlist' },
                { href: '/profil',     label: 'Profil & Ayarlar' },
              ].map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className="text-xs text-text-muted transition-colors hover:text-text-primary">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Yasal */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Yasal</p>
            <ul className="space-y-2">
              {[
                { href: '/yasal',                label: 'Yasal Uyarı' },
                { href: '/gizlilik',             label: 'Gizlilik Politikası' },
                { href: '/kullanim-kosullari',   label: 'Kullanım Koşulları' },
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
        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-border/60 pt-6 sm:flex-row">
          <p className="text-xs text-text-muted">
            © {year} BistAI. Tüm hakları saklıdır.
          </p>
          <p className="text-xs text-text-muted">
            Fiyat verileri Yahoo Finance · 15 dk gecikmeli olabilir
          </p>
        </div>
      </div>
    </footer>
  );
}
