'use client';

import Link from 'next/link';

/**
 * Bakım ekranı — bir bölüm geçici olarak kapatıldığında gösterilir.
 *
 * 404 DEĞİL bilinçli olarak: kullanıcı sayfayı yer imine almış olabilir ve
 * "kayboldu mu, hata mı?" sorusuyla kalmamalı. Dürüst mesaj + geri dönüş yolu.
 */
export function BakimEkrani({
  baslik,
  aciklama,
  alternatifler = [],
}: {
  baslik: string;
  aciklama: string;
  alternatifler?: Array<{ href: string; label: string; not: string }>;
}) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 sm:py-16">
      <div className="rounded-2xl border border-hairline bg-panel p-6 sm:p-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-fill px-3 py-1">
          <span className="h-[7px] w-[7px] rounded-full bg-t3" />
          <span className="font-manrope text-[12px] font-semibold text-t2">Bakımda</span>
        </div>

        <h1 className="font-manrope text-[24px] font-extrabold leading-tight text-ink sm:text-[28px]">
          {baslik}
        </h1>
        <p className="mt-3 font-manrope text-[14px] leading-relaxed text-t2">{aciklama}</p>

        {alternatifler.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 font-manrope text-[12px] font-semibold uppercase tracking-wide text-t3">
              Bu arada
            </p>
            <div className="flex flex-col gap-2">
              {alternatifler.map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center justify-between rounded-xl border border-hairline bg-page px-4 py-3 transition-colors hover:bg-fill"
                >
                  <span className="font-manrope text-[14px] font-semibold text-ink">{a.label}</span>
                  <span className="font-manrope text-[12px] text-t3">{a.not}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
