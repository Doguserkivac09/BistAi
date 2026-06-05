'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, AlertTriangle, Info, TrendingUp, TrendingDown } from 'lucide-react'
import type { FundamentalHealth } from '@/lib/fundamental-health'
import type { FinancialYear } from '@/lib/financial-statements'

interface ApiResp {
  available: boolean
  message?: string
  years?: FinancialYear[]
  health?: FundamentalHealth
}

export default function FinansalSaglik({ sembol, market }: { sembol: string; market: 'BIST' | 'US' }) {
  const [data, setData] = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/fundamental-health?symbol=${encodeURIComponent(sembol)}&market=${market}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d) })
      .catch(() => { if (alive) setData({ available: false, message: 'Veri alınamadı.' }) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [sembol, market])

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
        Finansal Sağlık
        <span className="text-text-muted/50 normal-case tracking-normal">(Piotroski · Altman · Trend)</span>
        <span className="flex-1 h-px bg-border/50" />
      </p>

      {loading ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">Yükleniyor…</div>
      ) : !data?.available || !data.health ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary flex items-center gap-2">
          <Info className="w-4 h-4 flex-shrink-0" />
          {data?.message || 'Bu şirket için finansal tablo verisi bulunamadı.'}
        </div>
      ) : (
        <HealthCards health={data.health} years={data.years || []} />
      )}
    </div>
  )
}

function HealthCards({ health, years }: { health: FundamentalHealth; years: FinancialYear[] }) {
  const { piotroski, altman, earningsQuality, trends } = health
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <PiotroskiCard p={piotroski} />
        <AltmanCard a={altman} />
      </div>
      <EarningsTrendCard eq={earningsQuality} trends={trends} years={years} />
    </div>
  )
}

// ── Piotroski ──────────────────────────────────────────────────────────────

function PiotroskiCard({ p }: { p: FundamentalHealth['piotroski'] }) {
  const color = p.score === null ? 'text-text-muted'
    : p.score >= 7 ? 'text-emerald-400' : p.score >= 4 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-text-primary">Piotroski F-Score</span>
        <InfoMini text="9 puanlık finansal güç testi: kârlılık, kaldıraç, verimlilik. ≥7 güçlü, ≤3 zayıf. Değer yatırımında kaliteyi tuzaktan ayırır." />
      </div>
      {!p.applicable ? (
        <p className="text-xs text-text-secondary mt-1">{p.reason}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span className={`text-3xl font-black ${color}`}>{p.score}</span>
            <span className="text-text-muted text-sm">/ {p.max}</span>
            <span className={`text-xs font-semibold ml-1 ${color}`}>
              {p.rating === 'güçlü' ? 'Güçlü' : p.rating === 'orta' ? 'Orta' : 'Zayıf'}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {p.criteria.map((c) => (
              <div key={c.key} className="flex items-center gap-2 text-[11px]">
                <span className={c.pass === null ? 'text-text-muted' : c.pass ? 'text-emerald-400' : 'text-red-400'}>
                  {c.pass === null ? '–' : c.pass ? '✓' : '✗'}
                </span>
                <span className="text-text-secondary">{c.label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Altman ─────────────────────────────────────────────────────────────────

function AltmanCard({ a }: { a: FundamentalHealth['altman'] }) {
  const zoneMap = {
    güvenli: { cls: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Güvenli Bölge', icon: ShieldCheck },
    gri: { cls: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Gri Bölge', icon: AlertTriangle },
    sıkıntı: { cls: 'text-red-400', bg: 'bg-red-500/10', label: 'Sıkıntı Bölgesi', icon: AlertTriangle },
  } as const
  const z = a.zone ? zoneMap[a.zone] : null
  const Icon = z?.icon ?? Info
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-text-primary">Altman Z&apos;&apos;-Score</span>
        <InfoMini text="İflas/finansal sıkıntı riski (gelişmekte olan piyasa varyantı). >2.6 güvenli, 1.1-2.6 gri, <1.1 sıkıntı. Kaldıraçlı/döviz borçlu şirketlerde kritik." />
      </div>
      {!a.applicable ? (
        <p className="text-xs text-text-secondary mt-1">{a.reason}</p>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-2">
            <span className={`text-3xl font-black ${z?.cls}`}>{a.z}</span>
          </div>
          <div className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 ${z?.bg}`}>
            <Icon className={`w-3.5 h-3.5 ${z?.cls}`} />
            <span className={`text-xs font-semibold ${z?.cls}`}>{z?.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 text-[10px] text-text-muted">
            <span>İşletme serm./Varlık: {fmtR(a.components.x1)}</span>
            <span>Dağıtılmamış kâr/Varlık: {fmtR(a.components.x2)}</span>
            <span>EBIT/Varlık: {fmtR(a.components.x3)}</span>
            <span>Özsermaye/Borç: {fmtR(a.components.x4)}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Kazanç kalitesi + trend ──────────────────────────────────────────────────

function EarningsTrendCard({
  eq, trends, years,
}: {
  eq: FundamentalHealth['earningsQuality']
  trends: FundamentalHealth['trends']
  years: FinancialYear[]
}) {
  const eqColor = eq.rating === 'iyi' ? 'text-emerald-400' : eq.rating === 'orta' ? 'text-amber-400' : eq.rating === 'zayıf' ? 'text-red-400' : 'text-text-muted'
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Kazanç kalitesi */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-text-primary">Kazanç Kalitesi</span>
            <InfoMini text="Kârın nakitle desteklenip desteklenmediği. Accruals düşük/negatif = sağlıklı; FCF dönüşümü yüksek = kâr nakde dönüyor." />
            {eq.rating && <span className={`text-xs font-semibold ${eqColor}`}>{eq.rating === 'iyi' ? 'İyi' : eq.rating === 'orta' ? 'Orta' : 'Zayıf'}</span>}
          </div>
          <div className="space-y-1.5 text-xs">
            <Row label="Tahakkuk oranı (accruals)" value={eq.accrualsRatio !== null ? eq.accrualsRatio.toFixed(3) : '—'} good={eq.accrualsRatio !== null && eq.accrualsRatio < 0.05} />
            <Row label="FCF dönüşümü (FCF/net kâr)" value={eq.fcfConversion !== null ? eq.fcfConversion.toFixed(2) : '—'} good={eq.fcfConversion !== null && eq.fcfConversion > 0.6} />
            <Row label="Pozitif FCF yılı" value={`${eq.fcfPositiveYears}/${eq.totalYears}`} good={eq.totalYears > 0 && eq.fcfPositiveYears === eq.totalYears} />
          </div>
        </div>

        {/* Trend */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-semibold text-text-primary">Büyüme & Marj Trendi</span>
            <InfoMini text="Çok yıllı bileşik büyüme (CAGR) ve net kâr marjı trendi. Marj oranı olduğu için enflasyondan bağımsızdır." />
          </div>
          <div className="flex gap-4 mb-2 text-xs">
            <CagrStat label="Gelir CAGR" value={trends.revenueCagr} />
            <CagrStat label="Net Kâr CAGR" value={trends.netIncomeCagr} />
          </div>
          {trends.netMarginTrend.length >= 2 ? (
            <MarginBars data={trends.netMarginTrend} />
          ) : (
            <p className="text-[11px] text-text-muted">Marj trendi için yetersiz veri</p>
          )}
        </div>
      </div>
      {years.length > 0 && (
        <p className="text-[10px] text-text-muted/70 mt-3">
          Kaynak: Yahoo Finance · {years[0].year}–{years[years.length - 1].year} yıllık tablolar
          {' · '}<span className="text-text-muted">TL bazlı (marjlar enflasyondan bağımsız)</span>
        </p>
      )}
    </div>
  )
}

function MarginBars({ data }: { data: Array<{ year: number; value: number }> }) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1)
  return (
    <div className="flex items-end gap-1.5 h-16">
      {data.map((d) => {
        const h = Math.max(4, (Math.abs(d.value) / max) * 56)
        const neg = d.value < 0
        return (
          <div key={d.year} className="flex flex-col items-center gap-1 flex-1" title={`${d.year}: net marj %${d.value}`}>
            <span className="text-[9px] text-text-muted leading-none">%{d.value}</span>
            <div className="w-full rounded-sm" style={{ height: `${h}px`, backgroundColor: neg ? '#ef4444' : '#10b981' }} />
            <span className="text-[9px] text-text-muted/70 leading-none">{String(d.year).slice(2)}</span>
          </div>
        )
      })}
    </div>
  )
}

function CagrStat({ label, value }: { label: string; value: number | null }) {
  const pos = value !== null && value >= 0
  return (
    <div>
      <p className="text-[10px] text-text-muted">{label}</p>
      <p className={`text-sm font-bold flex items-center gap-1 ${value === null ? 'text-text-muted' : pos ? 'text-emerald-400' : 'text-red-400'}`}>
        {value !== null && (pos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />)}
        {value !== null ? `%${value}` : '—'}
      </p>
    </div>
  )
}

function Row({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-mono font-semibold ${good ? 'text-emerald-400' : 'text-text-primary'}`}>{value}</span>
    </div>
  )
}

function InfoMini({ text }: { text: string }) {
  return (
    <span className="text-text-muted/50 cursor-help" title={text} aria-label={text}>
      <Info className="w-3.5 h-3.5" />
    </span>
  )
}

function fmtR(v: number | null): string {
  return v === null ? '—' : v.toFixed(2)
}
