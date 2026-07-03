'use client';

/**
 * "Karşılama / Giriş" ekranı (design_handoff_kalan_ekranlar, fullekran sürümü) — hi-fi.
 * TAMAMEN koyu (#0b0d11) tek ekran: animasyonlu ışık haleleri + huzmeler + yıldız
 * parçacıkları (AnimatedNightScene). Form koyu zemin üstünde camsı inputlarla;
 * birincil buton BEYAZ. Masaüstü: üst satırda başlık + değer önerileri, ortada 400px form.
 * KORUNAN: redirect param (open-redirect koruması), hata eşlemesi, şifremi-unuttum,
 * Google/Apple OAuth. Giriş sonrası onboarded değilse → /karsilama.
 */

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { Wordmark, AnimatedNightScene } from '@/components/new/brand';

function AppleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.36 12.78c.02 2.45 2.15 3.27 2.18 3.28-.02.06-.34 1.16-1.12 2.3-.67.98-1.37 1.95-2.47 1.97-1.08.02-1.43-.64-2.66-.64-1.24 0-1.62.62-2.64.66-1.06.04-1.87-1.06-2.55-2.04-1.38-2-2.44-5.65-1.02-8.12.7-1.22 1.96-2 3.33-2.02 1.04-.02 2.02.71 2.66.71.63 0 1.83-.88 3.08-.75.52.02 1.99.21 2.94 1.59-.08.05-1.75 1.02-1.73 3.04M14.4 6.06c.56-.68.94-1.62.84-2.56-.81.03-1.79.54-2.37 1.22-.52.6-.97 1.56-.85 2.48.9.07 1.82-.46 2.38-1.14" />
    </svg>
  );
}

const inputCls =
  'h-[52px] w-full rounded-[14px] border border-white/[0.12] bg-white/[0.06] px-4 text-[15px] font-medium text-white outline-none transition-colors placeholder:text-[#6f7581] focus:border-white/30';

export function GirisScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);

  const searchParams = useSearchParams();
  const rawRedirect = searchParams.get('redirect') ?? '/bugun';
  // Open redirect koruması — sadece relative path'lere izin ver
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/bugun';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        const msg =
          err.message === 'Invalid login credentials'
            ? 'E-posta veya şifre hatalı.'
            : err.message === 'Email not confirmed'
              ? 'E-posta adresinizi doğrulamanız gerekiyor. Gelen kutunuzu kontrol edin.'
              : err.message;
        setError(msg);
        return;
      }
      // Onboarding tamamlanmadıysa önce karşılama akışına yönlendir
      const onboarded = data.user?.user_metadata?.onboarded === true;
      window.location.assign(onboarded ? redirect : '/karsilama');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Giriş yapılamadı.');
    } finally {
      setLoading(false);
    }
  }

  async function oauth(provider: 'google' | 'apple') {
    setError(null);
    setOauthLoading(provider);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      // Başarılıysa tarayıcı zaten yönlendirilir; buraya gelindiyse hata vardır
      if (err) {
        setError('Sosyal giriş şu an kullanılamıyor. E-posta ile devam edin.');
        setOauthLoading(null);
      }
    } catch {
      setError('Sosyal giriş şu an kullanılamıyor. E-posta ile devam edin.');
      setOauthLoading(null);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#0b0d11] text-white">
      <div className="lg:hidden">
        <AnimatedNightScene />
      </div>
      <div className="hidden lg:block">
        <AnimatedNightScene desktop />
      </div>

      <div className="relative flex min-h-[100dvh] flex-1 flex-col">
        {/* Üst: wordmark + başlık (+ masaüstünde sağda değer önerileri) */}
        <div className="flex items-start justify-between px-7 pt-8 lg:px-12 lg:pt-[38px]">
          <div>
            <span className="lg:hidden">
              <Wordmark onDark size={18} markSize={30} />
            </span>
            <span className="hidden lg:block">
              <Wordmark onDark size={20} markSize={34} />
            </span>
            <h1 className="mt-3.5 text-[24px] font-extrabold leading-[1.12] tracking-[-0.035em] lg:mt-[26px] lg:text-[40px] lg:leading-[1.1]">
              Borsa, yapay
              <br />
              zekâ ile sade.
            </h1>
          </div>
          <div className="hidden flex-col gap-3 pt-2 lg:flex">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[12px] font-bold text-ai-on-dark">✦</span>
              <span className="text-[13px] font-semibold text-[#dfe2e8]">Kişiselleştirilmiş AI sinyalleri</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-up-on-dark" />
              <span className="text-[13px] font-semibold text-[#dfe2e8]">Gerçek zamanlı BIST verisi</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="h-1.5 w-1.5 rounded-full bg-up-on-dark" />
              <span className="text-[13px] font-semibold text-[#dfe2e8]">Risk profiline göre model portföyler</span>
            </div>
          </div>
        </div>

        {/* Orta: form */}
        <div className="flex flex-1 flex-col lg:items-center lg:justify-center">
          <form
            onSubmit={handleSubmit}
            className="mx-auto flex w-full max-w-[440px] flex-1 flex-col gap-3.5 px-7 pt-7 lg:max-w-[400px] lg:flex-none lg:px-0 lg:pt-0"
          >
            {/* Masaüstü form başlığı */}
            <div className="hidden lg:block">
              <h2 className="text-[26px] font-extrabold tracking-[-0.03em] text-white">Tekrar hoş geldin</h2>
              <p className="mt-1 text-[13px] font-medium text-[#8f95a3]">Hesabına giriş yap</p>
            </div>

            {error && (
              <div className="rounded-[12px] border border-down/40 bg-down/15 px-3 py-2 text-[13px] font-medium text-[#f58b8e]">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 lg:mt-2">
              <label htmlFor="email" className="text-[12px] font-medium text-[#8f95a3]">
                E-posta
              </label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="ahmet@ornek.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className={inputCls}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-[12px] font-medium text-[#8f95a3]">
                  Şifre
                </label>
                <Link href="/sifre-sifirla" className="text-[12px] font-semibold text-up-on-dark hover:underline">
                  Şifremi unuttum
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  className={`${inputCls} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-medium text-[#8f95a3] hover:text-white"
                  tabIndex={-1}
                >
                  {show ? 'Gizle' : 'Göster'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-[52px] items-center justify-center rounded-[14px] bg-white text-[15px] font-bold text-[#0b0d11] transition-colors hover:bg-white/90 disabled:opacity-60"
            >
              {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </button>

            <div className="my-1 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-[11px] font-semibold text-[#6f7581]">veya</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => oauth('google')}
                disabled={oauthLoading !== null}
                className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-white/[0.16] text-[13px] font-bold text-white transition-colors hover:bg-white/[0.06] disabled:opacity-60"
              >
                <span className="text-[15px] font-extrabold text-[#8ab4f8]">G</span>
                {oauthLoading === 'google' ? '…' : 'Google'}
              </button>
              <button
                type="button"
                onClick={() => oauth('apple')}
                disabled={oauthLoading !== null}
                className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-white/[0.16] text-[13px] font-bold text-white transition-colors hover:bg-white/[0.06] disabled:opacity-60"
              >
                <AppleIcon />
                {oauthLoading === 'apple' ? '…' : 'Apple'}
              </button>
            </div>

            <div className="flex-1 lg:hidden" />

            <p className="pb-6 text-center text-[13px] font-medium text-[#8f95a3] lg:mt-3 lg:pb-0">
              Hesabın yok mu?{' '}
              <Link href="/kayit" className="font-bold text-white hover:underline">
                Kayıt ol
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
