import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/giris', request.url));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/giris', request.url));
  }

  // Onboarding tamamlanmadıysa (yeni kullanıcı / sosyal giriş) önce karşılama akışı
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const onboarded = user?.user_metadata?.onboarded === true;

  return NextResponse.redirect(new URL(onboarded ? '/bugun' : '/karsilama', request.url));
}
