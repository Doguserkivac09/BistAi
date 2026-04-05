'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Newspaper, Calendar, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TabHaberler } from './TabHaberler';
import { TabTakvim }   from './TabTakvim';
import { TabKap }      from './TabKap';

type Tab = 'haberler' | 'takvim' | 'kap';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'haberler', label: 'Haberler',        icon: Newspaper },
  { id: 'takvim',   label: 'Ekonomi Takvimi', icon: Calendar  },
  { id: 'kap',      label: 'KAP Duyuruları',  icon: FileText  },
];

function GundemHub() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const activeTab    = (searchParams.get('tab') as Tab | null) ?? 'haberler';

  function switchTab(tab: Tab) {
    router.push(`/haberler?tab=${tab}`, { scroll: false });
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-4xl">

        {/* Başlık */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Gündem Merkezi</h1>
          <p className="mt-1 text-sm text-text-secondary/70">
            Haberler · Ekonomi Takvimi · KAP Bildirimleri tek çatı altında
          </p>
        </div>

        {/* Tab bar */}
        <div className="mb-7 flex gap-1 rounded-xl border border-border bg-surface/50 p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => switchTab(id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                activeTab === id
                  ? 'bg-surface shadow text-text-primary'
                  : 'text-text-muted hover:text-text-secondary'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{id === 'haberler' ? 'Haberler' : id === 'takvim' ? 'Takvim' : 'KAP'}</span>
            </button>
          ))}
        </div>

        {/* İçerik */}
        {activeTab === 'haberler' && <TabHaberler />}
        {activeTab === 'takvim'   && <TabTakvim />}
        {activeTab === 'kap'      && <TabKap />}
      </div>
    </div>
  );
}

export default function HaberlerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-surface" />
          <div className="h-12 animate-pulse rounded-xl bg-surface" />
          <div className="space-y-3">
            {[1,2,3,4,5].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />)}
          </div>
        </div>
      </div>
    }>
      <GundemHub />
    </Suspense>
  );
}
