'use client'

import { useEffect, useState } from 'react'
import {
  Newspaper, Info, ExternalLink, Clock, Zap, Eye, EyeOff, TrendingUp,
} from 'lucide-react'
import type { NewsImpact, PricedVerdict, Materiality } from '@/lib/news-impact'

interface ApiResp {
  available: boolean
  index?: string
  important?: NewsImpact[]
  noise?: NewsImpact[]
  noiseCount?: number
  importantCount?: number
  unpricedCount?: number
  last7dCount?: number
  message?: string
}

// ── Verdict stilleri (görev matrisi: tepki × yaş) ──
const VERDICT: Record<PricedVerdict, { emoji: string; label: string; cls: string; aciklama: string }> = {
  'fiyatlanıyor':      { emoji: '🔵', label: 'Fiyatlanıyor',      cls: 'border-sky-500/40 bg-sky-500/10 text-sky-300',         aciklama: 'Taze haber + hareket başladı — fiyatlanma sürüyor.' },
  'henüz-fiyatlanmadı':{ emoji: '🟢', label: 'Henüz fiyatlanmadı', cls: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', aciklama: 'Taze haber, henüz anlamlı hareket yok — tepki bekleniyor.' },
  'fiyatlandı':        { emoji: '🔴', label: 'Fiyatlandı',        cls: 'border-red-500/40 bg-red-500/10 text-red-300',         aciklama: 'Haber üzerinden zaman geçti + anlamlı hareket oldu — piyasa tepkisini büyük ölçüde verdi.' },
  'tepkisiz':          { emoji: '⚪', label: 'Tepkisiz',          cls: 'border-border bg-white/5 text-text-muted',             aciklama: 'Zaman geçti ama anlamlı hareket olmadı — etkisiz/önemsiz kaldı.' },
  'ölçülemedi':        { emoji: '◌',  label: 'Ölçülemedi',        cls: 'border-border bg-white/5 text-text-muted',             aciklama: 'Haber fiyat penceresi dışında — etki ölçülemedi.' },
}

const MAT: Record<Materiality, { emoji: string; cls: string; label: string }> = {
  'yüksek':  { emoji: '🔴', cls: 'border-red-500/30 bg-red-500/10 text-red-400',     label: 'Yüksek önem' },
  'orta':    { emoji: '🟡', cls: 'border-amber-500/30 bg-amber-500/10 text-amber-400', label: 'Orta' },
  'gürültü': { emoji: '⚪', cls: 'border-border bg-white/5 text-text-muted',          label: 'Gürültü' },
}

function yasMetni(saat: number): string {
  if (saat < 1) return 'az önce'
  if (saat < 24) return `${Math.round(saat)} saat önce`
  const g = Math.round(saat / 24)
  return `${g} gün önce`
}

export default function HaberEtkisi({ sembol, market }: { sembol: string; market: 'BIST' | 'US' }) {
  const [data, setData] = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [noiseOpen, setNoiseOpen] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setNoiseOpen(false)
    fetch(`/api/news-impact?symbol=${encodeURIComponent(sembol)}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d) })
      .catch(() => { if (alive) setData({ available: false }) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [sembol, market])

  const important = data?.important ?? []
  const noise = data?.noise ?? []

  // Hiç önemli haber yoksa bileşeni gösterme (haber listesi zaten altta var)
  if (!loading && important.length === 0) return null

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-3 flex items-center gap-2">
        <Newspaper className="w-3.5 h-3.5" />
        Haber Fiyatlandı mı?
        <span className="text-text-muted/50 normal-case tracking-normal">(materyalite + etki analizi)</span>
        <span className="flex-1 h-px bg-border/50" />
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-surface" />)}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-4 space-y-4">
          {/* Özet */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-text-secondary">
              Son 7 günde{' '}
              <span className="font-semibold text-text-primary">{data?.last7dCount ?? 0}</span> önemli haber
            </span>
            {(data?.unpricedCount ?? 0) > 0 && (
              <span className="text-emerald-400 font-medium">
                🟢 {data!.unpricedCount} tanesi henüz fiyatlanmadı
              </span>
            )}
            <span className="text-text-muted ml-auto">
              Anormal getiri vs {data?.index ?? 'endeks'}
            </span>
          </div>

          {/* Önemli haber listesi */}
          <ul className="space-y-2.5">
            {important.map((n, i) => <HaberSatiri key={n.link || i} n={n} />)}
          </ul>

          {/* Gürültü toggle */}
          {noise.length > 0 && (
            <div className="border-t border-border pt-3">
              <button
                onClick={() => setNoiseOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                {noiseOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {noise.length} gürültü/önemsiz haber {noiseOpen ? 'gizle' : 'göster'}
              </button>
              {noiseOpen && (
                <ul className="mt-2 space-y-1.5">
                  {noise.map((n, i) => (
                    <li key={n.link || i}>
                      <a href={n.link} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-text-muted/80 hover:text-text-secondary flex items-start gap-1.5 group">
                        <span className="mt-0.5">·</span>
                        <span className="flex-1 line-clamp-1">{n.baslik}</span>
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 flex-shrink-0 mt-0.5" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-[10px] text-text-muted/70 flex items-start gap-1 border-t border-border pt-3">
            <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
            "Fiyatlandı" kesin değil, olasılıksaldır: anormal getiri (hisse − endeks) ve hacim
            istatistiğine dayanır. Haber zaman damgası yayın saatidir (gerçek bildirim saati
            değil), olay penceresi ±1 gün toleranslıdır. Yatırım tavsiyesi değildir.
          </p>
        </div>
      )}
    </div>
  )
}

function HaberSatiri({ n }: { n: NewsImpact }) {
  const v = VERDICT[n.verdict]
  const mat = MAT[n.materiality]
  const arPct = n.ar != null ? n.ar * 100 : null
  const arRenk = arPct == null ? 'text-text-muted' : arPct > 0 ? 'text-emerald-400' : arPct < 0 ? 'text-red-400' : 'text-text-muted'

  return (
    <li className="rounded-lg border border-border/70 bg-white/[0.02] p-3">
      {/* Üst satır: materyalite + başlık */}
      <div className="flex items-start gap-2">
        <span
          title={mat.label}
          className={`mt-0.5 shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${mat.cls}`}
        >
          {mat.emoji} {n.kategori}
        </span>
        <a href={n.link} target="_blank" rel="noopener noreferrer"
          className="flex-1 text-sm font-medium text-text-primary hover:text-primary transition-colors line-clamp-2 group">
          {n.baslik}
          <ExternalLink className="inline w-3 h-3 ml-1 opacity-0 group-hover:opacity-50 align-baseline" />
        </a>
      </div>

      {/* Alt satır: kaynak + yaş + verdict + AR + hacim */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1 text-text-muted">
          <Clock className="w-3 h-3" /> {yasMetni(n.yasSaat)}
        </span>
        {n.kaynak && <span className="text-text-muted/80">{n.kaynak}</span>}

        <span
          title={v.aciklama}
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium ${v.cls}`}
        >
          {v.emoji} {v.label}
        </span>

        {arPct != null && n.verdict !== 'ölçülemedi' && (
          <span className={`flex items-center gap-0.5 font-mono font-semibold ${arRenk}`} title="Anormal getiri (hisse − endeks), haberden bu yana">
            <TrendingUp className={`w-3 h-3 ${arPct < 0 ? 'rotate-180' : ''}`} />
            {arPct > 0 ? '+' : ''}{arPct.toFixed(1)}%
          </span>
        )}

        {n.hacimSpike && (
          <span className="flex items-center gap-0.5 text-amber-400" title={`Hacim olağandışı yüksek${n.hacimOran ? ` (${n.hacimOran.toFixed(1)}×)` : ''}`}>
            <Zap className="w-3 h-3" /> Hacim ↑{n.hacimOran ? ` ${n.hacimOran.toFixed(1)}×` : ''}
          </span>
        )}
      </div>

      {/* Anticipation notu */}
      {n.anticipation && n.anticipationAr != null && (
        <p className="mt-1.5 text-[11px] text-amber-400/90 flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          Fiyat haberden önce zaten {n.anticipationAr > 0 ? '+' : ''}{(n.anticipationAr * 100).toFixed(1)}% hareket etmiş —
          haber kısmen "önceden satın alınmış" olabilir.
        </p>
      )}

      {/* Opsiyonel AI yorumu */}
      {n.aiNot && (
        <p className="mt-1.5 text-[11px] text-text-secondary flex items-start gap-1">
          <span className="text-sky-400/80">✦</span>
          {n.aiDuygu && (
            <span className={`font-medium ${n.aiDuygu === 'pozitif' ? 'text-emerald-400' : n.aiDuygu === 'negatif' ? 'text-red-400' : 'text-text-muted'}`}>
              {n.aiDuygu === 'pozitif' ? 'Olumlu' : n.aiDuygu === 'negatif' ? 'Olumsuz' : 'Nötr'}:
            </span>
          )}
          <span className="flex-1">{n.aiNot}</span>
        </p>
      )}
    </li>
  )
}
