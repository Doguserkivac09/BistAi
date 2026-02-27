import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getAuthenticatedUser, UnauthorizedError } from '@/lib/auth-server';

const navItems = [
  { href: '/', label: 'Ana Sayfa' },
  { href: '/tarama', label: 'Tarama' },
  { href: '/dashboard', label: 'Dashboard' },
];

export async function Navbar() {
  let user: { id: string; email: string | null } | null = null;
  try {
    user = await getAuthenticatedUser();
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      throw error;
    }
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-text-primary">
          <span className="text-primary">Bist</span>
          <span>AI</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'text-sm font-medium transition-colors hover:text-primary text-text-secondary'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              {user.email && (
                <span className="hidden text-sm text-text-secondary md:inline">
                  {user.email}
                </span>
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
      </div>
    </header>
  );
}
