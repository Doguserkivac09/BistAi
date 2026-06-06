'use client'

import { useEffect, useState } from 'react'
import { Compass, TrendingUp, Newspaper, Info, ExternalLink } from 'lucide-react'
import type { AnalystMomentum, GrowthQuality, ForwardVerdict } from '@/lib/forward-outlook'
import type { CatalystNews } from '@/lib/news-catalyst'

interface ApiResp {
  available: boolean
  analyst?: AnalystMomentum
  growthQuality?: GrowthQuality
  verdict?: ForwardVerdict | null
  catalysts?: CatalystNews[]
  peerReliable?: boolean
}

const VERDICT_STYLE: Record<string, { border: string; bg: string; text: string }> = {
  firsat: { border: 'border-emerald-500/40', bg: 'bg-emerald-500/10', text: 'text-emerald-300' },
  'pahali-hakli': { border: 'border-sky-500/40', bg: 'bg-sky-500/10', text: 'text-sky-300' },
  tuzak: { border: 'border-amber-500/40', bg: 'bg-amber-500/10', text: 'text-amber-300' },
  'pahali-gerceksiz': { border: 'border-red-500/40', bg: 'bg-red-500/10', text: 'text-red-300' },
}

export default function GelecekGorunumu({ sembol, market }: { sembol: string; market: 'BIST' | 'US' }) {
  const [data, setData] = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (market === 'US') { setData({ available: false }); setLoading(false); return }
    let alive = true
    setLoading(true)
    fetch(`/api/forward-outlook?symbol=${encodeURIComponent(sembol)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d) })
      .catch(() => { if (alive) setData({ available: false }) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [sembol, market])

  if (market === 'US') return null
  if (!loading && (!data || !data.available || !data.growthQuality)) return null

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
        <Compass className="w-3.5 h-3.5" />
        İleriye Dönük Görünüm
        <span className="text-text-muted/50 normal-case tracking-normal">(büyüme-düzeltilmiş)</span>
        <span className="flex-1 h-px bg-border/50" />
      </p>

      {loading || !data?.growthQuality ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">Yükleniyor…</div>
      ) : (
        <OutlookCard
          verdict={data.verdict ?? null}
          gq={data.growthQuality}
          analyst={data.analyst}
          catalysts={data.catalysts ?? []}
        />
      )}
    </div>
  )
}

function OutlookCard({
  verdict, gq, analyst, catalysts,
}: {
  verdict: ForwardVerdict | null
  gq: GrowthQuality
  analyst?: AnalystMomentum
  catalysts: CatalystNews[]
}) {
  const vs = verdict ? VERDICT_STYLE[verdict.cell] : null
  return (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
      {/* Verdict */}
      {verdict && vs ? (
        <div className={`rounded-lg border ${vs.border} ${vs.bg} p-3`}>
          <p className={`text-sm font-bold ${vs.text}`}>{verdict.label}</p>
          <p className="text-xs text-text-secondary mt-1">{verdict.explanation}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-white/5 p-3 text-xs text-text-secondary">
          Sektör görece verisi yetersiz — yalnızca büyüme/analist gösteriliyor.
        </div>
      )}

      {/* Büyüme & Kalite */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" /> Büyüme & Kalite
          </span>
          <span className="text-xs font-mono">
            <span className={gq.score >= 55 ? 'text-emerald-400' : gq.score >= 40 ? 'text-amber-400' : 'text-red-400'}>
              {gq.score}/100
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
          <Stat label="Reel net kâr büyümesi" value={gq.realEarningsGrowth !== null ? `%${(gq.realEarningsGrowth * 100).toFixed(0)}` : '—'} good={gq.realEarningsGrowth !== null && gq.realEarningsGrowth > 0} />
          <Stat label="Marj genişliyor mu" value={gq.marginExpanding === null ? '—' : gq.marginExpanding ? 'Evet' : 'Hayır'} good={gq.marginExpanding === true} />
          <Stat label="ROE (sektöre göre)" value={gq.roeVsSectorPct !== null ? `${gq.roeVsSectorPct > 0 ? '+' : ''}${gq.roeVsSectorPct}%` : (gq.roe !== null ? `%${(gq.roe * 100).toFixed(0)}` : '—')} good={gq.roeVsSectorPct !== null ? gq.roeVsSectorPct > 0 : (gq.roe ?? 0) > 0.15} />
          <Stat label="Gelir büyümesi" value={gq.revenueGrowth !== null ? `%${(gq.revenueGrowth * 100).toFixed(0)}` : '—'} good={(gq.revenueGrowth ?? 0) > 0} />
        </div>
      </div>

      {/* Analist momentum */}
      {analyst && (analyst.recommendationLabel || analyst.targetUpside !== null) && (
        <div className="border-t border-border pt-3">
          <span className="text-sm font-semibold text-text-primary">Analist Konsensüsü</span>
          <div className="flex items-center gap-3 mt-1.5 text-xs">
            {analyst.recommendationLabel && (
              <span className={`font-semibold ${/Al/.test(analyst.recommendationLabel) ? 'text-emerald-400' : /Sat/.test(analyst.recommendationLabel) ? 'text-red-400' : 'text-amber-400'}`}>
                {analyst.recommendationLabel}
              </span>
            )}
            {analyst.targetUpside !== null && (
              <span className="text-text-secondary">
                Hedef getiri: <span className={analyst.targetUpside >= 0 ? 'text-emerald-400' : 'text-red-400'}>%{analyst.targetUpside}</span>
              </span>
            )}
            {analyst.numAnalysts !== null && (
              <span className="text-text-muted">{analyst.numAnalysts} analist</span>
            )}
          </div>
        </div>
      )}

      {/* Sözleşme / iş anlaşması katalisti */}
      {catalysts.length > 0 && (
        <div className="border-t border-border pt-3">
          <span className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <Newspaper className="w-4 h-4 text-purple-300" /> Yeni İş Anlaşması Sinyalleri
          </span>
          <ul className="mt-2 space-y-1.5">
            {catalysts.map((c, i) => (
              <li key={i}>
                <a href={c.link} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-text-secondary hover:text-sky-300 flex items-start gap-1.5 group">
                  <span className="mt-0.5 text-purple-300/60">•</span>
                  <span className="flex-1">{c.baslik}</span>
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 flex-shrink-0 mt-0.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10px] text-text-muted/70 flex items-start gap-1">
        <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
        Gerçek sipariş defteri (bakiye sözleşme tutarı) ücretsiz veride yoktur; net kâr büyümesi,
        analist ve haberle proxy'lenir. Tek başına yatırım tavsiyesi değildir.
      </p>
    </div>
  )
}

function Stat({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className={`font-mono font-semibold ${good ? 'text-emerald-400' : 'text-text-primary'}`}>{value}</span>
    </div>
  )
}
