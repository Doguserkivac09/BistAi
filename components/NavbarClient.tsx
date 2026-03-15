'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Ana Sayfa' },
  { href: '/tarama', label: 'Tarama' },
  { href: '/makro', label: 'Makro Radar' },
  { href: '/backtesting', label: 'Backtest' },
  { href: '/dashboard', label: 'Dashboard' },
];

interface NavbarClientProps {
  user: { id: string; email: string | null } | null;
}

export function NavbarClient({ user }: NavbarClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-text-primary">
          <span className="text-primary">Bist</span>
          <span>AI</span>
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Ana navigasyon" className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'text-sm font-medium transition-colors hover:text-primary',
                pathname === item.href ? 'text-primary' : 'text-text-secondary'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {/* Desktop auth buttons */}
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <>
                {user.email && (
                  <span className="text-sm text-text-secondary">{user.email}</span>
                )}
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/dashboard">Dashboard</Link>
                </Button>
                <form action="/auth/logout" method="post">
                  <Button variant="outline" size="sm" type="submit">
                    Çıkış Yap
                  </Button>
                </form>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/giris">Giriş Yap</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/kayit">Ücretsiz Başla</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="inline-flex items-center justify-center rounded-md p-2 text-text-secondary hover:text-text-primary md:hidden"
            aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç'}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        role="region"
        aria-label="Mobil menü"
        aria-hidden={!mobileOpen}
        className={cn(
          'overflow-hidden border-t border-border transition-all duration-200 ease-in-out md:hidden',
          mobileOpen ? 'max-h-80' : 'max-h-0 border-t-0'
        )}
      >
        <nav aria-label="Mobil navigasyon" className="container mx-auto flex flex-col gap-1 px-4 py-3">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname === item.href
                  ? 'bg-primary/10 text-primary'
                  : 'text-text-secondary hover:bg-surface hover:text-text-primary'
              )}
            >
              {item.label}
            </Link>
          ))}
          <div className="mt-2 border-t border-border pt-3">
            {user ? (
              <div className="flex flex-col gap-2">
                {user.email && (
                  <span className="px-3 text-xs text-text-secondary">{user.email}</span>
                )}
                <form action="/auth/logout" method="post">
                  <Button variant="outline" size="sm" className="w-full" type="submit">
                    Çıkış Yap
                  </Button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Button variant="ghost" size="sm" className="w-full" asChild>
                  <Link href="/giris">Giriş Yap</Link>
                </Button>
                <Button size="sm" className="w-full" asChild>
                  <Link href="/kayit">Ücretsiz Başla</Link>
                </Button>
              </div>
            )}
          </div>
        </nav>
      </div>
    </>
  );
}
