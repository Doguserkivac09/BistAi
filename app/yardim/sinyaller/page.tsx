import type { Metadata } from 'next';
import Link from 'next/link';
import { SIGNALS } from '@/lib/signal-content';

export const metadata: Metadata = {
  title: 'Sinyal Rehberi — BistAI',
  description: '13 teknik sinyal türü — leading/lagging/pre-signal kategorileri, yön analizi ve trade kuralları.',
};

const CATEGORIES = [
  {
    key: 'leading',
    label: '⚡ Öncü Sinyaller',
    desc: 'Fiyat hareket etmeden ÖNCE uyarır — erken giriş fırsatı',
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    bgColor: 'bg-emerald-500/5',
  },
  {
    key: 'klasik',
    label: '📊 Klasik Sinyaller',
    desc: 'Trend onayı — güvenilir ama biraz gecikmeli',
    color: 'text-text-secondary',
    borderColor: 'border-border',
    bgColor: 'bg-surface/50',
  },
  {
    key: 'pre-signal',
    label: '⚡ Pre-Sinyaller',
    desc: 'Klasik sinyallerin oluşmadan önce uyarısı — daha erken giriş',
    color: 'text-primary',
    borderColor: 'border-primary/30',
    bgColor: 'bg-primary/5',
  },
] as const;

export default function SinyallerPage() {
  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-4xl px-4 py-8">

        <div className="mb-5 flex items-center gap-2 text-sm text-text-secondary">
          <Link href="/yardim" className="hover:text-primary transition-colors">Yardım</Link>
          <span>/</span>
          <span className="text-text-primary">Sinyal Rehberi</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-2">🔔 Sinyal Rehberi</h1>
          <p className="text-text-secondary">
            BistAI'da kullanılan 13 teknik sinyal — ne anlama gelir, grafik hangi yöne gidebilir,
            nasıl kullanılır.
          </p>
        </div>

        {/* Sinyal tipi karşılaştırma tablosu */}
        <div className="mb-8 rounded-xl border border-border bg-surface p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">
            Sinyal Kategorileri Karşılaştırması
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {CATEGORIES.map((cat) => (
              <div key={cat.key} className={`rounded-lg border p-3 ${cat.borderColor} ${cat.bgColor}`}>
                <p className={`text-xs font-bold mb-1 ${cat.color}`}>{cat.label}</p>
                <p className="text-[11px] text-text-secondary leading-snug">{cat.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Her kategori */}
        {CATEGORIES.map((cat) => {
          const sigs = SIGNALS.filter((s) => s.category === cat.key);
          return (
            <section key={cat.key} className="mb-8">
              <div className={`flex items-center gap-2 mb-3`}>
                <h2 className={`text-sm font-bold ${cat.color}`}>{cat.label}</h2>
                <span className="text-[11px] text-text-muted">— {cat.desc}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {sigs.map((s) => (
                  <Link
                    key={s.id}
                    href={`/yardim/sinyaller/${s.id}`}
                    className="group rounded-xl border border-border bg-surface p-4 hover:border-primary/40 hover:bg-surface/80 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{s.emoji}</span>
                        <div>
                          <p className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors">
                            {s.name}
                          </p>
                          <p className="text-[10px] text-text-muted">{s.indicator.split('(')[0].trim()}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 text-[10px] font-semibold ${
                        s.direction === 'bullish' ? 'text-emerald-400' :
                        s.direction === 'bearish' ? 'text-red-400' :
                        s.direction === 'neutral' ? 'text-zinc-400' : 'text-amber-400'
                      }`}>
                        {s.vade}
                      </span>
                    </div>
                    <p className="text-[11px] text-text-secondary leading-snug line-clamp-2">
                      {s.directionDetail.split('.')[0]}.
                    </p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        <p className="text-[10px] text-text-muted/60 text-center italic mt-8">
          * Tüm içerikler eğitim amaçlıdır. Yatırım tavsiyesi değildir.
        </p>
      </main>
    </div>
  );
}
