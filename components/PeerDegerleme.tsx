'use client'

import { useEffect, useState } from 'react'
import { Scale, Info } from 'lucide-react'
import type { PeerValuation } from '@/lib/peer-valuation'

interface ApiResp {
  available: boolean
  message?: string
  sectorName?: string
  peer?: PeerValuation
}

export default function PeerDegerleme({ sembol, market }: { sembol: string; market: 'BIST' | 'US' }) {
  const [data, setData] = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (market === 'US') { setData({ available: false }); setLoading(false); return }
    let alive = true
    setLoading(true)
    fetch(`/api/peer-valuation?symbol=${encodeURIComponent(sembol)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d) })
      .catch(() => { if (alive) setData({ available: false }) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [sembol, market])

  // US veya veri yoksa paneli hiç gösterme (Temel tab'ı kalabalıklaştırma)
  if (market === 'US') return null
  if (!loading && (!data || !data.available || !data.peer)) return null

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
        <Scale className="w-3.5 h-3.5" />
        Sektöre Göre Değerleme
        {data?.sectorName && <span className="text-text-muted/50 normal-case tracking-normal">({data.sectorName})</span>}
        <span className="flex-1 h-px bg-border/50" />
      </p>

      {loading || !data?.peer ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">Yükleniyor…</div>
      ) : (
        <PeerCard peer={data.peer} />
      )}
    </div>
  )
}

function PeerCard({ peer }: { peer: PeerValuation }) {
  const labelColor = peer.label === 'sektöre göre ucuz' ? 'text-emerald-400'
    : peer.label === 'sektöre göre pahalı' ? 'text-red-400' : 'text-amber-400'
  const labelBg = peer.label === 'sektöre göre ucuz' ? 'bg-emerald-500/10'
    : peer.label === 'sektöre göre pahalı' ? 'bg-red-500/10' : 'bg-amber-500/10'

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        {peer.reliable ? (
          <div className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 ${labelBg}`}>
            <span className={`text-sm font-bold ${labelColor}`}>{peer.label}</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 bg-white/5">
            <span className="text-sm font-semibold text-text-secondary">Az emsal — yorum zayıf</span>
          </div>
        )}
        <span className="text-[10px] text-text-muted flex items-center gap-1">
          {peer.count} hisse medyanı
          <Info className="w-3 h-3" />
        </span>
      </div>

      <div className="space-y-2">
        <MetricRow label="F/K" m={peer.pe} cheapLow />
        <MetricRow label="F/DD" m={peer.pb} cheapLow />
        <MetricRow label="EV/FAVÖK" m={peer.evEbitda} cheapLow />
        <MetricRow label="ROE (kalite)" m={peer.roe} cheapLow={false} isPct />
      </div>

      <p className="text-[10px] text-text-muted/70 mt-3">
        Değerleme çarpanları sektör medyanının <span className="text-emerald-400">altında</span> = görece ucuz ·
        ROE medyanın <span className="text-emerald-400">üstünde</span> = görece kaliteli. Tek başına alım sinyali değildir.
      </p>
    </div>
  )
}

function MetricRow({
  label, m, cheapLow, isPct = false,
}: {
  label: string
  m: { value: number | null; median: number | null; pctVsMedian: number | null }
  cheapLow: boolean // true: medyan altı iyi (değerleme); false: medyan üstü iyi (ROE)
  isPct?: boolean
}) {
  const fmt = (v: number | null) =>
    v === null ? '—' : isPct ? `%${(v * 100).toFixed(0)}` : v.toFixed(2)

  // İyi/kötü rengi: cheapLow ise negatif pct (medyan altı) iyi; değilse pozitif iyi.
  let good: boolean | null = null
  if (m.pctVsMedian !== null) good = cheapLow ? m.pctVsMedian < 0 : m.pctVsMedian > 0
  const pctColor = good === null ? 'text-text-muted' : good ? 'text-emerald-400' : 'text-red-400'
  const pctText = m.pctVsMedian === null ? '—'
    : `${m.pctVsMedian > 0 ? '+' : ''}${m.pctVsMedian}%`

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-secondary w-24">{label}</span>
      <span className="font-mono text-text-primary flex-1 text-right">{fmt(m.value)}</span>
      <span className="font-mono text-text-muted/60 w-16 text-right">med {fmt(m.median)}</span>
      <span className={`font-mono font-semibold w-16 text-right ${pctColor}`}>{pctText}</span>
    </div>
  )
}
