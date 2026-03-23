'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FiyatHedefleri } from '@/components/FiyatHedefleri';
import type { HisseAnalizResponse } from '@/app/api/hisse-analiz/route';

interface HisseAIYorumProps {
  sembol: string;
}

/**
 * Hisse Detay Sayfası — AI Genel Yorum + Fiyat Hedefleri
 *
 * /api/hisse-analiz?symbol=X endpoint'inden veri çeker.
 * Kompozit karar (BUY/HOLD/SELL), güven skoru, AI açıklaması
 * ve fiyat hedeflerini tek kartta gösterir.
 */
export function HisseAIYorum({ sembol }: HisseAIYorumProps) {
  const [analiz, setAnaliz] = useState<HisseAnalizResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/hisse-analiz?symbol=${encodeURIComponent(sembol)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.statusText)))
      .then((data: HisseAnalizResponse) => {
        if (!cancelled) setAnaliz(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [sembol]);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span>🤖</span>
          <span>AI Genel Yorumu</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <AIYorumSkeleton />}

        {!loading && error && (
          <p className="text-sm text-text-secondary">Analiz yüklenemedi.</p>
        )}

        {!loading && analiz && (
          <>
            {/* Karar + Güven */}
            <div className="flex flex-wrap items-center gap-3">
              <DecisionBadge
                decision={analiz.decision}
                decisionTr={analiz.decisionTr}
                color={analiz.color}
                emoji={analiz.emoji}
              />
              <ConfidenceMeter confidence={analiz.confidence} />
              {!analiz.noSignal && (
                <span className="text-xs text-text-muted">
                  Sektör: {analiz.sectorName}
                </span>
              )}
            </div>

            {/* AI Açıklaması */}
            <p className="text-sm leading-relaxed text-text-secondary">
              {analiz.explanation}
            </p>

            {/* Skor çubukları */}
            {!analiz.noSignal && (
              <div className="grid grid-cols-3 gap-2">
                <ScoreBar label="Teknik" score={analiz.technicalScore} />
                <ScoreBar label="Makro" score={analiz.macroScore} />
                <ScoreBar label="Sektör" score={analiz.sectorScore} />
              </div>
            )}

            {/* Fiyat Hedefleri */}
            {!analiz.noSignal && analiz.priceTargets && (
              <div className="rounded-xl border border-border bg-surface/50 p-4">
                <p className="mb-3 text-xs font-medium text-text-secondary uppercase tracking-wide">
                  Fiyat Hedefleri
                </p>
                <FiyatHedefleri priceTargets={analiz.priceTargets} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Alt Bileşenler ───────────────────────────────────────────────────

function DecisionBadge({
  decision,
  decisionTr,
  color,
  emoji,
}: {
  decision: string;
  decisionTr: string;
  color: string;
  emoji: string;
}) {
  const bgMap: Record<string, string> = {
    STRONG_BUY:  'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
    BUY:         'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    HOLD:        'bg-gray-500/10 border-gray-500/30 text-gray-400',
    SELL:        'bg-red-500/10 border-red-500/30 text-red-400',
    STRONG_SELL: 'bg-red-500/15 border-red-500/40 text-red-300',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold ${bgMap[decision] ?? 'border-border text-text-primary'}`}
      style={{ color }}
    >
      <span>{emoji}</span>
      <span>{decisionTr}</span>
    </span>
  );
}

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const color =
    confidence >= 70 ? 'text-emerald-400' : confidence >= 40 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface">
        <div
          className={`h-full rounded-full transition-all ${
            confidence >= 70 ? 'bg-emerald-500' : confidence >= 40 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${confidence}%` }}
        />
      </div>
      <span className={`text-xs font-medium ${color}`}>%{confidence} güven</span>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const abs = Math.abs(score);
  const isPositive = score >= 0;
  const barColor = isPositive ? 'bg-emerald-500' : 'bg-red-500';
  const textColor = isPositive ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">{label}</span>
        <span className={`text-xs font-medium ${textColor}`}>
          {score > 0 ? '+' : ''}{score}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-surface">
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${abs}%` }}
        />
      </div>
    </div>
  );
}

function AIYorumSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="flex gap-3">
        <div className="h-7 w-24 rounded-full bg-surface" />
        <div className="h-7 w-28 rounded-full bg-surface" />
      </div>
      <div className="h-4 w-full rounded bg-surface" />
      <div className="h-4 w-5/6 rounded bg-surface" />
      <div className="h-4 w-4/6 rounded bg-surface" />
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 rounded-lg bg-surface" />
        ))}
      </div>
    </div>
  );
}
