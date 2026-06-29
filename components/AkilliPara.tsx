'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Crosshair, RefreshCw, Filter, ShieldAlert, Info } from 'lucide-react';
import type { SmartSignalResult, SignalStatus, RiskLevel } from '@/lib/smart-signal/types';

type StatusFilter = 'all' | SignalStatus;

interface ApiResponse {
  ok: boolean;
  pending?: boolean;
  scoredAt?: string;
  count?: number;
  results: SmartSignalResult[];
}

const STATUS_CFG: Record<SignalStatus, { label: string; cls: string; dot: string }> = {
  STRONG:   { label: 'GÜÇLÜ',   cls: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10', dot: 'bg-emerald-400' },
  POSITIVE: { label: 'OLUMLU',  cls: 'text-sky-300 border-sky-500/40 bg-sky-500/10',             dot: 'bg-sky-400' },
  NEUTRAL:  { label: 'NÖTR',    cls: 'text-amber-300 border-amber-500/40 bg-amber-500/10',       dot: 'bg-amber-400' },
  NEGATIVE: { label: 'OLUMSUZ', cls: 'text-red-300 border-red-500/40 bg-red-500/10',             dot: 'bg-red-400' },
};

const ACTION_TR: Record<string, string> = {
  'Strong Watch': 'Güçlü İzle', Consider: 'Değerlendir', Watch: 'İzle', Avoid: 'Uzak Dur',
};

const RISK_CFG: Record<RiskLevel, { label: string; cls: string }> = {
  LOW:    { label: 'Düşük risk', cls: 'text-emerald-400' },
  MEDIUM: { label: 'Orta risk',  cls: 'text-amber-400' },
  HIGH:   { label: 'Yüksek risk', cls: 'text-red-400' },
};

const FLAG_CFG: Record<string, string> = {
  smart_money_entered: '🚀 Akıllı para girişi',
  accumulation: '🟢 Birikim',
  distribution: '🔴 Dağıtım',
};

function ScoreBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="text-text-muted w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="w-9 text-right font-semibold tabular-nums text-text-secondary">{value}/{max}</span>
    </div>
  );
}

function Kart({ r }: { r: SmartSignalResult }) {
  const s = STATUS_CFG[r.status];
  const risk = RISK_CFG[r.risk];
  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-3">
      {/* Başlık: sembol + durum */}
      <div className="flex items-start justify-between gap-2">
        <Link href={`/hisse/${r.symbol}`} className="text-base font-bold text-text-primary hover:text-primary">
          {r.symbol}
        </Link>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}
        </span>
      </div>

      {/* Aksiyon — kahraman */}
      <div className="rounded-lg bg-surface/40 border border-border/40 px-3 py-2">
        <p className="text-[10px] text-text-muted">Ne yapmalı?</p>
        <p className="text-lg font-bold text-text-primary">{ACTION_TR[r.action] ?? r.action}</p>
        <p className="text-xs text-text-secondary mt-0.5 leading-snug">{r.summary}</p>
      </div>

      {/* Bonus rozetleri */}
      {r.flags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {r.flags.map((f) => (
            <span key={f} className="rounded-full border border-border/60 bg-surface/60 px-2 py-0.5 text-[9px] text-text-secondary">
              {FLAG_CFG[f] ?? f}
            </span>
          ))}
        </div>
      )}

      {/* Skorlar */}
      <div className="flex flex-col gap-1.5">
        <ScoreBar label="Teknik" value={r.technical_score} max={7} color="bg-sky-500" />
        <ScoreBar label="Akıllı Para" value={r.smart_money_score} max={10} color="bg-violet-500" />
      </div>

      {/* Alt satır: toplam + risk + kaynak */}
      <div className="flex items-center justify-between text-[10px] text-text-muted pt-1 border-t border-border/30">
        <span>Toplam <strong className="text-text-secondary tabular-nums">{r.total_score}/17</strong></span>
        <span className={`flex items-center gap-1 ${risk.cls}`}><ShieldAlert className="h-3 w-3" />{risk.label}</span>
        <span title="Akıllı para sinyali gerçek takas değil; fiyat-hacimden türetildi.">
          {r.smart_money_source === 'ohlcv-proxy' ? 'proxy ⓘ' : 'takas'}
        </span>
      </div>
    </div>
  );
}

export function AkilliPara({
  heading = 'Akıllı Para Sinyali',
  intro,
}: { heading?: string; intro?: React.ReactNode } = {}) {
  const [data, setData] = useState<SmartSignalResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [scoredAt, setScoredAt] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>('all');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/smart-signal');
      const json = (await res.json()) as ApiResponse;
      setData(json.results ?? []);
      setPending(json.pending ?? false);
      setScoredAt(json.scoredAt ?? null);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { void fetchData(); }, []);

  const filtered = data.filter((r) => status === 'all' || r.status === status);
  const counts = {
    all: data.length,
    STRONG: data.filter((r) => r.status === 'STRONG').length,
    POSITIVE: data.filter((r) => r.status === 'POSITIVE').length,
    NEUTRAL: data.filter((r) => r.status === 'NEUTRAL').length,
    NEGATIVE: data.filter((r) => r.status === 'NEGATIVE').length,
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto max-w-7xl px-4 py-8">
        <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Crosshair className="h-6 w-6 text-fuchsia-400" />
              <h1 className="text-2xl font-bold text-text-primary">{heading}</h1>
            </div>
            <p className="text-sm text-text-secondary max-w-2xl">
              {intro ?? (
                <>
                  Teknik sinyal + akıllı para (fiyat-hacim) birikimini tek basit karara çevirir:
                  <strong> ne yapmalı?</strong> Tüm hesaplar kural-tabanlı; özet AI ile sadeleştirilir.
                </>
              )}
            </p>
            {scoredAt && (
              <p className="text-[11px] text-text-muted mt-1">
                Son tarama: {new Date(scoredAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
          </div>
          <button onClick={() => void fetchData()} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50 self-start">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Yenile
          </button>
        </div>

        {/* Akıllı para şeffaflık notu */}
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-sky-500/25 bg-sky-500/5 px-4 py-2.5">
          <Info className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-text-secondary">
            <strong>Akıllı para</strong> şu an gerçek takas (aracı/MKK) verisi değil — fiyat ve hacimden deterministik türetilen bir
            <strong> proxy</strong>dir (OBV/para-akışı, alım-satım trendi). Gerçek takas eklendiğinde aynı kartlar otomatik güçlenir. Yatırım tavsiyesi değildir.
          </p>
        </div>

        {pending ? (
          <div className="rounded-xl border border-border bg-surface/30 p-8 text-center text-text-muted">
            Tarama henüz çalışmadı. Günlük cron otomatik koşar.
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {(Object.entries({
                all: 'Tümü', STRONG: '🟢 Güçlü', POSITIVE: '🔵 Olumlu', NEUTRAL: '🟡 Nötr', NEGATIVE: '🔴 Olumsuz',
              }) as Array<[StatusFilter, string]>).map(([key, label]) => (
                <button key={key} onClick={() => setStatus(key)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                    status === key ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-surface text-text-secondary hover:border-primary/40'
                  }`}>
                  <span>{label}</span>
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px]">{counts[key]}</span>
                </button>
              ))}
              <span className="ml-auto flex items-center gap-1 text-[11px] text-text-muted">
                <Filter className="h-3.5 w-3.5" /> Skora göre sıralı
              </span>
            </div>

            {loading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, i) => <div key={i} className="h-64 rounded-xl border border-border bg-surface/30 animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface/30 p-8 text-center text-text-muted">Bu filtrede hisse yok</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((r) => <Kart key={r.symbol} r={r} />)}
              </div>
            )}
          </>
        )}

        <p className="mt-8 text-center text-[10px] text-text-muted/60 italic">
          Skor = teknik (0-7) + akıllı para (0-10). 0-4 Olumsuz · 5-8 Nötr · 9-12 Olumlu · 13+ Güçlü.
          Kural-tabanlı; geçmiş performans geleceği garanti etmez. Yatırım tavsiyesi değildir.
        </p>
      </main>
    </div>
  );
}
