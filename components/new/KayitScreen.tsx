'use client';

/**
 * "Kayıt ol" ekranı (design_handoff_kalan_ekranlar ile aynı dil) — hi-fi, açık tema.
 * Koyu hero + beyaz form (Ad, Soyad, E-posta, Şifre). Supabase signUp.
 * KORUNAN: Ad/Soyad zorunlu doğrulama, user_metadata (full_name/first_name/last_name),
 * e-posta doğrulama success durumu. Oturum açıldıysa → /karsilama (onboarding).
 */

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';

const HERO_LINE = 'M4 44 L30 40 L56 46 L82 33 L108 38 L134 27 L160 31 L186 21 L212 25 L238 15 L264 19 L290 11 L316 7';
const HERO_AREA = `${HERO_LINE} L316 60 L4 60 Z`;

export function KayitScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const trimFirst = firstName.trim();
    const trimLast = lastName.trim();
    if (!trimFirst || !trimLast) {
      setError('Ad ve soyad alanları zorunludur.');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const fullName = `${trimFirst} ${trimLast}`;

      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
          data: {
            full_name: fullName,
            first_name: trimFirst,
            last_name: trimLast,
          },
        },
      });

      if (err) {
        setError(
          err.message.includes('already registered')
            ? 'Bu e-posta adresi zaten kayıtlı. Giriş yapın.'
            : err.message
        );
        return;
      }

      // E-posta doğrulaması kapalıysa oturum hemen açılır → onboarding akışı
      if (data.session) {
        window.location.assign('/karsilama');
        return;
      }
      // E-posta doğrulaması gerekiyorsa "gelen kutusu" durumunu göster
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kayıt oluşturulamadı.');
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
      if (err) {
        setError('Sosyal kayıt şu an kullanılamıyor. E-posta ile devam edin.');
        setOauthLoading(null);
      }
    } catch {
      setError('Sosyal kayıt şu an kullanılamıyor. E-posta ile devam edin.');
      setOauthLoading(null);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-page">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col">
        {/* Koyu hero */}
        <div className="bg-ink px-7 pb-8 pt-10 text-white sm:rounded-b-[28px]">
          <div className="flex items-center gap-2.5">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-white">
              <span className="h-[13px] w-[13px] rounded-[4px] bg-up" />
            </span>
            <span className="text-[21px] font-extrabold tracking-[-0.03em]">bistAI</span>
          </div>
          <h1 className="mt-9 text-[32px] font-extrabold leading-[1.12] tracking-[-0.035em]">
            Birkaç saniyede
            <br />
            başla.
          </h1>
          <p className="mt-3.5 max-w-[280px] text-[14px] font-medium leading-[1.55] text-t3">
            Ücretsiz hesap oluştur, AI destekli sinyallerle BIST&apos;i takip et.
          </p>
          <svg width="100%" height="60" viewBox="0 0 320 60" preserveAspectRatio="none" className="mt-6">
            <defs>
              <linearGradient id="kayit-hero" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="rgba(63,206,138,0.32)" />
                <stop offset="1" stopColor="rgba(63,206,138,0)" />
              </linearGradient>
            </defs>
            <path d={HERO_AREA} fill="url(#kayit-hero)" />
            <path d={HERO_LINE} fill="none" stroke="#3fce8a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Beyaz form */}
        <div className="flex flex-1 flex-col bg-page px-7 py-7">
          {success ? (
            <div className="flex flex-1 flex-col">
              <div className="rounded-[14px] border border-up/30 bg-up/10 px-4 py-4 text-[14px] font-medium text-up">
                Kayıt başarılı! E-posta adresine doğrulama bağlantısı gönderdik. Gelen kutunu kontrol edip
                hesabını onayla.
              </div>
              <div className="flex-1" />
              <Link
                href="/giris"
                className="flex h-[52px] items-center justify-center rounded-[14px] bg-ink text-[15px] font-bold text-white transition-colors hover:bg-ink/90"
              >
                Giriş ekranına dön
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-3.5">
              {error && (
                <div className="rounded-[12px] border border-down/30 bg-down/10 px-3 py-2 text-[13px] font-medium text-down">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <label htmlFor="firstName" className="text-[12px] font-medium text-t3">
                    Ad
                  </label>
                  <input
                    id="firstName"
                    type="text"
                    autoComplete="given-name"
                    placeholder="Adınız"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    disabled={loading}
                    className="h-[52px] w-full rounded-[14px] border border-transparent bg-fill px-4 text-[15px] font-medium text-ink outline-none transition-colors placeholder:text-t4 focus:border-ink focus:bg-panel"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="lastName" className="text-[12px] font-medium text-t3">
                    Soyad
                  </label>
                  <input
                    id="lastName"
                    type="text"
                    autoComplete="family-name"
                    placeholder="Soyadınız"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    disabled={loading}
                    className="h-[52px] w-full rounded-[14px] border border-transparent bg-fill px-4 text-[15px] font-medium text-ink outline-none transition-colors placeholder:text-t4 focus:border-ink focus:bg-panel"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2">
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
                <label htmlFor="password" className="text-[12px] font-medium text-t3">
                  Şifre
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="En az 6 karakter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
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
                {loading ? 'Hesap oluşturuluyor…' : 'Hesap oluştur'}
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M16.36 12.78c.02 2.45 2.15 3.27 2.18 3.28-.02.06-.34 1.16-1.12 2.3-.67.98-1.37 1.95-2.47 1.97-1.08.02-1.43-.64-2.66-.64-1.24 0-1.62.62-2.64.66-1.06.04-1.87-1.06-2.55-2.04-1.38-2-2.44-5.65-1.02-8.12.7-1.22 1.96-2 3.33-2.02 1.04-.02 2.02.71 2.66.71.63 0 1.83-.88 3.08-.75.52.02 1.99.21 2.94 1.59-.08.05-1.75 1.02-1.73 3.04M14.4 6.06c.56-.68.94-1.62.84-2.56-.81.03-1.79.54-2.37 1.22-.52.6-.97 1.56-.85 2.48.9.07 1.82-.46 2.38-1.14" />
                  </svg>
                  {oauthLoading === 'apple' ? '…' : 'Apple'}
                </button>
              </div>

              <div className="flex-1" />

              <p className="text-center text-[13px] font-medium text-t3">
                Zaten hesabın var mı?{' '}
                <Link href="/giris" className="font-bold text-ink hover:underline">
                  Giriş yap
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
