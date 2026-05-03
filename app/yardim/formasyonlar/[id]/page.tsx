import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getFormation, FORMATION_IDS, FORMATIONS } from '@/lib/formation-content';

export function generateStaticParams() {
  return FORMATION_IDS.map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const f = getFormation(params.id);
  if (!f) return { title: 'Formasyon Bulunamadı' };
  return {
    title: `${f.name} (${f.englishName}) — BistAI Eğitim`,
    description: `${f.name} teknik formasyon rehberi: nasıl tanınır, başarı oranı, trade kuralları. ${f.directionPercentage}.`,
  };
}

export default function FormasyonDetayPage({ params }: { params: { id: string } }) {
  const formation = getFormation(params.id);
  if (!formation) notFound();

  const dirBg =
    formation.direction === 'bullish' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' :
    formation.direction === 'bearish' ? 'bg-red-500/10 border-red-500/30 text-red-300' :
    'bg-amber-500/10 border-amber-500/30 text-amber-300';

  const successColor =
    formation.successRate >= 75 ? 'text-emerald-400' :
    formation.successRate >= 60 ? 'text-amber-400' : 'text-orange-400';

  // Diğer formasyonlar (sağ panel için)
  const others = FORMATIONS.filter((f) => f.id !== formation.id).slice(0, 6);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-5xl px-4 py-8">

        {/* Breadcrumb */}
        <div className="mb-5 flex items-center gap-2 text-sm text-text-secondary">
          <Link href="/yardim" className="hover:text-primary transition-colors">Yardım</Link>
          <span>/</span>
          <Link href="/yardim" className="hover:text-primary transition-colors">Formasyonlar</Link>
          <span>/</span>
          <span className="text-text-primary">{formation.name}</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Ana İçerik */}
          <div className="lg:col-span-2 space-y-6">

            {/* Başlık */}
            <div>
              <div className="flex items-start gap-3 mb-3">
                <span className="text-4xl">{formation.emoji}</span>
                <div>
                  <h1 className="text-2xl font-bold text-text-primary">{formation.name}</h1>
                  <p className="text-sm text-text-muted">{formation.englishName}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${dirBg}`}>
                      {formation.directionLabel}
                    </span>
                    <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] text-text-muted">
                      {formation.typeLabel}
                    </span>
                    <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] text-text-muted">
                      Vade: {formation.vade}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* SVG Diagram */}
            <div className="rounded-xl border border-border bg-surface/50 p-6">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-4">
                Formasyon Şeması
              </p>
              <svg
                viewBox={formation.svgData.viewBox}
                className="w-full max-w-sm mx-auto"
                style={{ height: 140 }}
                aria-label={`${formation.name} formasyon diyagramı`}
              >
                {/* Arka plan ızgarası */}
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#ffffff08" strokeWidth="1"/>
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />

                {/* Path'ler */}
                {formation.svgData.paths.map((p, i) => (
                  <path
                    key={i}
                    d={p.d}
                    stroke={p.stroke}
                    strokeWidth={p.strokeWidth ?? 2}
                    fill={p.fill ?? 'none'}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={p.strokeDasharray}
                  />
                ))}

                {/* Circle'lar */}
                {formation.svgData.circles?.map((c, i) => (
                  <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={c.fill} />
                ))}

                {/* Text'ler */}
                {formation.svgData.texts?.map((t, i) => (
                  <text
                    key={i}
                    x={t.x}
                    y={t.y}
                    fill={t.fill ?? '#94a3b8'}
                    fontSize={t.fontSize ?? 10}
                    fontFamily="ui-monospace, monospace"
                    fontWeight="600"
                  >
                    {t.text}
                  </text>
                ))}
              </svg>
            </div>

            {/* 🎯 GRAFİK HANGI YÖNE GİDEBİLİR? */}
            <div className={`rounded-xl border p-5 ${dirBg}`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">🎯</span>
                <div className="flex-1">
                  <p className="text-sm font-bold mb-1.5">Grafik hangi yöne gidebilir?</p>
                  <p className="text-sm leading-relaxed mb-3">{formation.directionDetail}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-lg font-bold tabular-nums ${successColor}`}>
                      %{formation.successRate}
                    </span>
                    <span className="text-[11px] opacity-80">başarı oranı</span>
                    <span className="text-[10px] opacity-60 ml-2">— {formation.successNote}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Nedir? */}
            <Card title="Bu nedir?">
              <p className="text-sm text-text-secondary leading-relaxed">{formation.description}</p>
            </Card>

            {/* Nasıl tanırım? */}
            <Card title="Nasıl tanırım?">
              <ul className="space-y-2">
                {formation.howToSpot.map((item, i) => (
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
              <div className="grid grid-cols-2 gap-3">
                <RuleBlock label="Giriş Noktası" value={formation.tradeRule.entry} color="bg-primary/10 border-primary/30 text-primary" />
                <RuleBlock label="Stop-Loss" value={formation.tradeRule.stop} color="bg-red-500/10 border-red-500/30 text-red-300" />
                <RuleBlock label="Hedef" value={formation.tradeRule.target} color="bg-emerald-500/10 border-emerald-500/30 text-emerald-300" />
                <RuleBlock label="R/R Oranı" value={formation.tradeRule.rr} color="bg-amber-500/10 border-amber-500/30 text-amber-300" />
              </div>
            </Card>

            {/* Yaygın Yanlışlar */}
            <Card title="⚠️ Yaygın Yanlışlar">
              <ul className="space-y-2">
                {formation.commonMistakes.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                    <span className="shrink-0 text-amber-400">→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </Card>

            {/* BistAI'da Nasıl Görünür */}
            <Card title="📱 BistAI'da Nasıl Görünür?">
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">🤖</span>
                <p className="text-sm text-text-secondary leading-relaxed">{formation.bistaiNote}</p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link
                  href="/tarama"
                  className="rounded-lg bg-primary/15 border border-primary/30 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/25 transition-colors"
                >
                  Sinyal Taraması →
                </Link>
                <Link
                  href="/firsatlar"
                  className="rounded-lg bg-surface border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
                >
                  Fırsatlar →
                </Link>
              </div>
            </Card>

            {/* Yasal Uyarı */}
            <p className="text-[10px] text-text-muted/60 leading-relaxed italic">
              * Bu içerik yalnızca eğitim amaçlıdır. Yatırım tavsiyesi değildir.
              Geçmiş performans gelecekteki sonuçları garanti etmez.
              Tüm yatırım kararları kişinin sorumluluğundadır.
            </p>

          </div>

          {/* Sağ Panel */}
          <div className="space-y-4">

            {/* İstatistik Kartı */}
            <div className="rounded-xl border border-border bg-surface p-4 sticky top-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">
                Hızlı Özet
              </p>
              <div className="space-y-3">
                <StatRow label="Tür" value={formation.typeLabel} />
                <StatRow label="Yön" value={formation.directionLabel} />
                <StatRow
                  label="Başarı Oranı"
                  value={`%${formation.successRate}`}
                  valueClass={successColor}
                />
                <StatRow label="Tipik Vade" value={formation.vade} />
                <StatRow label="R/R" value={formation.tradeRule.rr} />
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-[10px] text-text-muted/70">
                  Kaynak: Bulkowski "Encyclopedia of Chart Patterns" 2. Baskı
                </p>
              </div>
            </div>

            {/* Diğer Formasyonlar */}
            <div className="rounded-xl border border-border bg-surface/50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">
                Diğer Formasyonlar
              </p>
              <div className="space-y-2">
                {others.map((f) => (
                  <Link
                    key={f.id}
                    href={`/yardim/formasyonlar/${f.id}`}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 transition-colors group"
                  >
                    <span className="text-base">{f.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-secondary group-hover:text-primary transition-colors truncate">
                        {f.name}
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold ${
                      f.direction === 'bullish' ? 'text-emerald-400' :
                      f.direction === 'bearish' ? 'text-red-400' : 'text-amber-400'
                    }`}>
                      %{f.successRate}
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

// ── Alt Bileşenler ─────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-3">
        {title}
      </p>
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
      <span className={`font-semibold ${valueClass ?? 'text-text-primary'}`}>{value}</span>
    </div>
  );
}
