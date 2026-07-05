'use client';

/**
 * Yeni modern-minimalist kabuk (design_handoff_bistai).
 * Masaüstü: sol sidebar + üst topbar. Mobil: alt tab bar. Açık tema (page #fcfcfd).
 * Ekran-ekran geçişte yalnız yeni tasarım rotalarında kullanılır.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from '@/components/new/brand';
import { SymbolSearch } from '@/components/new/SymbolSearch';

interface NavItem {
  href: string;
  label: string;
  ai?: boolean;
}

// Sidebar (masaüstü)
const SIDEBAR: NavItem[] = [
  { href: '/bugun', label: 'Bugün' },
  { href: '/firsatlar', label: 'Fırsatlar' },
  { href: '/portfolyo', label: 'Portföyüm' },
  { href: '/makro', label: 'Piyasa' },
  { href: '/ai-portfoyler', label: 'AI Portföyleri' },
  { href: '/sohbet', label: 'AI Asistan', ai: true },
];

// Alt tab bar (mobil)
const TABS: NavItem[] = [
  { href: '/bugun', label: 'Bugün' },
  { href: '/firsatlar', label: 'Fırsatlar' },
  { href: '/portfolyo', label: 'Portföy' },
  { href: '/sohbet', label: 'AI', ai: true },
  { href: '/profil', label: 'Profil' },
];

function MarketChip() {
  return (
    <div className="flex items-center gap-[7px] rounded-[10px] bg-up-badge px-3 py-[7px]">
      <span className="h-[7px] w-[7px] rounded-full bg-up" />
      <span className="font-manrope text-[11px] font-bold text-up">BIST açık</span>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

  return (
    <div className="min-h-screen bg-page font-manrope text-ink">
      <div className="mx-auto flex min-h-screen w-full">
        {/* ── Sidebar (masaüstü) ── */}
        <aside className="hidden w-[230px] shrink-0 flex-col border-r border-[#f0f1f3] bg-page p-4 lg:flex">
          <Link href="/bugun" className="flex items-center px-2">
            <Wordmark size={16} markSize={30} />
          </Link>

          <nav className="mt-6 flex flex-col gap-0.5">
            {SIDEBAR.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`flex items-center gap-[11px] rounded-[12px] px-3 py-[11px] text-[14px] transition-colors ${
                    active ? 'bg-ink font-bold text-onink' : 'font-semibold text-t2 hover:bg-fill'
                  }`}
                >
                  {it.ai ? (
                    <span className="font-mono text-[11px] font-bold text-ai">✦</span>
                  ) : (
                    <span className={`h-[6px] w-[6px] rounded-full ${active ? 'bg-up' : 'bg-[#d4d7dc]'}`} />
                  )}
                  {it.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />
          <Link href="/profil" className="flex items-center gap-[11px] rounded-[13px] p-2.5 hover:bg-fill">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-ink text-[13px] font-bold text-onink">
              AY
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-ink">Hesabım</span>
              <span className="block text-[11px] font-medium text-t3">Bireysel hesap</span>
            </span>
          </Link>
        </aside>

        {/* ── Ana alan ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar (masaüstü) — çalışan hızlı sembol arama */}
          <div className="hidden h-[68px] items-center justify-between border-b border-[#f0f1f3] px-7 lg:flex">
            <SymbolSearch className="w-[320px]" />
            <MarketChip />
          </div>

          {/* Mobil üst bar (logo + chip) */}
          <div className="flex h-[56px] items-center justify-between border-b border-hairline bg-panel px-6 lg:hidden">
            <Link href="/bugun" className="flex items-center">
              <Wordmark size={16} markSize={26} />
            </Link>
            <MarketChip />
          </div>

          {/* İçerik */}
          <main className="flex-1 pb-24 lg:pb-0">{children}</main>
        </div>
      </div>

      {/* ── Alt tab bar (mobil) ── */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[68px] items-center justify-around border-t border-[#f3f4f6] bg-panel pb-1.5 lg:hidden">
        {TABS.map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center gap-[5px] text-[10px] ${
                active ? 'font-bold text-ink' : 'font-semibold text-t4'
              }`}
            >
              {it.ai ? (
                <span className="font-mono text-[11px] font-bold text-ai">✦</span>
              ) : (
                <span className={`h-[5px] w-[5px] rounded-full ${active ? 'bg-ink' : 'bg-[#d4d7dc]'}`} />
              )}
              {it.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
