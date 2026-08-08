'use client';

/**
 * Misafir modu şeridi — kabuğun en üstünde.
 *
 * DÜRÜSTLÜK GEREĞİ ZORUNLU: misafir oturumu anonimdir; kullanıcı çerezleri
 * temizlerse veya başka cihazdan girerse portföyü/izleme listesi GERİ GELMEZ.
 * Bunu söylemeden veri girmesine izin vermek, sonradan kaybettirmek olurdu.
 * Aynı şerit hesaba geçiş yolunu da sunar (kayıt = veriyi kalıcı kılmak).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase';
import { isGuestUser } from '@/lib/guest';

export function MisafirSeridi() {
  const [guest, setGuest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setGuest(isGuestUser(data.user));
    });
    return () => { cancelled = true; };
  }, []);

  if (!guest) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-hairline bg-ai/[0.08] px-4 py-2 text-center">
      <span className="text-[12px] font-bold text-ink">Misafir modundasın</span>
      <span className="text-[11.5px] font-medium text-t2">
        Kaydettiklerin bu cihaza bağlı ve kalıcı değil · AI Asistan kapalı
      </span>
      <Link
        href="/kayit"
        className="rounded-[9px] bg-ink px-3 py-1 text-[11.5px] font-bold text-onink transition-opacity hover:opacity-90"
      >
        Ücretsiz hesap oluştur
      </Link>
    </div>
  );
}

export default MisafirSeridi;
