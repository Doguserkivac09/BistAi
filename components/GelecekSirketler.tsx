'use client'

import { useEffect, useState } from 'react'
import { Sparkles, TrendingUp, TrendingDown, AlertTriangle, Info } from 'lucide-react'
import { scoreToColor, scoreToLabel } from '@/lib/future-score'

interface FutureScore {
  sembol: string
  market: string
  score: number
  ai_summary: string
  revenue_score: number
  analyst_score: number
  news_score: number          // → Analist Konsensüsü
  partnership_score: number   // → EPS Trendi
  insider_score: number
  balance_score: number       // → PEG / Değerleme
  institutional_score: number
  scored_at: string
}

type Market = 'US' | 'BIST'

interface ThemeTab {
  id: string
  label: string
  color: string
}

const US_THEMES: ThemeTab[] = [
  { id: 'AI', label: '🤖 AI', color: 'from-blue-600 to-cyan-600' },
  { id: 'Quantum', label: '⚛️ Quantum', color: 'from-purple-600 to-pink-600' },
  { id: 'Space', label: '🚀 Space', color: 'from-indigo-600 to-blue-600' },
  { id: 'Cybersecurity', label: '🔒 Cybersecurity', color: 'from-red-600 to-orange-600' },
  { id: 'Defense', label: '🛡️ Defense', color: 'from-slate-600 to-gray-700' },
  { id: 'Semis', label: '🔌 Semis', color: 'from-amber-600 to-yellow-600' },
  { id: 'Biotech', label: '🧬 Biotech', color: 'from-green-600 to-emerald-600' },
  { id: 'Crypto', label: '₿ Crypto', color: 'from-orange-500 to-amber-600' },
  { id: 'EV', label: '🔋 EV', color: 'from-lime-600 to-green-600' },
  { id: 'CleanEnergy', label: '♻️ CleanEnergy', color: 'from-teal-600 to-green-600' },
  { id: 'Networking', label: '📡 Networking', color: 'from-sky-600 to-blue-600' },
  { id: 'Datacenter', label: '🏢 Datacenter', color: 'from-violet-600 to-purple-600' },
  { id: 'PowerInfra', label: '⚡ PowerInfra', color: 'from-yellow-500 to-orange-600' },
]

// BIST — mavi/yeşil palet (US'in turuncu/bordo'sundan ayrışır)
const BIST_THEMES: ThemeTab[] = [
  { id: 'Savunma & Teknoloji', label: '🛡️ Savunma & Teknoloji', color: 'from-blue-700 to-indigo-700' },
  { id: 'Enerji & Yenilenebilir', label: '⚡ Enerji & Yenilenebilir', color: 'from-emerald-700 to-teal-700' },
  { id: 'Finans & Fintech', label: '🏦 Finans & Fintech', color: 'from-sky-700 to-blue-800' },
  { id: 'İhracat Liderleri', label: '🚢 İhracat Liderleri', color: 'from-cyan-700 to-emerald-700' },
  { id: 'Sağlık & Biyoteknoloji', label: '🧬 Sağlık & Biyoteknoloji', color: 'from-teal-700 to-green-800' },
]

const STALE_DAYS = 7

export default function GelecekSirketler() {
  const [market, setMarket] = useState<Market>('US')
  const themes = market === 'BIST' ? BIST_THEMES : US_THEMES
  const [activeTab, setActiveTab] = useState(US_THEMES[0].id)
  const [scores, setScores] = useState<FutureScore[]>([])
  const [loading, setLoading] = useState(false)

  // Market değişince ilgili ilk temaya geç
  function switchMarket(m: Market) {
    if (m === market) return
    setMarket(m)
    setActiveTab((m === 'BIST' ? BIST_THEMES : US_THEMES)[0].id)
  }

  useEffect(() => {
    const fetchScores = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ tema: activeTab, market, limit: '100' })
        const res = await fetch('/api/future-scores?' + params.toString())
        const data = await res.json()
        setScores(data.scores || [])
      } catch (error) {
        console.error('Error fetching scores:', error)
        setScores([])
      } finally {
        setLoading(false)
      }
    }
    fetchScores()
  }, [activeTab, market])

  const brightestScores = scores.slice(0, 5)
  const darkestScores = scores.slice(-5).reverse()

  // Stale veri kontrolü — en yeni scored_at STALE_DAYS'ten eskiyse uyar
  const newestScoredAt = scores.reduce<number>((acc, s) => {
    const t = s.scored_at ? new Date(s.scored_at).getTime() : 0
    return t > acc ? t : acc
  }, 0)
  const staleDays = newestScoredAt
    ? Math.floor((Date.now() - newestScoredAt) / (24 * 60 * 60 * 1000))
    : null
  const isStale = staleDays !== null && staleDays >= STALE_DAYS

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white'>
      <div className='border-b border-slate-700 bg-slate-800/50 backdrop-blur'>
        <div className='max-w-7xl mx-auto px-4 py-12'>
          <div className='flex items-center gap-3 mb-4'>
            <Sparkles className='w-8 h-8 text-yellow-400' />
            <h1 className='text-4xl font-bold'>Geleceği Parlak Şirketler</h1>
          </div>
          <p className='text-slate-400 max-w-3xl'>
            Future Brightness Score — gelir büyümesi, analist hedefi, analist konsensüsü,
            EPS büyüme trendi, içeriden alım, PEG değerleme ve kurumsal sahiplikten oluşan
            7 bileşenli 0-100 skor.
          </p>

          {/* Market toggle */}
          <div className='mt-6 inline-flex rounded-xl bg-slate-900/60 border border-slate-700 p-1'>
            <button
              onClick={() => switchMarket('US')}
              className={
                'px-5 py-2 rounded-lg font-semibold transition-all ' +
                (market === 'US' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white')
              }
            >
              🇺🇸 ABD
            </button>
            <button
              onClick={() => switchMarket('BIST')}
              className={
                'px-5 py-2 rounded-lg font-semibold transition-all ' +
                (market === 'BIST' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white')
              }
            >
              🇹🇷 BIST
            </button>
          </div>
        </div>
      </div>

      {/* Tema sekmeleri */}
      <div className='border-b border-slate-700 bg-slate-800/30 backdrop-blur sticky top-0 z-40'>
        <div className='max-w-7xl mx-auto px-4 flex gap-2 overflow-x-auto py-3'>
          {themes.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setActiveTab(theme.id)}
              className={
                activeTab === theme.id
                  ? 'px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap bg-gradient-to-r ' + theme.color + ' shadow-lg'
                  : 'px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap bg-slate-700 hover:bg-slate-600'
              }
            >
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      <div className='max-w-7xl mx-auto px-4 py-10'>
        {/* Stale veri uyarısı */}
        {isStale && (
          <div className='mb-6 flex items-center gap-3 rounded-lg border border-amber-600/40 bg-amber-900/20 px-4 py-3 text-amber-300'>
            <AlertTriangle className='w-5 h-5 flex-shrink-0' />
            <span className='text-sm'>
              Veri güncel olmayabilir — son skorlama <strong>{staleDays} gün önce</strong> yapıldı.
            </span>
          </div>
        )}

        {/* BIST enflasyon notu */}
        {market === 'BIST' && !loading && scores.length > 0 && (
          <div className='mb-6 flex items-center gap-3 rounded-lg border border-emerald-600/30 bg-emerald-900/15 px-4 py-3 text-emerald-300'>
            <Info className='w-5 h-5 flex-shrink-0' />
            <span className='text-sm'>
              Gelir büyümesi <strong>enflasyona göre düzeltilmiş</strong> (reel) hesaplanır —
              TL bazlı nominal büyümenin şişirme etkisi giderilir.
            </span>
          </div>
        )}

        {loading ? (
          <div className='text-center text-slate-400 py-12'>Yükleniyor...</div>
        ) : scores.length === 0 ? (
          <div className='text-center text-slate-400 py-12'>
            Bu tema için henüz yeterli veri yok.
            {market === 'BIST' && ' BIST skorları her Pazartesi 11:00 (TRT) güncellenir.'}
          </div>
        ) : (
          <div className='grid md:grid-cols-2 gap-8'>
            <div>
              <div className='flex items-center gap-2 mb-4'>
                <TrendingUp className='w-5 h-5 text-green-400' />
                <h2 className='text-2xl font-bold text-green-400'>Top 5 Parlak</h2>
              </div>
              <div className='space-y-3'>
                {brightestScores.map((score, idx) => (
                  <ScoreCard key={score.sembol} score={score} rank={idx + 1} />
                ))}
              </div>
            </div>
            <div>
              <div className='flex items-center gap-2 mb-4'>
                <TrendingDown className='w-5 h-5 text-red-400' />
                <h2 className='text-2xl font-bold text-red-400'>Top 5 Risk</h2>
              </div>
              <div className='space-y-3'>
                {darkestScores.map((score, idx) => (
                  <ScoreCard key={score.sembol} score={score} rank={idx + 1} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Metodoloji */}
        <div className='mt-12 rounded-xl border border-slate-700 bg-slate-800/40 p-5 text-sm text-slate-400'>
          <p className='font-semibold text-slate-300 mb-2'>Skor Bileşenleri</p>
          <div className='grid sm:grid-cols-2 gap-x-8 gap-y-1'>
            <span>• Gelir Büyümesi — %22</span>
            <span>• İçeriden Alım — %15</span>
            <span>• Analist Hedefi — %18</span>
            <span>• PEG / Değerleme — %10</span>
            <span>• Analist Konsensüsü — %15</span>
            <span>• Kurumsal Sahiplik — %5</span>
            <span>• EPS Büyüme Trendi — %15</span>
          </div>
        </div>
      </div>
    </div>
  )
}

const COMPONENTS: { key: keyof FutureScore; label: string }[] = [
  { key: 'revenue_score', label: 'Gelir' },
  { key: 'analyst_score', label: 'Hedef' },
  { key: 'news_score', label: 'Konsensüs' },
  { key: 'partnership_score', label: 'EPS' },
  { key: 'insider_score', label: 'İçeriden' },
  { key: 'balance_score', label: 'PEG' },
  { key: 'institutional_score', label: 'Kurumsal' },
]

function ScoreCard({ score, rank }: { score: FutureScore; rank: number }) {
  return (
    <div className='bg-gradient-to-r from-slate-700 to-slate-800 p-4 rounded-lg border border-slate-600'>
      <div className='flex justify-between items-start mb-2'>
        <div>
          <p className='text-lg font-bold text-white'>
            #{rank} {score.sembol}
            <span className='ml-2 text-xs font-medium' style={{ color: scoreToColor(score.score) }}>
              {scoreToLabel(score.score)}
            </span>
          </p>
        </div>
        <div
          className='px-3 py-2 rounded-lg font-bold text-white'
          style={{ backgroundColor: scoreToColor(score.score) }}
        >
          {score.score}
        </div>
      </div>
      <p className='text-sm text-slate-300 mb-3'>{score.ai_summary}</p>

      {/* Bileşen breakdown */}
      <div className='grid grid-cols-7 gap-1'>
        {COMPONENTS.map((c) => {
          const v = (score[c.key] as number) ?? 50
          return (
            <div key={c.key} className='flex flex-col items-center gap-1' title={`${c.label}: ${v}`}>
              <div className='h-10 w-full bg-slate-900/60 rounded-sm flex items-end overflow-hidden'>
                <div
                  className='w-full rounded-sm transition-all'
                  style={{ height: `${Math.max(4, v)}%`, backgroundColor: scoreToColor(v) }}
                />
              </div>
              <span className='text-[9px] text-slate-500 leading-none text-center'>{c.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
