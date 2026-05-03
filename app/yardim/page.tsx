import type { Metadata } from 'next';
import Link from 'next/link';
import { FORMATIONS } from '@/lib/formation-content';
import { SIGNALS } from '@/lib/signal-content';

export const metadata: Metadata = {
  title: 'Yardım & Eğitim — BistAI',
  description: 'Teknik analiz formasyonları, sinyal yorumlama ve risk yönetimi rehberi.',
};

export default function YardimPage() {
  const bullish = FORMATIONS.filter((f) => f.direction === 'bullish');
  const bearish = FORMATIONS.filter((f) => f.direction === 'bearish');
  const both    = FORMATIONS.filter((f) => f.direction === 'both');

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Yardım & Eğitim</h1>
          <p className="text-text-secondary">
            BistAI'da kullanılan teknik analiz yöntemleri, formasyonlar ve sinyal rehberi.
          </p>
        </div>

        {/* Formasyonlar bölümü */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">📐</span>
            <h2 className="text-lg font-bold text-text-primary">Teknik Formasyon Rehberi</h2>
          </div>
          <p className="text-sm text-text-secondary mb-6">
            7 klasik teknik formasyon — her biri grafiğin hangi yöne gidebileceğini,
            giriş/çıkış kurallarını ve Bulkowski istatistiklerini içerir.
          </p>

          {/* Bullish */}
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-3">
              📈 Yukarı Yönlü Formasyonlar
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {bullish.map((f) => (
                <FormationCard key={f.id} formation={f} />
              ))}
            </div>
          </div>

          {/* Bearish */}
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400 mb-3">
              📉 Aşağı Yönlü Formasyonlar
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {bearish.map((f) => (
                <FormationCard key={f.id} formation={f} />
              ))}
            </div>
          </div>

          {/* Both */}
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-3">
              ↕️ İki Yönlü Formasyonlar
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {both.map((f) => (
                <FormationCard key={f.id} formation={f} />
              ))}
            </div>
          </div>
        </section>

        {/* Sinyaller bölümü */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">🔔</span>
            <h2 className="text-lg font-bold text-text-primary">Sinyal Rehberi</h2>
          </div>
          <p className="text-sm text-text-secondary mb-4">
            13 sinyal türü — her biri ne anlama gelir, güvenilirliği, trade kuralları.
          </p>

          {/* Öncü (Leading) */}
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-2">
              ⚡ Öncü Sinyaller — hareketten önce uyarır
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SIGNALS.filter(s => s.category === 'leading').map(s => (
                <SignalCard key={s.id} signal={s} />
              ))}
            </div>
          </div>

          {/* Klasik */}
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
              📊 Klasik Sinyaller — onay sinyalleri
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SIGNALS.filter(s => s.category === 'klasik').map(s => (
                <SignalCard key={s.id} signal={s} />
              ))}
            </div>
          </div>

          {/* Pre-signal */}
          <div className="mb-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary mb-2">
              ⚡ Pre-Sinyaller — klasik sinyallerden önce uyarır
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SIGNALS.filter(s => s.category === 'pre-signal').map(s => (
                <SignalCard key={s.id} signal={s} />
              ))}
            </div>
          </div>
        </section>

        {/* Diğer konular */}
        <section className="grid gap-4 sm:grid-cols-3">
          <QuickLink
            href="/yardim/sinyaller"
            icon="🔔"
            title="Sinyal Rehberi"
            desc="19 sinyal türü — ne anlama gelir, nasıl kullanılır"
          />
          <QuickLink
            href="/yardim/risk-yonetimi"
            icon="🛡️"
            title="Risk Yönetimi"
            desc="%1 kuralı, stop-loss disiplini, pozisyon büyüklüğü"
          />
          <QuickLink
            href="/yardim/nasil-kullanilir"
            icon="📖"
            title="Nasıl Kullanılır?"
            desc="BistAI'da yatırım yaparken dikkat edilecekler"
          />
        </section>

        <p className="mt-10 text-center text-[11px] text-text-muted/60">
          * Bu rehber genel eğitim amaçlıdır. Yatırım tavsiyesi değildir.
          Tüm kararlar yatırımcının sorumluluğundadır.
        </p>
      </main>
    </div>
  );
}

function SignalCard({ signal }: { signal: (typeof SIGNALS)[0] }) {
  const reliabilityColor =
    signal.reliability === 'leading'    ? 'text-emerald-400' :
    signal.reliability === 'coincident' ? 'text-amber-400' :
    'text-orange-400';

  return (
    <Link
      href={`/yardim/sinyaller/${signal.id}`}
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 hover:border-primary/40 hover:bg-surface/80 transition-all"
    >
      <span className="text-lg shrink-0">{signal.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-text-primary group-hover:text-primary transition-colors truncate">
          {signal.name}
        </p>
        <p className={`text-[10px] ${reliabilityColor}`}>
          {signal.reliabilityLabel.split('—')[0].trim()}
        </p>
      </div>
      <span className="text-[10px] text-text-muted shrink-0">→</span>
    </Link>
  );
}

function FormationCard({ formation }: { formation: (typeof FORMATIONS)[0] }) {
  const dirColor =
    formation.direction === 'bullish' ? 'text-emerald-400 border-emerald-500/25 bg-emerald-500/5' :
    formation.direction === 'bearish' ? 'text-red-400 border-red-500/25 bg-red-500/5' :
    'text-amber-400 border-amber-500/25 bg-amber-500/5';

  return (
    <Link
      href={`/yardim/formasyonlar/${formation.id}`}
      className="group rounded-xl border border-border bg-surface p-4 hover:border-primary/40 hover:bg-surface/80 transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{formation.emoji}</span>
          <div>
            <p className="text-sm font-bold text-text-primary group-hover:text-primary transition-colors">
              {formation.name}
            </p>
            <p className="text-[10px] text-text-muted">{formation.englishName}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${dirColor}`}>
          {formation.successRate}% başarı
        </span>
      </div>

      <div className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${dirColor} mb-2`}>
        {formation.directionLabel}
      </div>

      <p className="text-[11px] text-text-secondary leading-snug line-clamp-2">
        {formation.directionDetail.split('.')[0]}.
      </p>

      <p className="mt-2 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
        Detaylı incele →
      </p>
    </Link>
  );
}

function QuickLink({ href, icon, title, desc }: { href: string; icon: string; title: string; desc: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-border bg-surface/50 p-4 hover:border-primary/40 hover:bg-surface transition-all group"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-sm font-semibold text-text-primary group-hover:text-primary transition-colors mb-1">{title}</p>
      <p className="text-[11px] text-text-secondary leading-snug">{desc}</p>
    </Link>
  );
}
