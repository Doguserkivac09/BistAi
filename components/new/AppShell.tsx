'use client';

/**
 * Yeni modern-minimalist kabuk (design_handoff_bistai → design_handoff_bugun_v3).
 *
 * Masaüstü: sol menü **ayrı yuvarlak ada** (sayfa ile birlikte kayar, ayrıca
 * kaydırılmaz) + üst bar. Bugün ekranında üst bar YOK — ekran kendi selamlama
 * başlığını ve ortalanmış cam aramasını taşır (v3: "Günaydın en üstte").
 *
 * Mobil (v3 bilgi mimarisi): alt panel 5 sekmeden **3 sekmeye** indi —
 * `Bugün · Portföyüm · Diğer`. "Diğer" alttan tam yükseklik bir pencere açar;
 * içinde tüm modüller gruplu düğmeler olarak durur (bkz. `DigerPenceresi`).
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from '@/components/new/brand';
import { SymbolSearch } from '@/components/new/SymbolSearch';
import { MisafirSeridi } from '@/components/new/MisafirSeridi';
import { MAINTENANCE } from '@/lib/maintenance';
import { borsaDurumu } from '@/lib/bugun-ozet';

interface NavItem {
  href: string;
  label: string;
  ai?: boolean;
  /** Bakımdaki bölüm — link kalır ama durumu görünür (bkz. lib/maintenance.ts) */
  bakim?: boolean;
}

// Sidebar (masaüstü)
const SIDEBAR: NavItem[] = [
  { href: '/bugun', label: 'Bugün' },
  { href: '/firsatlar', label: 'Fırsatlar', bakim: MAINTENANCE.firsatlar },
  { href: '/portfolyo', label: 'Portföyüm' },
  { href: '/makro', label: 'Piyasa' },
  { href: '/viop', label: 'VIOP', bakim: MAINTENANCE.viop },
  { href: '/fonlar', label: 'Fonlar' },
  { href: '/ai-portfoyler', label: 'AI Portföyleri' },
  { href: '/sohbet', label: 'AI Asistan', ai: true },
];

interface DigerItem { href: string; label: string; desc: string; bakim?: boolean }

/**
 * "Diğer" penceresi modülleri.
 *
 * ⚠️ Handoff'taki listeden YALNIZ gerçekten var olan sayfalar alındı. Karşılığı
 * olmayan düğme, kullanıcıyı boş sayfaya ya da 404'e götürür:
 *  - "Takas Analizi" ÇIKARILDI — ücretsiz takas verisi yok (2026-09-12 ölçüldü).
 *  - "Bilanço & Temettü Takvimi" ÇIKARILDI — ayrı bir takvim sayfası yok; yaklaşan
 *    bilançolar Bugün ekranında blok olarak duruyor.
 *  - "Temel Analiz" → mevcut karşılığı olan **Bilanço Kalitesi** taramasına bağlandı.
 *  - "Akademi" → mevcut **Yardım / eğitim merkezi**.
 *  - Masaüstü menüdeki **AI Asistan** mobilde başka hiçbir yerden erişilemiyordu
 *    (eski 5'li alt paneldeydi) → pencereye eklendi.
 */
const DIGER_GRUPLAR: Array<{ title: string; items: DigerItem[] }> = [
  {
    title: 'Analiz',
    items: [
      { href: '/bilanco-tarama', label: 'Bilanço Kalitesi', desc: 'Kâr kalitesi ve risk taraması' },
      { href: '/fonlar', label: 'Fon Analizi', desc: 'TEFAS ve BES karşılaştırma' },
      { href: '/makro', label: 'Sektör Analizi', desc: 'Sektör karşılaştırma' },
      { href: '/tarama', label: 'Hisse Tarama', desc: 'Kendi kriterinle ara' },
    ],
  },
  {
    title: 'Piyasa',
    items: [
      { href: '/makro?tab=gundem', label: 'Haberler', desc: 'KAP ve gündem akışı' },
      { href: '/makro?tab=emtia', label: 'Emtia & Döviz', desc: 'Altın, petrol, kur' },
      { href: '/viop', label: 'VIOP', desc: 'Vadeli işlemler', bakim: MAINTENANCE.viop },
      { href: '/firsatlar', label: 'Fırsatlar', desc: 'Filtrelenmiş liste', bakim: MAINTENANCE.firsatlar },
    ],
  },
  {
    title: 'Kişisel',
    items: [
      { href: '/ai-portfoyler', label: 'AI Portföyleri', desc: 'Aegis, APEX ve diğerleri' },
      { href: '/portfolyo?tab=alarmlar', label: 'Alarmlar', desc: 'Fiyat uyarıları' },
      { href: '/sohbet', label: 'AI Asistan', desc: 'Sorunu sor' },
      { href: '/yardim', label: 'Yardım', desc: 'Eğitim içerikleri' },
    ],
  },
];

/**
 * Borsa durumu çipi. ⚠️ Önceden SABİT "BIST açık" yazıyordu (hafta sonu gece de).
 * İstemcide hesaplanır: sunucu saatiyle ilk boyamada farklı çıkabileceği için
 * mount'a kadar boş kalır (hydration uyuşmazlığı olmasın).
 */
export function MarketChip() {
  const [d, setD] = useState<ReturnType<typeof borsaDurumu> | null>(null);
  useEffect(() => {
    setD(borsaDurumu());
    const t = setInterval(() => setD(borsaDurumu()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!d) return <div className="h-[30px] w-[86px]" aria-hidden />;
  return (
    <div className={`flex items-center gap-[7px] rounded-[10px] px-3 py-[7px] ${d.acik ? 'bg-up-badge' : 'bg-fill'}`}>
      <span className={`h-[7px] w-[7px] rounded-full ${d.acik ? 'bg-up' : 'bg-t4'}`} />
      <span className={`font-manrope text-[11px] font-bold ${d.acik ? 'text-up' : 'text-t2'}`}>{d.etiket}</span>
    </div>
  );
}

function DigerPenceresi({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Escape kapatır; açıkken arka sayfa kaymaz (iOS'ta pencere içi kaydırma sayfayı sürüklemesin).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onceki = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = onceki;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Diğer sayfalar">
      <button
        aria-label="Pencereyi kapat"
        onClick={onClose}
        className="absolute inset-0 bg-[rgba(15,20,30,0.42)] backdrop-blur-[3px]"
      />
      <div className="ie-sheet absolute inset-x-0 bottom-0 top-[52px] flex flex-col overflow-hidden rounded-t-[28px]">
        <div className="flex justify-center pb-1 pt-2.5">
          <div className="h-1 w-[38px] rounded-full bg-[rgba(15,20,30,0.16)] dark:bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-[18px] pb-3 pt-1.5">
          <div>
            <div className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">Diğer</div>
            <div className="mt-0.5 text-[11px] font-medium text-t3">Tüm analiz ve piyasa sayfaları</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline bg-panel text-[15px] font-semibold text-t2"
          >
            ×
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3.5 pb-8">
          {DIGER_GRUPLAR.map((g) => (
            <div key={g.title}>
              <div className="px-1 pb-2 text-[10px] font-bold uppercase tracking-[0.08em] text-t3">{g.title}</div>
              <div className="grid grid-cols-2 gap-2">
                {g.items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={onClose}
                    className="ie-glass flex min-h-[84px] flex-col gap-1 rounded-[20px] p-3.5"
                  >
                    <span className="mb-1 flex h-[26px] w-[26px] items-center justify-center rounded-[9px] bg-surface-dark">
                      <span className={`h-[9px] w-[9px] rounded-[2px] ${it.bakim ? 'bg-t4' : 'bg-up-on-dark'}`} />
                    </span>
                    <span className="text-[12px] font-bold leading-[1.3] text-ink">{it.label}</span>
                    <span className="text-[10px] font-medium leading-[1.35] text-t3">
                      {it.bakim ? 'Şu an bakımda' : it.desc}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <Link href="/profil" onClick={onClose} className="ie-glass flex items-center gap-2.5 rounded-[20px] px-3.5 py-3">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-ink text-[11px] font-bold text-onink">
              ◐
            </span>
            <span>
              <span className="block text-[12px] font-bold text-ink">Profil</span>
              <span className="block text-[10px] font-medium text-t3">Hesap ve ayarlar</span>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');
  const [digerAcik, setDigerAcik] = useState(false);
  // Sabit referans: pencerenin Escape/kaydırma kilidi efekti her boyamada yeniden kurulmasın.
  const kapat = useCallback(() => setDigerAcik(false), []);

  // Sayfa değişince pencere kapansın (geri tuşu vb. yollarla gezinmede açık kalmasın).
  useEffect(() => { setDigerAcik(false); }, [pathname]);

  // Bugün ekranı kendi başlığını ve aramasını taşır (v3).
  const bugun = pathname === '/bugun';

  // Alt panelde "Diğer", Bugün/Portföyüm dışındaki her sayfada etkin görünür —
  // kullanıcı nerede olduğunu kaybetmesin.
  const altBugun = isActive('/bugun');
  const altPortfoy = isActive('/portfolyo');
  const altDiger = digerAcik || (!altBugun && !altPortfoy);

  const tab = (active: boolean) =>
    `flex flex-1 flex-col items-center gap-[3px] rounded-[14px] py-[9px] text-[11px] transition-colors ${
      active ? 'bg-ink font-bold text-onink' : 'font-semibold text-t2 hover:bg-fill'
    }`;

  return (
    <div className="min-h-screen bg-page font-manrope text-ink">
      {/* Misafir oturumunda en üstte uyarı + hesaba geçiş (yalnız misafirde görünür) */}
      <MisafirSeridi />
      <div className="mx-auto flex min-h-screen w-full lg:items-start lg:gap-2 lg:p-3">
        {/* ── Sidebar (masaüstü): yuvarlak köşeli ayrı ada, sayfa ile kayar ── */}
        <aside className="ie-glass hidden w-[230px] shrink-0 flex-col rounded-[24px] p-4 lg:flex lg:min-h-[calc(100vh-24px)]">
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
                  {it.bakim && (
                    <span className="ml-auto rounded-full bg-fill px-[6px] py-[2px] font-manrope text-[10px] font-semibold text-t3">
                      bakımda
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />
          <Link href="/profil" className="flex items-center gap-[11px] rounded-[13px] p-2.5 hover:bg-fill">
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-ink text-[13px] font-bold text-onink">
              ◐
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-ink">Hesabım</span>
              <span className="block text-[11px] font-medium text-t3">Bireysel hesap</span>
            </span>
          </Link>
        </aside>

        {/* ── Ana alan ── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar (masaüstü) — Bugün dışındaki sayfalarda hızlı sembol arama */}
          {!bugun && (
            <div className="hidden h-[68px] items-center justify-between border-b border-[#f0f1f3] px-7 lg:flex">
              <SymbolSearch className="w-[320px]" />
              <MarketChip />
            </div>
          )}

          {/* Mobil üst bar (logo + chip) — Bugün kendi başlığını taşır */}
          {!bugun && (
            <div className="flex h-[56px] items-center justify-between border-b border-hairline bg-panel px-6 lg:hidden">
              <Link href="/bugun" className="flex items-center">
                <Wordmark size={16} markSize={26} />
              </Link>
              <MarketChip />
            </div>
          )}

          {/* İçerik — mobilde yüzen alt panelin altında kalmasın */}
          <main className="flex-1 pb-28 lg:pb-0">{children}</main>
        </div>
      </div>

      {/* ── Alt panel (mobil): 3 sekme, yüzen cam hap ── */}
      <nav
        aria-label="Ana gezinme"
        className="fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-page from-40% to-transparent px-3.5 pb-3.5 pt-2 lg:hidden"
      >
        <div className="ie-glass flex items-center gap-1.5 rounded-[20px] p-[7px]">
          <Link href="/bugun" className={tab(altBugun && !digerAcik)} aria-current={altBugun ? 'page' : undefined}>
            <span className={`h-[7px] w-[7px] rounded-full ${altBugun && !digerAcik ? 'bg-up-on-dark' : 'bg-[#d4d7dc]'}`} />
            Bugün
          </Link>
          <Link href="/portfolyo" className={tab(altPortfoy && !digerAcik)} aria-current={altPortfoy ? 'page' : undefined}>
            <span className={`h-[7px] w-[7px] rounded-full ${altPortfoy && !digerAcik ? 'bg-up-on-dark' : 'bg-[#d4d7dc]'}`} />
            Portföyüm
          </Link>
          <button onClick={() => setDigerAcik(true)} className={tab(altDiger)} aria-haspopup="dialog" aria-expanded={digerAcik}>
            <span className="flex gap-[2px]">
              {[0, 1, 2].map((i) => (
                <span key={i} className={`h-[3px] w-[3px] rounded-full ${altDiger ? 'bg-onink' : 'bg-t2'}`} />
              ))}
            </span>
            Diğer
          </button>
        </div>
      </nav>

      <DigerPenceresi open={digerAcik} onClose={kapat} />
    </div>
  );
}
