import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll(cookies) {
          cookies.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Oturum varsa: giriş/kayıt VEYA kök → "Bugün" (varsayılan landing, yeni tasarım)
  if (user && (pathname.startsWith('/giris') || pathname.startsWith('/kayit') || pathname === '/')) {
    return NextResponse.redirect(new URL('/bugun', request.url));
  }

  if (
    !user &&
    (pathname.startsWith('/bugun') ||
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/tarama') ||
      pathname.startsWith('/hisse/') ||
      pathname.startsWith('/profil') ||
      pathname.startsWith('/portfolyo') ||
      pathname.startsWith('/watchlist') ||
      pathname.startsWith('/backtesting') ||
      pathname.startsWith('/topluluk') ||
      pathname.startsWith('/karsilastir'))
  ) {
    const redirectTo = `${pathname}${request.nextUrl.search}`;
    const loginUrl = new URL('/giris', request.url);
    loginUrl.searchParams.set('redirect', redirectTo);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/', '/bugun', '/dashboard', '/tarama', '/hisse/:path*', '/profil', '/portfolyo', '/watchlist', '/backtesting', '/topluluk/:path*', '/karsilastir', '/giris', '/kayit'],
};

