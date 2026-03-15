'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, User, LogOut, LayoutDashboard, ChevronDown, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Ana Sayfa' },
  { href: '/tarama', label: 'Tarama' },
  { href: '/makro', label: 'Makro Radar' },
  { href: '/backtesting', label: 'Backtest' },
  { href: '/topluluk', label: 'Topluluk' },
  { href: '/dashboard', label: 'Dashboard' },
];

interface NavbarClientProps {
  user: { id: string; email: string | null } | null;
}

function UserAvatar({ email }: { email: string | null }) {
  const initial = email ? email[0].toUpperCase() : 'U';
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
      {initial}
    </div>
  );
}

export function NavbarClient({ user }: NavbarClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const pathname = usePathname();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close menus on route change
  useEffect(() => {
    setMobileOpen(false);
    setDropdownOpen(false);
  }, [pathname]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [dropdownOpen]);

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
          {/* Desktop auth */}
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                >
                  <UserAvatar email={user.email} />
                  <span className="max-w-[120px] truncate text-xs">
                    {user.email?.split('@')[0] ?? 'Hesap'}
                  </span>
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', dropdownOpen && 'rotate-180')} />
                </button>

                {/* Dropdown menu */}
                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 rounded-lg border border-border bg-surface shadow-lg z-50">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-xs text-text-secondary truncate">{user.email}</p>
                    </div>
                    <div className="py-1">
                      <Link
                        href="/profil"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
                      >
                        <User className="h-4 w-4" />
                        Profilim
                      </Link>
                      <Link
                        href="/dashboard"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
                      >
                        <LayoutDashboard className="h-4 w-4" />
                        Dashboard
                      </Link>
                      <Link
                        href="/topluluk"
                        className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
                      >
                        <Users className="h-4 w-4" />
                        Topluluk
                      </Link>
                    </div>
                    <div className="border-t border-border py-1">
                      <form action="/auth/logout" method="post">
                        <button
                          type="submit"
                          className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/5 transition-colors"
                        >
                          <LogOut className="h-4 w-4" />
                          Çıkış Yap
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
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
          mobileOpen ? 'max-h-96' : 'max-h-0 border-t-0'
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
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <UserAvatar email={user.email} />
                  <span className="text-xs text-text-secondary truncate">{user.email}</span>
                </div>
                <Link
                  href="/profil"
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    pathname === '/profil'
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                  )}
                >
                  Profilim
                </Link>
                <form action="/auth/logout" method="post" className="mt-1">
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
