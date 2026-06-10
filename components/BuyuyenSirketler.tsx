'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { TrendingUp, TrendingDown, Info, AlertTriangle, Loader2 } from 'lucide-react'

// ─── Tipler (API ile uyumlu) ───────────────────────────────────────────────
interface GrowthRow {
  sembol: string
  sector: string
  score: number
  verdict: string
  revenueCagr: number | null
  revenueCagrNominal: number | null
  netIncomeCagr: number | null
  epsCagr: number | null
  marginDeltaPP: number | null
  consistency: number
  epsSeries: Array<{ year: number; value: number }>
  quality: { beneish: string | null; piotroski: number | null; rating: string | null }
  components: { revenue: number; netIncome: number; eps: number; margin: number; consistency: number }
}
interface ApiResp {
  market: string
  updatedAt: string | null
  inflationYoy: number | null
  count: number
  scores: GrowthRow[]
}

type Market = 'BIST' | 'US'

// ─── Yardımcılar ────────────────────────────────────────────────────────────
function pct(v: number | null): string {
  if (v === null || !isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}
function scoreColor(s: number): string {
  if (s >= 75) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30'
  if (s >= 60) return 'text-green-400 bg-green-400/10 border-green-400/30'
  if (s >= 45) return 'text-amber-400 bg-amber-400/10 border-amber-400/30'
  if (s >= 30) return 'text-orange-400 bg-orange-400/10 border-orange-400/30'
  return 'text-red-400 bg-red-400/10 border-red-400/30'
}
function valueColor(v: number | null): string {
  if (v === null) return 'text-text-muted'
  return v > 0 ? 'text-emerald-400' : v < 0 ? 'text-red-400' : 'text-text-secondary'
}
function staleLabel(iso: string | null): { text: string; stale: boolean } | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  const text = days <= 0 ? 'bugün' : days === 1 ? 'dün' : `${days} gün önce`
  return { text, stale: days > 10 }
}

// Mini EPS sparkline (son ~5 yıl)
function Sparkline({ data }: { data: Array<{ year: number; value: number }> }) {
  if (data.length < 2) return <span className="text-text-muted text-xs">—</span>
  const vals = data.map((d) => d.value)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const range = max - min || 1
  const w = 64
  const h = 20
  const pts = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((d.value - min) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const rising = vals[vals.length - 1] >= vals[0]
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke={rising ? '#34d399' : '#f87171'}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function QualityBadge({ q }: { q: GrowthRow['quality'] }) {
  if (q.beneish === 'şüpheli') {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-red-400 bg-red-400/10 border border-red-400/30">
        <AlertTriangle className="h-3 w-3" /> kazanç riski
      </span>
    )
  }
  if (q.rating === 'zayıf') {
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-400 bg-amber-400/10 border border-amber-400/30">
        düşük kalite
      </span>
    )
  }
  if (q.piotroski !== null && q.piotroski >= 7) {
    return (
      <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/30">
        sağlam (F{q.piotroski})
      </span>
    )
  }
  return null
}

// ─── Ana bileşen ────────────────────────────────────────────────────────────
export default function BuyuyenSirketler() {
  const [market, setMarket] = useState<Market>('BIST')
  const [data, setData] = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    fetch(`/api/growth-momentum?market=${market}&limit=80`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ApiResp) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [market])

  const stale = useMemo(() => staleLabel(data?.updatedAt ?? null), [data?.updatedAt])
  const rows = data?.scores ?? []

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Başlık */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <TrendingUp className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Büyüyen Şirketler</h1>
        </div>
        <p className="mt-2 text-sm text-text-secondary max-w-2xl">
          İşi büyüyen (gelir↑), kârlılığı artan (net marj + net kâr↑) ve hisse başı kazancı
          (EPS) yükselen şirketler — son 5 yıllık finansallardan tek bir büyüme momentumu
          skoruyla derecelendirilir.
          {market === 'BIST' && ' BIST büyümeleri enflasyondan arındırılarak REEL gösterilir.'}
        </p>
      </div>

      {/* Pazar toggle */}
      <div className="mb-5 flex items-center gap-2">
        {(['BIST', 'US'] as Market[]).map((m) => (
          <button
            key={m}
            onClick={() => setMarket(m)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors border ${
              market === m
                ? 'bg-primary/15 text-primary border-primary/40'
                : 'text-text-secondary border-border hover:text-text-primary hover:bg-white/5'
            }`}
          >
            {m === 'BIST' ? '🇹🇷 BIST' : '🇺🇸 ABD'}
          </button>
        ))}
        {stale && (
          <span className={`ml-auto text-xs ${stale.stale ? 'text-amber-400' : 'text-text-muted'}`}>
            Güncelleme: {stale.text}
            {market === 'BIST' && data?.inflationYoy != null && (
              <span className="text-text-muted"> · TÜFE %{data.inflationYoy.toFixed(1)}</span>
            )}
          </span>
        )}
      </div>

      {/* İçerik */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-secondary">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Yükleniyor…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-text-secondary">
          Veri alınamadı. Lütfen sonra tekrar deneyin.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center">
          <p className="text-text-secondary">
            {market === 'US'
              ? 'ABD verisi henüz hazırlanmadı.'
              : 'Henüz veri yok. Tarama cron’u ilk koşusunu tamamlayınca burada görünecek.'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {/* Başlık satırı (desktop) */}
          <div className="hidden md:grid grid-cols-[2.5rem_1fr_4rem_5rem_5rem_5rem_4.5rem_4.5rem] gap-2 px-4 py-2.5 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            <span>#</span>
            <span>Şirket</span>
            <span className="text-right">Skor</span>
            <span className="text-right">Gelir</span>
            <span className="text-right">Net Kâr</span>
            <span className="text-right">EPS</span>
            <span className="text-right">Marj</span>
            <span className="text-center">EPS Trend</span>
          </div>

          {rows.map((r, i) => (
            <Link
              key={r.sembol}
              href={`/hisse/${r.sembol}`}
              className="grid grid-cols-[2.5rem_1fr_4rem] md:grid-cols-[2.5rem_1fr_4rem_5rem_5rem_5rem_4.5rem_4.5rem] gap-2 items-center px-4 py-3 border-b border-border last:border-0 hover:bg-white/5 transition-colors"
            >
              <span className="text-sm font-semibold text-text-muted">{i + 1}</span>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-text-primary">{r.sembol}</span>
                  <span className="text-[11px] text-text-muted">{r.sector}</span>
                  <QualityBadge q={r.quality} />
                </div>
                <div className="text-xs text-text-secondary capitalize">
                  {r.verdict}
                  {r.consistency >= 0.75 && (
                    <span className="text-emerald-400"> · istikrarlı</span>
                  )}
                </div>
                {/* Mobil özet */}
                <div className="md:hidden mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  <span className={valueColor(r.revenueCagr)}>Gelir {pct(r.revenueCagr)}</span>
                  <span className={valueColor(r.netIncomeCagr)}>Kâr {pct(r.netIncomeCagr)}</span>
                  <span className={valueColor(r.epsCagr)}>EPS {pct(r.epsCagr)}</span>
                </div>
              </div>

              <span
                className={`justify-self-end rounded-md border px-2 py-1 text-sm font-bold tabular-nums ${scoreColor(
                  r.score,
                )}`}
              >
                {r.score}
              </span>

              {/* Desktop kolonları */}
              <span className={`hidden md:block text-right text-sm tabular-nums ${valueColor(r.revenueCagr)}`}>
                {pct(r.revenueCagr)}
              </span>
              <span className={`hidden md:block text-right text-sm tabular-nums ${valueColor(r.netIncomeCagr)}`}>
                {pct(r.netIncomeCagr)}
              </span>
              <span className={`hidden md:block text-right text-sm tabular-nums ${valueColor(r.epsCagr)}`}>
                {pct(r.epsCagr)}
              </span>
              <span className={`hidden md:flex items-center justify-end gap-0.5 text-sm tabular-nums ${valueColor(r.marginDeltaPP)}`}>
                {r.marginDeltaPP !== null && r.marginDeltaPP !== 0 &&
                  (r.marginDeltaPP > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />)}
                {r.marginDeltaPP === null ? '—' : `${r.marginDeltaPP > 0 ? '+' : ''}${r.marginDeltaPP}`}
              </span>
              <span className="hidden md:flex justify-center">
                <Sparkline data={r.epsSeries} />
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Açıklama / yasal */}
      <div className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-surface/50 p-3 text-xs text-text-muted">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          Skorlar yalnızca geçmiş finansal büyümeyi ölçer; geleceğe dönük getiri garantisi
          ya da yatırım tavsiyesi değildir. Gelir/net kâr büyümesi
          {market === 'BIST' ? ' enflasyondan arındırılmış (reel)' : ' nominal'} olarak gösterilir.
          Banka/finansal şirketler farklı muhasebe yapısı nedeniyle listeye dahil edilmez.
          Kazanç kalitesi zayıf veya manipülasyon şüphesi olan şirketlerin skoru kısılır.
        </p>
      </div>
    </div>
  )
}
