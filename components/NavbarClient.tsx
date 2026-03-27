'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Menu, X, User, LogOut, LayoutDashboard, ChevronDown, Users,
  Briefcase, Star, Newspaper, BarChart2, GitCompare, TrendingUp, Calculator,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─── Nav yapısı ───────────────────────────────────────────────────────────────

const navItems = [
  { href: '/', label: 'Ana Sayfa' },
  { href: '/tarama', label: 'Tarama' },
  {
    label: 'Portföy',
    dropdown: [
      { href: '/portfolyo',   label: 'Portföyüm',    icon: Briefcase },
      { href: '/watchlist',   label: 'Watchlist',     icon: Star },
      { href: '/karsilastir', label: 'Karşılaştır',  icon: GitCompare },
    ],
  },
  {
    label: 'Piyasa',
    dropdown: [
      { href: '/sektorler', label: 'Sektör Analizi', icon: TrendingUp },
      { href: '/makro',     label: 'Makro Radar',    icon: BarChart2 },
      { href: '/haberler',  label: 'Haberler',        icon: Newspaper },
      { href: '/araclar',   label: 'Araçlar',         icon: Calculator },
    ],
  },
  { href: '/backtesting', label: 'Backtest' },
  { href: '/topluluk',   label: 'Topluluk' },
  { href: '/dashboard',  label: 'Dashboard' },
];

type DropdownItem = { href: string; label: string; icon: React.ElementType };
type NavItem =
  | { href: string; label: string; dropdown?: undefined }
  | { href?: undefined; label: string; dropdown: DropdownItem[] };

// ─── Yardımcı ─────────────────────────────────────────────────────────────────

function isActive(item: NavItem, pathname: string): boolean {
  if (item.href) return pathname === item.href;
  return item.dropdown?.some((d) => pathname === d.href) ?? false;
}

interface NavbarClientProps {
  user: { id: string; email: string | null } | null;
}

function UserAvatar({ email, avatarUrl }: { email: string | null; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className="h-9 w-9 rounded-full object-cover border border-primary/30"
      />
    );
  }

  const initial = email ? email[0].toUpperCase() : 'U';
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
      {initial}
    </div>
  );
}

// ─── Dropdown bileşeni ────────────────────────────────────────────────────────

function NavDropdown({ item, pathname }: { item: NavItem & { dropdown: DropdownItem[] }; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = isActive(item, pathname);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  useEffect(() => { setOpen(false); }, [pathname]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1 text-sm font-medium transition-colors hover:text-primary',
          active ? 'text-primary' : 'text-text-secondary'
        )}
      >
        {item.label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-44 rounded-xl border border-border bg-surface shadow-xl z-50 overflow-hidden">
          {item.dropdown.map((d) => {
            const Icon = d.icon;
            return (
              <Link
                key={d.href}
                href={d.href}
                className={cn(
                  'flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-white/5',
                  pathname === d.href ? 'text-primary' : 'text-text-secondary hover:text-text-primary'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {d.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export function NavbarClient({ user }: NavbarClientProps) {
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Read localStorage cache after mount to avoid SSR/client mismatch
  useEffect(() => {
    const cached = localStorage.getItem('bistai_avatar_url');
    if (cached) setAvatarUrl(cached);
  }, []);
  const pathname = usePathname();
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch profile avatar
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch('/api/profile')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (cancelled) return;
        const url = d?.avatar_url ?? null;
        setAvatarUrl(url);
        if (url) localStorage.setItem('bistai_avatar_url', url);
        else localStorage.removeItem('bistai_avatar_url');
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user, pathname]);

  // Listen for avatar changes from profile page (same-page update)
  useEffect(() => {
    function onAvatarChange(e: Event) {
      const url = (e as CustomEvent<string>).detail;
      setAvatarUrl(url);
      if (url) localStorage.setItem('bistai_avatar_url', url);
    }
    window.addEventListener('avatar-changed', onAvatarChange);
    return () => window.removeEventListener('avatar-changed', onAvatarChange);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setDropdownOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
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
          {(navItems as NavItem[]).map((item) =>
            item.dropdown ? (
              <NavDropdown key={item.label} item={item as NavItem & { dropdown: DropdownItem[] }} pathname={pathname} />
            ) : (
              <Link
                key={item.href}
                href={item.href!}
                className={cn(
                  'text-sm font-medium transition-colors hover:text-primary',
                  pathname === item.href ? 'text-primary' : 'text-text-secondary'
                )}
              >
                {item.label}
              </Link>
            )
          )}
        </nav>

        <div className="flex items-center gap-2">
          {/* Desktop auth */}
          <div className="hidden items-center gap-2 md:flex">
            {user ? (
              <div className="relative" ref={userDropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                >
                  <UserAvatar email={user.email} avatarUrl={avatarUrl} />
                  <span className="max-w-[120px] truncate text-xs">
                    {user.email?.split('@')[0] ?? 'Hesap'}
                  </span>
                  <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', dropdownOpen && 'rotate-180')} />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-lg z-50">
                    <div className="px-3 py-2 border-b border-border">
                      <p className="text-xs text-text-secondary truncate">{user.email}</p>
                    </div>
                    <div className="py-1">
                      <Link href="/profil" className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors">
                        <User className="h-4 w-4" /> Profilim
                      </Link>
                      <Link href="/dashboard" className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors">
                        <LayoutDashboard className="h-4 w-4" /> Dashboard
                      </Link>
                      <Link href="/topluluk" className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors">
                        <Users className="h-4 w-4" /> Topluluk
                      </Link>
                    </div>
                    <div className="border-t border-border py-1">
                      <form action="/auth/logout" method="post">
                        <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/5 transition-colors">
                          <LogOut className="h-4 w-4" /> Çıkış Yap
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
          mobileOpen ? 'max-h-[600px]' : 'max-h-0 border-t-0'
        )}
      >
        <nav className="container mx-auto flex flex-col gap-1 px-4 py-3">
          {(navItems as NavItem[]).map((item) =>
            item.dropdown ? (
              <div key={item.label}>
                <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  {item.label}
                </p>
                {item.dropdown.map((d) => {
                  const Icon = d.icon;
                  return (
                    <Link
                      key={d.href}
                      href={d.href}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        pathname === d.href
                          ? 'bg-primary/10 text-primary'
                          : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {d.label}
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href!}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname === item.href
                    ? 'bg-primary/10 text-primary'
                    : 'text-text-secondary hover:bg-surface hover:text-text-primary'
                )}
              >
                {item.label}
              </Link>
            )
          )}

          <div className="mt-2 border-t border-border pt-3">
            {user ? (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 px-3 py-1.5">
                  <UserAvatar email={user.email} avatarUrl={avatarUrl} />
                  <span className="text-xs text-text-secondary truncate">{user.email}</span>
                </div>
                <Link href="/profil" className={cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors', pathname === '/profil' ? 'bg-primary/10 text-primary' : 'text-text-secondary hover:bg-surface hover:text-text-primary')}>
                  Profilim
                </Link>
                <form action="/auth/logout" method="post" className="mt-1">
                  <Button variant="outline" size="sm" className="w-full" type="submit">Çıkış Yap</Button>
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
