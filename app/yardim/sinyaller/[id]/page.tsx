import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSignal, SIGNAL_IDS, SIGNALS } from '@/lib/signal-content';

export function generateStaticParams() {
  return SIGNAL_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const s = getSignal(params.id);
  if (!s) return { title: 'Sinyal Bulunamadı' };
  return {
    title: `${s.name} — BistAI Sinyal Rehberi`,
    description: `${s.name} sinyali nedir? ${s.directionDetail.slice(0, 120)}`,
  };
}

export default function SinyalDetayPage({ params }: { params: { id: string } }) {
  const signal = getSignal(params.id);
  if (!signal) notFound();

  const dirColor =
    signal.direction === 'bullish' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
    signal.direction === 'bearish' ? 'bg-red-500/10 border-red-500/30 text-red-300' :
    signal.direction === 'neutral' ? 'bg-zinc-500/10 border-zinc-500/30 text-zinc-300' :
    'bg-amber-500/10 border-amber-500/30 text-amber-300';

  const reliabilityColor =
    signal.reliability === 'leading'    ? 'text-emerald-400' :
    signal.reliability === 'coincident' ? 'text-amber-400' :
    'text-orange-400';

  const others = SIGNALS.filter((s) => s.id !== signal.id).slice(0, 8);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-8">

        {/* Breadcrumb */}
        <div className="mb-5 flex items-center gap-2 text-sm text-text-secondary">
          <Link href="/yardim" className="hover:text-primary transition-colors">Yardım</Link>
          <span>/</span>
          <Link href="/yardim" className="hover:text-primary transition-colors">Sinyaller</Link>
          <span>/</span>
          <span className="text-text-primary">{signal.name}</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Ana içerik */}
          <div className="lg:col-span-2 space-y-6">

            {/* Başlık */}
            <div className="flex items-start gap-3">
              <span className="text-4xl">{signal.emoji}</span>
              <div>
                <h1 className="text-2xl font-bold text-text-primary">{signal.name}</h1>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                    {signal.categoryLabel}
                  </span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${dirColor}`}>
                    {signal.directionLabel}
                  </span>
                  <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] text-text-muted">
                    Vade: {signal.vade}
                  </span>
                </div>
              </div>
            </div>

            {/* 🎯 Grafik hangi yöne gider? */}
            <div className={`rounded-xl border p-5 ${dirColor}`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">🎯</span>
                <div>
                  <p className="text-sm font-bold mb-2">Grafik hangi yöne gidebilir?</p>
                  <p className="text-sm leading-relaxed">{signal.directionDetail}</p>
                </div>
              </div>
            </div>

            {/* Sinyal Güvenilirliği */}
            <div className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                    Sinyal Tipi
                  </p>
                  <p className={`text-sm font-bold ${reliabilityColor}`}>
                    {signal.reliabilityLabel}
                  </p>
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1">
                    Kullandığı Gösterge
                  </p>
                  <p className="text-sm text-text-secondary font-medium">{signal.indicator}</p>
                </div>
              </div>
              {signal.reliability === 'lagging' && (
                <div className="mt-3 rounded-lg border border-orange-500/25 bg-orange-500/8 px-3 py-2">
                  <p className="text-[11px] text-orange-300">
                    ⚠️ <strong>Gecikmeli sinyal:</strong> Fiyat hareket ettikten sonra tetiklenir.
                    Pre-signal versiyonu ile daha erken giriş yapmayı düşün.
                  </p>
                </div>
              )}
            </div>

            {/* Nedir? */}
            <Card title="Bu sinyal nedir?">
              <p className="text-sm text-text-secondary leading-relaxed">{signal.description}</p>
            </Card>

            {/* Nasıl Çalışır? */}
            <Card title="Nasıl çalışır?">
              <p className="text-sm text-text-secondary leading-relaxed">{signal.howItWorks}</p>
            </Card>

            {/* Ne Zaman Aksiyon? */}
            <Card title="Ne zaman aksiyon almalıyım?">
              <ul className="space-y-2">
                {signal.whenToAct.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                    <span className="shrink-0 mt-0.5 h-4 w-4 rounded-full bg-primary/20 text-primary text-[10px] flex items-center justify-center font-bold">
                      {i + 1}
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </Card>

            {/* Trade Kuralları */}
            <Card title="Trade Kuralları">
              <div className="grid gap-3 sm:grid-cols-3">
                <RuleBlock label="Giriş" value={signal.tradeRule.entry} color="bg-primary/10 border-primary/30 text-primary" />
                <RuleBlock label="Stop-Loss" value={signal.tradeRule.stop} color="bg-red-500/10 border-red-500/30 text-red-300" />
                <RuleBlock label="Hedef" value={signal.tradeRule.target} color="bg-emerald-500/10 border-emerald-500/30 text-emerald-300" />
              </div>
            </Card>

            {/* Yaygın Yanlışlar */}
            <Card title="⚠️ Yaygın Yanlışlar">
              <ul className="space-y-2">
                {signal.commonMistakes.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                    <span className="shrink-0 text-amber-400">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </Card>

            {/* BistAI'da Nasıl Görünür */}
            <Card title="📱 BistAI'da Nasıl Görünür?">
              <p className="text-sm text-text-secondary leading-relaxed">{signal.bistaiNote}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/tarama" className="rounded-lg bg-primary/15 border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25 transition-colors">
                  Sinyal Taraması →
                </Link>
                <Link href="/firsatlar" className="rounded-lg bg-surface border border-border px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors">
                  Fırsatlar →
                </Link>
              </div>
            </Card>

            <p className="text-[10px] text-text-muted/60 italic">
              * Yatırım tavsiyesi değildir. Geçmiş sinyaller gelecek performansı garanti etmez.
            </p>
          </div>

          {/* Sağ panel */}
          <div className="space-y-4">
            {/* Özet */}
            <div className="rounded-xl border border-border bg-surface p-4 sticky top-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">Hızlı Özet</p>
              <div className="space-y-3">
                <StatRow label="Kategori" value={signal.category === 'leading' ? '⚡ Öncü' : signal.category === 'pre-signal' ? '⚡ Pre-Signal' : '📊 Klasik'} />
                <StatRow label="Yön" value={signal.directionLabel.split(' ').slice(0,3).join(' ')} />
                <StatRow label="Vade" value={signal.vade} />
                <StatRow
                  label="Güvenilirlik"
                  value={signal.reliabilityLabel.split('—')[0].trim()}
                  valueClass={reliabilityColor}
                />
                <StatRow label="Gösterge" value={signal.indicator.split('(')[0].trim()} />
              </div>
            </div>

            {/* Diğer sinyaller */}
            <div className="rounded-xl border border-border bg-surface/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">Diğer Sinyaller</p>
              <div className="space-y-1">
                {others.map((s) => (
                  <Link
                    key={s.id}
                    href={`/yardim/sinyaller/${s.id}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors group"
                  >
                    <span className="text-sm">{s.emoji}</span>
                    <span className="flex-1 text-xs text-text-secondary group-hover:text-primary transition-colors truncate">
                      {s.name}
                    </span>
                    <span className={`text-[10px] font-semibold shrink-0 ${
                      s.category === 'leading' ? 'text-emerald-400' :
                      s.category === 'pre-signal' ? 'text-primary' :
                      'text-text-muted'
                    }`}>
                      {s.category === 'leading' ? '⚡' : s.category === 'pre-signal' ? '⚡' : '📊'}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">{title}</p>
      {children}
    </div>
  );
}

function RuleBlock({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`rounded-lg border p-3 ${color}`}>
      <p className="text-[9px] font-semibold uppercase tracking-wider opacity-70 mb-1">{label}</p>
      <p className="text-xs font-medium leading-snug">{value}</p>
    </div>
  );
}

function StatRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-muted">{label}</span>
      <span className={`font-semibold text-right ml-2 ${valueClass ?? 'text-text-primary'}`}>{value}</span>
    </div>
  );
}
