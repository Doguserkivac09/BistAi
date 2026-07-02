'use client';

/**
 * "Yardım & Destek" ekranı (design_handoff_kalan_ekranlar) — hi-fi, açık tema.
 * Arama + 4 kategori kartı + SSS + koyu destek kartı (→ AI Asistan).
 * KORUNAN: eski eğitim merkezi içeriği — formasyon/sinyal rehberleri aramada
 * taranır ve mevcut /yardim/* alt sayfalarına linklenir (alt sayfalar eski temada).
 * Masaüstü: ortalanmış 640px sütun.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FORMATIONS } from '@/lib/formation-content';
import { SIGNALS } from '@/lib/signal-content';

const CATS = [
  { ic: '📖', label: 'Nasıl kullanılır', sub: 'Başlangıç rehberi', href: '/yardim/nasil-kullanilir' },
  { ic: '🔔', label: 'Sinyaller', sub: '19 sinyal türü', href: '/yardim/sinyaller' },
  { ic: '🛡️', label: 'Risk yönetimi', sub: '%1 kuralı & stop-loss', href: '/yardim/risk-yonetimi' },
  { ic: '✦', label: 'AI Asistan', sub: 'Sinyal & skorlar', href: '/sohbet', ai: true },
];

const FAQS = [
  { q: 'AI sinyalleri neye göre üretiliyor?', href: '/yardim/sinyaller' },
  { q: 'Verdict (Uzak Dur / İzle / Değerlendir) ne anlama geliyor?', href: '/yardim/nasil-kullanilir' },
  { q: 'Risk profilimi nasıl değiştiririm?', href: '/profil' },
  { q: 'Pozisyon büyüklüğünü nasıl belirlemeliyim?', href: '/yardim/risk-yonetimi' },
];

interface SearchRow {
  label: string;
  sub: string;
  href: string;
  emoji: string;
}

function Chevron() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#cfd2d8" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export function YardimScreen() {
  const [query, setQuery] = useState('');

  // Aranabilir içerik: eski eğitim merkezinin tamamı (formasyonlar + sinyaller)
  const searchIndex = useMemo<SearchRow[]>(
    () => [
      ...SIGNALS.map((s) => ({ label: s.name, sub: 'Sinyal rehberi', href: `/yardim/sinyaller/${s.id}`, emoji: s.emoji })),
      ...FORMATIONS.map((f) => ({ label: f.name, sub: 'Formasyon rehberi', href: `/yardim/formasyonlar/${f.id}`, emoji: f.emoji })),
    ],
    []
  );

  const q = query.trim().toLocaleLowerCase('tr-TR');
  const results = q.length >= 2 ? searchIndex.filter((r) => r.label.toLocaleLowerCase('tr-TR').includes(q)).slice(0, 8) : [];

  return (
    <div className="px-6 py-6 lg:px-7 lg:py-7">
      <div className="mx-auto w-full lg:max-w-[640px]">
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink lg:text-[22px]">
          Yardım <span className="hidden text-[13px] font-semibold text-t3 lg:inline">· Destek merkezi</span>
        </h1>

        {/* Arama */}
        <div className="mt-5 flex h-[48px] items-center gap-2.5 rounded-[14px] bg-fill px-4 lg:h-[52px]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9aa0ad" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Soru, sinyal veya formasyon ara…"
            className="w-full bg-transparent text-[14px] font-medium text-ink outline-none placeholder:text-t3"
          />
        </div>

        {/* Arama sonuçları */}
        {q.length >= 2 && (
          <div className="mt-3 overflow-hidden rounded-[16px] border border-hairline bg-panel">
            {results.length === 0 ? (
              <div className="px-4 py-4 text-[13px] font-medium text-t3">Sonuç bulunamadı.</div>
            ) : (
              results.map((r) => (
                <Link key={r.href} href={r.href} className="flex items-center gap-3 border-b border-[#f6f7f8] px-4 py-3 last:border-0 hover:bg-fill">
                  <span className="text-[15px]">{r.emoji}</span>
                  <span className="flex-1">
                    <span className="block text-[13px] font-semibold text-ink">{r.label}</span>
                    <span className="block text-[11px] font-medium text-t3">{r.sub}</span>
                  </span>
                  <Chevron />
                </Link>
              ))
            )}
          </div>
        )}

        {/* Kategoriler */}
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-3.5">
          {CATS.map((c) => (
            <Link key={c.label} href={c.href} className="rounded-[16px] border border-hairline bg-panel p-4 transition-colors hover:border-[#e3e5e8]">
              <span className={`flex h-9 w-9 items-center justify-center rounded-[11px] bg-fill text-[17px] ${c.ai ? 'font-mono font-bold text-ai' : ''}`}>
                {c.ic}
              </span>
              <span className="mt-2.5 block text-[14px] font-bold text-ink">{c.label}</span>
              <span className="mt-0.5 block text-[11px] font-medium text-t3">{c.sub}</span>
            </Link>
          ))}
        </div>

        {/* SSS */}
        <div className="mt-6">
          <h2 className="text-[15px] font-extrabold tracking-[-0.01em] text-ink lg:text-[16px]">Sık sorulanlar</h2>
          <div className="mt-2 overflow-hidden rounded-[16px] border border-hairline bg-panel">
            {FAQS.map((f) => (
              <Link key={f.q} href={f.href} className="flex items-center gap-3 border-b border-[#f6f7f8] px-4 py-3.5 last:border-0 hover:bg-fill">
                <span className="flex-1 text-[13px] font-semibold leading-[1.4] text-ink lg:text-[14px]">{f.q}</span>
                <Chevron />
              </Link>
            ))}
          </div>
        </div>

        {/* Formasyon rehberi (eski eğitim merkezi — korunan içerik) */}
        <div className="mt-6">
          <h2 className="text-[15px] font-extrabold tracking-[-0.01em] text-ink lg:text-[16px]">Formasyon rehberi</h2>
          <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {FORMATIONS.map((f) => (
              <Link key={f.id} href={`/yardim/formasyonlar/${f.id}`} className="flex items-center gap-3 rounded-[14px] border border-hairline bg-panel px-3.5 py-3 hover:border-[#e3e5e8]">
                <span className="text-[18px]">{f.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-ink">{f.name}</span>
                  <span className={`block text-[11px] font-semibold ${f.direction === 'bullish' ? 'text-up' : f.direction === 'bearish' ? 'text-down' : 'text-warn'}`}>
                    %{f.successRate} başarı
                  </span>
                </span>
                <Chevron />
              </Link>
            ))}
          </div>
        </div>

        {/* Destek kartı */}
        <Link href="/sohbet" className="mt-6 flex items-center gap-3.5 rounded-[18px] bg-ink p-[18px] transition-opacity hover:opacity-95">
          <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/[0.08]">
            <span className="font-mono text-[14px] font-bold text-ai-on-dark">✦</span>
          </span>
          <span className="flex-1">
            <span className="block text-[15px] font-bold text-white">Hâlâ yardım gerek mi?</span>
            <span className="mt-0.5 block text-[12px] font-medium text-t3">AI asistan ile konuş — canlı piyasa verisine bağlı</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>

        <p className="mt-5 text-center text-[11px] font-medium text-t4">
          Bu rehber genel eğitim amaçlıdır. Yatırım tavsiyesi değildir.
        </p>
      </div>
    </div>
  );
}
