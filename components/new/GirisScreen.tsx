'use client';

/**
 * "Karşılama / Giriş" ekranı (design_handoff_kalan_ekranlar) — hi-fi, açık tema.
 * Mobil: üst koyu hero + alt beyaz form. Masaüstü (lg): split layout —
 * sol %46 koyu marka paneli (başlık + grafik + 3 değer önerisi), sağda 380px form.
 * E-posta/şifre (Supabase signInWithPassword) + Google/Apple (signInWithOAuth).
 * KORUNAN: redirect param (open-redirect koruması), hata eşlemesi, şifremi-unuttum.
 * Giriş sonrası onboarded değilse → /karsilama, değilse redirect/bugun.
 */

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

// Hero dekoratif alan grafiği (statik — gerçek veri değil, yalnız görsel)
const HERO_LINE = 'M4 44 L30 40 L56 46 L82 33 L108 38 L134 27 L160 31 L186 21 L212 25 L238 15 L264 19 L290 11 L316 7';
const HERO_AREA = `${HERO_LINE} L316 60 L4 60 Z`;
const DESK_LINE = 'M6 96 L42 88 L78 98 L114 74 L150 82 L186 62 L222 68 L258 48 L294 54 L330 34 L366 40 L402 22 L434 14';
const DESK_AREA = `${DESK_LINE} L434 120 L6 120 Z`;

function Logo({ size = 34 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-[10px] bg-white"
      style={{ width: size, height: size }}
    >
      <span className="rounded-[4px] bg-up" style={{ width: size * 0.38, height: size * 0.38 }} />
    </span>
  );
}

function AppleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.36 12.78c.02 2.45 2.15 3.27 2.18 3.28-.02.06-.34 1.16-1.12 2.3-.67.98-1.37 1.95-2.47 1.97-1.08.02-1.43-.64-2.66-.64-1.24 0-1.62.62-2.64.66-1.06.04-1.87-1.06-2.55-2.04-1.38-2-2.44-5.65-1.02-8.12.7-1.22 1.96-2 3.33-2.02 1.04-.02 2.02.71 2.66.71.63 0 1.83-.88 3.08-.75.52.02 1.99.21 2.94 1.59-.08.05-1.75 1.02-1.73 3.04M14.4 6.06c.56-.68.94-1.62.84-2.56-.81.03-1.79.54-2.37 1.22-.52.6-.97 1.56-.85 2.48.9.07 1.82-.46 2.38-1.14" />
    </svg>
  );
}

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
    <div className="flex min-h-[100dvh] flex-col bg-page lg:flex-row">
      {/* ── Masaüstü: sol koyu marka paneli (%46) ── */}
      <div className="hidden bg-ink text-white lg:flex lg:w-[46%] lg:flex-col lg:px-12 lg:py-11">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[21px] font-extrabold tracking-[-0.03em]">bistAI</span>
        </div>
        <h1 className="mt-16 text-[42px] font-extrabold leading-[1.1] tracking-[-0.035em]">
          Borsa, yapay
          <br />
          zekâ ile sade.
        </h1>
        <p className="mt-4 max-w-[330px] text-[15px] font-medium leading-[1.6] text-t3">
          Portföyünü izle, AI sinyalleriyle fırsatları yakala, riskini anla.
        </p>
        <svg width="100%" height="120" viewBox="0 0 440 120" preserveAspectRatio="none" className="mt-10">
          <defs>
            <linearGradient id="giris-hero-desk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(63,206,138,0.32)" />
              <stop offset="1" stopColor="rgba(63,206,138,0)" />
            </linearGradient>
          </defs>
          <path d={DESK_AREA} fill="url(#giris-hero-desk)" />
          <path d={DESK_LINE} fill="none" stroke="#3fce8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="flex-1" />
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[12px] font-bold text-ai-on-dark">✦</span>
            <span className="text-[13px] font-semibold text-[#c9ccd4]">Kişiselleştirilmiş AI sinyalleri</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-up-on-dark" />
            <span className="text-[13px] font-semibold text-[#c9ccd4]">Gerçek zamanlı BIST verisi</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-up-on-dark" />
            <span className="text-[13px] font-semibold text-[#c9ccd4]">Risk profiline göre model portföyler</span>
          </div>
        </div>
      </div>

      {/* ── Sağ taraf: form (mobilde hero + form dikey) ── */}
      <div className="flex flex-1 flex-col lg:items-center lg:justify-center">
        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col lg:max-w-[380px] lg:flex-none">
          {/* Mobil koyu hero (masaüstünde gizli — sol panel var) */}
          <div className="bg-ink px-7 pb-8 pt-10 text-white sm:rounded-b-[28px] lg:hidden">
            <div className="flex items-center gap-2.5">
              <Logo />
              <span className="text-[21px] font-extrabold tracking-[-0.03em]">bistAI</span>
            </div>
            <h1 className="mt-9 text-[32px] font-extrabold leading-[1.12] tracking-[-0.035em]">
              Borsa, yapay
              <br />
              zekâ ile sade.
            </h1>
            <p className="mt-3.5 max-w-[280px] text-[14px] font-medium leading-[1.55] text-t3">
              Portföyünü izle, AI sinyalleriyle fırsatları yakala, riskini anla.
            </p>
            <svg width="100%" height="60" viewBox="0 0 320 60" preserveAspectRatio="none" className="mt-6">
              <defs>
                <linearGradient id="giris-hero" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="rgba(63,206,138,0.32)" />
                  <stop offset="1" stopColor="rgba(63,206,138,0)" />
                </linearGradient>
              </defs>
              <path d={HERO_AREA} fill="url(#giris-hero)" />
              <path d={HERO_LINE} fill="none" stroke="#3fce8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3.5 px-7 py-7 lg:flex-none lg:p-0">
            {/* Masaüstü form başlığı */}
            <div className="hidden lg:block">
              <h2 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink">Tekrar hoş geldin</h2>
              <p className="mt-1 text-[13px] font-medium text-t3">Hesabına giriş yap</p>
            </div>

            {error && (
              <div className="rounded-[12px] border border-down/30 bg-down/10 px-3 py-2 text-[13px] font-medium text-down">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2 lg:mt-2">
              <label htmlFor="email" className="text-[12px] font-medium text-t3">
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
                className="h-[52px] w-full rounded-[14px] border border-transparent bg-fill px-4 text-[15px] font-medium text-ink outline-none transition-colors placeholder:text-t4 focus:border-ink focus:bg-panel"
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-[12px] font-medium text-t3">
                  Şifre
                </label>
                <Link href="/sifre-sifirla" className="text-[12px] font-semibold text-up hover:underline">
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
                  className="h-[52px] w-full rounded-[14px] border border-transparent bg-fill px-4 pr-16 text-[15px] font-medium text-ink outline-none transition-colors placeholder:text-t4 focus:border-ink focus:bg-panel"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[13px] font-medium text-t3 hover:text-ink"
                  tabIndex={-1}
                >
                  {show ? 'Gizle' : 'Göster'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-[52px] items-center justify-center rounded-[14px] bg-ink text-[15px] font-bold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
            >
              {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </button>

            <div className="my-1.5 flex items-center gap-3">
              <div className="h-px flex-1 bg-hairline" />
              <span className="text-[11px] font-semibold text-t4">veya</span>
              <div className="h-px flex-1 bg-hairline" />
            </div>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => oauth('google')}
                disabled={oauthLoading !== null}
                className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-[#e7e9ec] bg-panel text-[13px] font-bold text-ink transition-colors hover:bg-fill disabled:opacity-60"
              >
                <span className="text-[15px] font-extrabold text-[#4285F4]">G</span>
                {oauthLoading === 'google' ? '…' : 'Google'}
              </button>
              <button
                type="button"
                onClick={() => oauth('apple')}
                disabled={oauthLoading !== null}
                className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-[#e7e9ec] bg-panel text-[13px] font-bold text-ink transition-colors hover:bg-fill disabled:opacity-60"
              >
                <AppleIcon />
                {oauthLoading === 'apple' ? '…' : 'Apple'}
              </button>
            </div>

            <div className="flex-1 lg:hidden" />

            <p className="text-center text-[13px] font-medium text-t3 lg:mt-3.5">
              Hesabın yok mu?{' '}
              <Link href="/kayit" className="font-bold text-ink hover:underline">
                Kayıt ol
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
