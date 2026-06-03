'use client'

import { useEffect, useState } from 'react'
import { Sparkles, TrendingUp, TrendingDown } from 'lucide-react'
import { scoreToColor, scoreToLabel } from '@/lib/future-score'

interface FutureScore {
  sembol: string
  score: number
  ai_summary: string
  revenue_score: number
  analyst_score: number
  insider_score: number
}

const THEMES = [
  { id: 'AI', label: '🤖 AI', color: 'from-blue-600 to-cyan-600' },
  { id: 'Quantum', label: '⚛️ Quantum', color: 'from-purple-600 to-pink-600' },
  { id: 'Space', label: '🚀 Space', color: 'from-indigo-600 to-blue-600' },
  { id: 'Cybersecurity', label: '🔒 Cybersecurity', color: 'from-red-600 to-orange-600' },
]

export default function GelecekSirketlerPage() {
  const [activeTab, setActiveTab] = useState('AI')
  const [scores, setScores] = useState<FutureScore[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const fetchScores = async () => {
      setLoading(true)
      try {
        const url = '/api/future-scores?tema=' + activeTab + '&limit=100'
        const res = await fetch(url)
        const data = await res.json()
        setScores(data.scores || [])
      } catch (error) {
        console.error('Error fetching scores:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchScores()
  }, [activeTab])

  const brightestScores = scores.slice(0, 5)
  const darkestScores = scores.slice(-5).reverse()

  return (
    <div className='min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white'>
      <div className='border-b border-slate-700 bg-slate-800/50 backdrop-blur'>
        <div className='max-w-7xl mx-auto px-4 py-12'>
          <div className='flex items-center gap-3 mb-4'>
            <Sparkles className='w-8 h-8 text-yellow-400' />
            <h1 className='text-4xl font-bold'>Geleceği Parlak Şirketler</h1>
          </div>
          <p className='text-slate-400'>
            Future Brightness Score: Revenue büyümesi, analist hedefi, insider alım, haber duyarlılığı.
          </p>
        </div>
      </div>

      <div className='border-b border-slate-700 bg-slate-800/30 backdrop-blur sticky top-0 z-40'>
        <div className='max-w-7xl mx-auto px-4 flex gap-2 overflow-x-auto py-3'>
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              onClick={() => setActiveTab(theme.id)}
              className={activeTab === theme.id ? 'px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap bg-gradient-to-r ' + theme.color + ' shadow-lg' : 'px-4 py-2 rounded-lg font-semibold transition-all whitespace-nowrap bg-slate-700 hover:bg-slate-600'}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </div>

      <div className='max-w-7xl mx-auto px-4 py-12'>
        {loading ? (
          <div className='text-center text-slate-400'>Yükleniyor...</div>
        ) : scores.length === 0 ? (
          <div className='text-center text-slate-400'>Bu tema için henüz veri yok.</div>
        ) : (
          <div className='grid md:grid-cols-2 gap-8'>
            <div>
              <div className='flex items-center gap-2 mb-4'>
                <TrendingUp className='w-5 h-5 text-green-400' />
                <h2 className='text-2xl font-bold text-green-400'>Top 5 Parlak</h2>
              </div>
              <div className='space-y-3'>
                {brightestScores.map((score, idx) => (
                  <ScoreCard key={score.sembol} score={score} rank={idx + 1} type='bright' />
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
                  <ScoreCard key={score.sembol} score={score} rank={idx + 1} type='dark' />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreCard({ score, rank, type }: { score: FutureScore; rank: number; type: 'bright' | 'dark' }) {
  return (
    <div className='bg-gradient-to-r from-slate-700 to-slate-800 p-4 rounded-lg border border-slate-600'>
      <div className='flex justify-between items-start mb-2'>
        <div>
          <p className='text-lg font-bold text-white'>#{rank} {score.sembol}</p>
        </div>
        <div className='px-3 py-2 rounded-lg font-bold text-white' style={{ backgroundColor: scoreToColor(score.score) }}>
          {score.score}
        </div>
      </div>
      <p className='text-sm text-slate-300 mb-2'>{score.ai_summary}</p>
    </div>
  )
}
