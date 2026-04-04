'use client';

/**
 * Makro Simülatör
 *
 * Kullanıcı bir makro senaryo seçer (USD/TRY +20%, faiz artışı vb.)
 * → claude-opus-4-6 tarihsel analiz + sektör etki + portföy yorum üretir.
 *
 * Step 13 — Opus (senaryo prompt + tarihsel analiz + karmaşık UI state)
 */

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  FlaskConical, Play, RefreshCw, AlertCircle, TrendingUp,
  TrendingDown, DollarSign, Flame, Globe, BarChart2, Zap, ChevronDown,
} from 'lucide-react';
import type { SimulationScenario, ScenarioType } from '@/app/api/simulasyon/route';

// ── Senaryo kataloğu ─────────────────────────────────────────────────

interface ScenarioDef {
  type: ScenarioType;
  label: string;
  desc: string;
  icon: React.ElementType;
  color: string;
  category: 'kur' | 'faiz' | 'global' | 'emtia';
}

const SCENARIOS: ScenarioDef[] = [
  {
    type: 'usdtry_yukselis', label: 'USD/TRY Yükseliyor', desc: 'TL değer kaybediyor',
    icon: TrendingUp, color: 'text-red-400 bg-red-500/10 border-red-500/20', category: 'kur',
  },
  {
    type: 'usdtry_dusus', label: 'USD/TRY Düşüyor', desc: 'TL güçleniyor',
    icon: TrendingDown, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', category: 'kur',
  },
  {
    type: 'faiz_artis', label: 'TCMB Faiz Artırıyor', desc: 'Sıkılaştırma sinyali',
    icon: BarChart2, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', category: 'faiz',
  },
  {
    type: 'faiz_dusus', label: 'TCMB Faiz İndiriyor', desc: 'Gevşeme sinyali',
    icon: BarChart2, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', category: 'faiz',
  },
  {
    type: 'vix_yukselis', label: 'Global Risk-Off', desc: 'VIX yükseliyor, panik var',
    icon: Flame, color: 'text-red-400 bg-red-500/10 border-red-500/20', category: 'global',
  },
  {
    type: 'vix_dusus', label: 'Global Risk-On', desc: 'VIX düşüyor, iştah açık',
    icon: Globe, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', category: 'global',
  },
  {
    type: 'enflasyon_artis', label: 'Enflasyon Yükseliyor', desc: 'TÜFE artış baskısı',
    icon: TrendingUp, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', category: 'faiz',
  },
  {
    type: 'cds_yukselis', label: 'CDS Spread Artıyor', desc: 'Ülke riski yükseliyor',
    icon: AlertCircle, color: 'text-red-400 bg-red-500/10 border-red-500/20', category: 'kur',
  },
  {
    type: 'fed_artis', label: 'Fed Faiz Artırıyor', desc: 'EM\'lere baskı',
    icon: DollarSign, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20', category: 'global',
  },
  {
    type: 'petrol_yukselis', label: 'Petrol Pahalılaşıyor', desc: 'Enerji maliyeti artar',
    icon: Flame, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20', category: 'emtia',
  },
  {
    type: 'petrol_dusus', label: 'Petrol Ucuzluyor', desc: 'Enerji ithalatı avantajlı',
    icon: Zap, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', category: 'emtia',
  },
  {
    type: 'resesyon_kaygisi', label: 'Resesyon Endişesi', desc: 'Global yavaşlama',
    icon: TrendingDown, color: 'text-red-400 bg-red-500/10 border-red-500/20', category: 'global',
  },
];

const CATEGORIES = [
  { id: 'kur',    label: 'Kur & Risk' },
  { id: 'faiz',   label: 'Faiz & Enflasyon' },
  { id: 'global', label: 'Global Faktörler' },
  { id: 'emtia',  label: 'Emtia' },
] as const;

// ── Markdown renderer (basit) ────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let tableLines: string[] = [];

  const flushTable = () => {
    if (tableLines.length < 2) { tableLines = []; return; }
    const headers = tableLines[0]!.split('|').map(h => h.trim()).filter(Boolean);
    const rows = tableLines.slice(2).map(row =>
      row.split('|').map(c => c.trim()).filter(Boolean)
    );
    elements.push(
      <div key={`table-${elements.length}`} className="overflow-x-auto my-3">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="border border-border px-3 py-2 text-left text-xs font-semibold text-text-secondary bg-surface/50">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="border-b border-border/50 hover:bg-white/2">
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-border/30 px-3 py-2 text-xs text-text-primary">{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableLines = [];
  };

  for (const line of lines) {
    if (line.startsWith('|')) {
      tableLines.push(line);
      continue;
    }
    if (tableLines.length > 0) flushTable();

    if (line.startsWith('## ')) {
      elements.push(<h2 key={elements.length} className="mt-5 mb-2 text-base font-bold text-text-primary">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={elements.length} className="mt-4 mb-1.5 text-sm font-semibold text-text-primary">{line.slice(4)}</h3>);
    } else if (line.startsWith('**') && line.endsWith('**')) {
      elements.push(<p key={elements.length} className="text-sm font-semibold text-text-primary mt-2">{line.slice(2, -2)}</p>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const content = line.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      elements.push(
        <li key={elements.length} className="text-sm text-text-secondary ml-4 list-disc leading-relaxed"
          dangerouslySetInnerHTML={{ __html: content }} />
      );
    } else if (line.trim() === '---') {
      elements.push(<hr key={elements.length} className="my-4 border-border" />);
    } else if (line.trim() === '*Bu analiz genel bilgi amaçlıdır, yatırım tavsiyesi değildir.*') {
      elements.push(<p key={elements.length} className="text-[11px] text-text-muted italic mt-3">{line.replace(/\*/g, '')}</p>);
    } else if (line.trim()) {
      const html = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      elements.push(
        <p key={elements.length} className="text-sm text-text-secondary leading-relaxed mt-1"
          dangerouslySetInnerHTML={{ __html: html }} />
      );
    }
  }
  if (tableLines.length > 0) flushTable();
  return <>{elements}</>;
}

// ── Ana Bileşen ───────────────────────────────────────────────────────

export default function SimulasyonPage() {
  const [selected, setSelected]     = useState<ScenarioDef | null>(null);
  const [magnitude, setMagnitude]   = useState<SimulationScenario['magnitude']>('orta');
  const [customNote, setCustomNote] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('kur');

  const [loading, setLoading]   = useState(false);
  const [streamText, setStreamText] = useState('');
  const [result, setResult]     = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  useEffect(() => {
    import('@/lib/supabase').then(({ createClient }) => {
      createClient().auth.getUser().then(({ data: { user } }) => {
        setLoggedIn(!!user);
      });
    });
  }, []);

  // Mobil: simülasyon başlayınca sonuç paneline kaydır
  useEffect(() => {
    if (loading) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading]);

  const runSimulation = async () => {
    if (!selected || loading) return;
    setError(null);
    setResult('');
    setStreamText('');
    setUpgradeRequired(false);
    setLoading(true);

    const scenario: SimulationScenario = {
      type: selected.type,
      magnitude,
      customNote: customNote.trim() || undefined,
    };

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/simulasyon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.upgrade) {
          setUpgradeRequired(true);
        } else {
          setError(data.error ?? 'Bir hata oluştu.');
        }
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('Stream alınamadı.');
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.error) { setError(parsed.error); break; }
            if (parsed.text) { accumulated += parsed.text; setStreamText(accumulated); }
            if (parsed.done) { setResult(accumulated); setStreamText(''); }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setError('Bağlantı hatası.');
    } finally {
      setLoading(false);
    }
  };

  // Giriş yapılmamış
  if (loggedIn === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="max-w-sm w-full rounded-xl border border-border bg-surface p-8 text-center">
          <FlaskConical className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-lg font-bold text-text-primary mb-2">Makro Simülatör</h2>
          <p className="text-sm text-text-secondary mb-6">Makro simülasyon için giriş yapmanız gerekiyor.</p>
          <Link href="/giris" className="inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 transition-colors">
            Giriş Yap
          </Link>
        </div>
      </div>
    );
  }

  const filteredScenarios = SCENARIOS.filter(s => s.category === activeCategory);

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-7xl px-4 py-8">

        {/* Başlık */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-text-primary">Makro Simülatör</h1>
          </div>
          <p className="text-sm text-text-secondary">
            Bir makro senaryo seçin — AI tarihsel analiz + sektör etkileri + portföy yorumu üretsin.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">

          {/* Sol panel — Senaryo seçimi */}
          <div className="space-y-4">

            {/* Kategori sekmeleri */}
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    activeCategory === cat.id
                      ? 'border-primary/50 bg-primary/10 text-primary'
                      : 'border-border text-text-secondary hover:border-primary/30'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Senaryo listesi */}
            <div className="space-y-2">
              {filteredScenarios.map(s => {
                const Icon = s.icon;
                const isSelected = selected?.type === s.type;
                return (
                  <button
                    key={s.type}
                    onClick={() => setSelected(s)}
                    className={`w-full flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
                      isSelected
                        ? `${s.color} ring-1 ring-current/30`
                        : 'border-border bg-surface hover:border-primary/30'
                    }`}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${s.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">{s.label}</p>
                      <p className="text-[11px] text-text-muted">{s.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Büyüklük seçimi */}
            {selected && (
              <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Büyüklük</p>
                <div className="flex gap-2">
                  {(['hafif', 'orta', 'sert'] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => setMagnitude(m)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-medium capitalize transition-colors ${
                        magnitude === m
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border text-text-secondary hover:border-primary/30'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                {/* Ek not */}
                <div>
                  <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
                    Ek Bağlam (isteğe bağlı)
                  </label>
                  <textarea
                    value={customNote}
                    onChange={e => setCustomNote(e.target.value)}
                    placeholder="ör: Fed toplantısı öncesi, Türkiye seçim dönemi…"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-text-primary placeholder-text-muted/50 focus:border-primary focus:outline-none"
                  />
                </div>

                <button
                  onClick={runSimulation}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? <><RefreshCw className="h-4 w-4 animate-spin" /> Analiz ediliyor…</>
                    : <><Play className="h-4 w-4" /> Simülasyonu Çalıştır</>
                  }
                </button>
              </div>
            )}

            {!selected && (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <ChevronDown className="h-6 w-6 text-text-muted mx-auto mb-2" />
                <p className="text-xs text-text-muted">Yukarıdan bir senaryo seçin</p>
              </div>
            )}
          </div>

          {/* Sağ panel — Sonuç */}
          <div ref={resultRef}>
            {!result && !streamText && !loading && !error && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/30 py-20 text-center">
                <FlaskConical className="h-10 w-10 text-text-muted mb-3" />
                <p className="text-sm text-text-secondary font-medium">Senaryo analizi burada görünecek</p>
                <p className="text-xs text-text-muted mt-1 max-w-xs">
                  Sol panelden bir makro senaryo seçin ve simülasyonu başlatın.
                </p>
              </div>
            )}

            {loading && !streamText && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-surface py-20 text-center gap-3">
                <RefreshCw className="h-6 w-6 text-primary animate-spin" />
                <p className="text-sm text-text-secondary">Tarihsel veriler + sektör etkileri analiz ediliyor…</p>
              </div>
            )}

            {(streamText || result) && (
              <div className="rounded-xl border border-border bg-surface p-5">
                {/* Senaryo etiketi */}
                {selected && (
                  <div className="mb-4 flex items-center gap-2 flex-wrap">
                    <span className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${selected.color}`}>
                      <selected.icon className="h-3 w-3" />
                      {selected.label}
                    </span>
                    <span className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-text-muted capitalize">
                      {magnitude} büyüklük
                    </span>
                    {loading && (
                      <span className="flex items-center gap-1 text-[11px] text-text-muted">
                        <RefreshCw className="h-2.5 w-2.5 animate-spin" /> yazıyor…
                      </span>
                    )}
                  </div>
                )}
                <div ref={resultRef} className="prose-sm">
                  {renderMarkdown(streamText || result)}
                  {loading && streamText && (
                    <span className="inline-block h-4 w-0.5 animate-pulse bg-primary align-middle ml-0.5" />
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {upgradeRequired && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-6 text-center">
                <FlaskConical className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="text-sm font-bold text-text-primary mb-1">Pro veya Premium Gerekli</h3>
                <p className="text-xs text-text-secondary mb-4">
                  Makro Simülatör, gerçek zamanlı AI analizi sunan gelişmiş bir özelliktir.<br />
                  Kullanmak için planınızı yükseltin.
                </p>
                <Link
                  href="/fiyatlandirma"
                  className="inline-block rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-white hover:bg-primary/90 transition-colors"
                >
                  Planları Gör
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
