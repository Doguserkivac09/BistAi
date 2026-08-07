/**
 * Auth callback — e-posta doğrulama, sosyal giriş ve şifre kurtarma dönüşü.
 *
 * İKİ BAĞLANTI BİÇİMİ DESTEKLENİR (eskiden yalnız birincisi vardı):
 *  1. `?code=...`            → PKCE (sosyal giriş + `@supabase/ssr` varsayılanı)
 *  2. `?token_hash=..&type=` → Supabase'in güncel e-posta şablonları bu biçimi üretir
 *     (`{{ .TokenHash }}`). Bu dal YOKTU: şablon bu biçimdeyse `code` gelmiyor,
 *     istek sessizce /giris'e düşüyor ve kullanıcı "doğrulama çalışmıyor" diyordu.
 *
 * HATA ARTIK YUTULMUYOR: başarısızlıkta `/giris?hata=<kod>` ile dönülür; kullanıcı
 * neden başarısız olduğunu görür (eskiden boş giriş ekranına düşüyordu).
 */

import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerClient } from '@/lib/supabase-server';

/** Open-redirect koruması — yalnız site-içi göreli yollar. */
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(searchParams.get('next'));

  // Supabase hata ile geri döndürdüyse (ör. bağlantı süresi doldu) sebebi taşı
  const providerError = searchParams.get('error_description') ?? searchParams.get('error');
  if (providerError) {
    return NextResponse.redirect(new URL(`/giris?hata=baglanti`, request.url));
  }

  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL('/giris?hata=eksik', request.url));
  }

  const supabase = await createServerClient();

  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type ?? 'email' })
    : await supabase.auth.exchangeCodeForSession(code!);

  if (error) {
    console.error('[auth/callback] doğrulama başarısız:', error.message);
    // Süresi dolmuş / daha önce kullanılmış bağlantı en sık sebep
    const kod = /expired|invalid/i.test(error.message) ? 'suresi-doldu' : 'dogrulama';
    return NextResponse.redirect(new URL(`/giris?hata=${kod}`, request.url));
  }

  // Şifre kurtarma: oturum açıldı ama kullanıcı yeni şifre belirlemeli
  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/sifre-guncelle', request.url));
  }

  // Onboarding tamamlanmadıysa (yeni kullanıcı / sosyal giriş) önce karşılama akışı
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const onboarded = user?.user_metadata?.onboarded === true;

  return NextResponse.redirect(new URL(next ?? (onboarded ? '/bugun' : '/karsilama'), request.url));
}
