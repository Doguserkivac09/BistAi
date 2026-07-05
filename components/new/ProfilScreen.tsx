'use client';

/**
 * "Profil" ekranı (design_handoff_bistai/bistAI Sayfalar.dc.html) — hi-fi.
 * Avatar + ad + e-posta + üyelik · 3 istatistik · ayar listesi · çıkış. Açık tema.
 * Bildirim toggle FONKSİYONEL (newsletter_enabled, PATCH /api/profile).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';

interface Profile {
  display_name: string | null;
  avatar_url: string | null;
  email: string | null;
  tier: 'free' | 'pro' | 'premium';
  newsletter_enabled?: boolean;
}

const TIER_LABEL = { free: 'Ücretsiz', pro: 'Pro', premium: 'Premium' } as const;

function initials(name: string | null, email: string | null): string {
  if (name) return name.trim().slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return 'BA';
}

export function ProfilScreen() {
  const [p, setP] = useState<Profile | null>(null);
  const [pozisyon, setPozisyon] = useState<number | null>(null);
  const [takip, setTakip] = useState<number | null>(null);
  const [bildirim, setBildirim] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/profile').then((r) => (r.ok ? r.json() : null)).then((d: Profile | null) => {
      if (d) { setP(d); setBildirim(d.newsletter_enabled ?? true); }
      setLoading(false);
    }).catch(() => setLoading(false));
    fetch('/api/portfolyo').then((r) => (r.ok ? r.json() : [])).then((a) => setPozisyon(Array.isArray(a) ? new Set(a.map((x: { sembol: string }) => x.sembol)).size : 0)).catch(() => {});
    fetch('/api/watchlist').then((r) => (r.ok ? r.json() : [])).then((a) => setTakip(Array.isArray(a) ? a.length : 0)).catch(() => {});
  }, []);

  async function toggleBildirim() {
    const next = !bildirim;
    setBildirim(next);
    await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newsletter_enabled: next }) }).catch(() => setBildirim(!next));
  }

  const name = p?.display_name || p?.email?.split('@')[0] || 'Hesabım';

  return (
    <div className="px-6 py-6 lg:px-7 lg:py-[26px]">
      <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-ink lg:text-[28px]">Profil</h1>

      {/* Kimlik kartı */}
      <div className="mt-[22px] flex items-center gap-4 rounded-[20px] border border-hairline bg-panel p-5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink text-[20px] font-bold text-onink">
          {p?.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(p?.display_name ?? null, p?.email ?? null)}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-[18px] font-extrabold tracking-[-0.02em] text-ink">{loading ? '…' : name}</span>
            {p && <span className="rounded-full bg-ai-panel px-2 py-0.5 text-[10px] font-bold text-ai">{TIER_LABEL[p.tier]}</span>}
          </div>
          <div className="truncate text-[13px] font-medium text-t3">{p?.email ?? '—'}</div>
        </div>
      </div>

      {/* 3 istatistik */}
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Stat label="Pozisyon" value={pozisyon != null ? String(pozisyon) : '—'} />
        <Stat label="Takip" value={takip != null ? String(takip) : '—'} />
        <Stat label="Üyelik" value={p ? TIER_LABEL[p.tier] : '—'} />
      </div>

      {/* Ayarlar */}
      <div className="mt-6 overflow-hidden rounded-[18px] border border-hairline bg-panel">
        <ToggleRow label="Bildirimler" desc="Haftalık AI bülten + uyarılar" on={bildirim} onToggle={toggleBildirim} />
        <ThemeRow />
        <Row label="Risk profili" value="Dengeli" />
        <LinkRow label="Fiyat alarmları" href="/fiyat-alertler" />
        <LinkRow label="Yardım & Destek" href="/yardim" />
      </div>

      {/* Çıkış */}
      <form action="/auth/logout" method="post" className="mt-5">
        <button type="submit" className="w-full rounded-[14px] border border-down/30 bg-down/5 px-4 py-3 text-[14px] font-bold text-down hover:bg-down/10">
          Çıkış yap
        </button>
      </form>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-hairline bg-panel p-4 text-center">
      <div className="font-mono text-[22px] font-bold text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium text-t3">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-hairline px-4 py-3.5 last:border-0">
      <span className="text-[14px] font-semibold text-ink">{label}</span>
      <span className="text-[13px] font-medium text-t3">{value}</span>
    </div>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="flex items-center justify-between border-b border-hairline px-4 py-3.5 last:border-0 hover:bg-fill">
      <span className="text-[14px] font-semibold text-ink">{label}</span>
      <span className="text-t3">›</span>
    </Link>
  );
}

function ToggleRow({ label, desc, on, onToggle }: { label: string; desc: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-hairline px-4 py-3.5 last:border-0">
      <div>
        <div className="text-[14px] font-semibold text-ink">{label}</div>
        <div className="text-[11px] font-medium text-t3">{desc}</div>
      </div>
      <button
        onClick={onToggle}
        className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${on ? 'bg-up' : 'bg-[#d4d7dc]'}`}
        aria-pressed={on}
      >
        <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white transition-all ${on ? 'left-[21px]' : 'left-[3px]'}`} />
      </button>
    </div>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

/** Açık/Karanlık tema segment kontrolü — tercih localStorage'da (ThemeProvider). */
function ThemeRow() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex items-center justify-between border-b border-hairline px-4 py-3.5 last:border-0">
      <div>
        <div className="text-[14px] font-semibold text-ink">Tema</div>
        <div className="text-[11px] font-medium text-t3">Açık veya karanlık görünüm</div>
      </div>
      <div className="flex items-center gap-1 rounded-full bg-fill p-1">
        <button
          onClick={() => setTheme('light')}
          aria-pressed={theme === 'light'}
          aria-label="Açık tema"
          className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-bold transition-colors ${
            theme === 'light' ? 'bg-panel text-ink shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-t3 hover:text-ink'
          }`}
        >
          <SunIcon />
          Açık
        </button>
        <button
          onClick={() => setTheme('dark')}
          aria-pressed={theme === 'dark'}
          aria-label="Karanlık tema"
          className={`flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-bold transition-colors ${
            theme === 'dark' ? 'bg-panel text-ink shadow-[0_1px_3px_rgba(0,0,0,0.3)]' : 'text-t3 hover:text-ink'
          }`}
        >
          <MoonIcon />
          Karanlık
        </button>
      </div>
    </div>
  );
}
