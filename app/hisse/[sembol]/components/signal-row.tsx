'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SignalBadge } from '@/components/SignalBadge';
import { SignalExplanation } from '@/components/SignalExplanation';
import { SaveSignalButton } from '@/components/SaveSignalButton';
import { WinRateBadge, type WinRateStat } from '@/components/WinRateBadge';
import { signalHelpUrl } from '@/lib/signal-content';
import type { StockSignal } from '@/types';

// ── Sinyal doğal vadesi ───────────────────────────────────────────────
export const SIGNAL_VADE: Record<string, { label: string; color: string }> = {
  'Altın Çapraz':           { label: '30g vade', color: 'text-violet-400 border-violet-500/30 bg-violet-500/10' },
  'Ölüm Çaprazı':           { label: '30g vade', color: 'text-violet-400 border-violet-500/30 bg-violet-500/10' },
  'Trend Başlangıcı':       { label: '14g vade', color: 'text-blue-400   border-blue-500/30   bg-blue-500/10'   },
  'Destek/Direnç Kırılımı': { label: '14g vade', color: 'text-blue-400   border-blue-500/30   bg-blue-500/10'   },
  'Higher Lows':            { label: '14g · ⚡ erken', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  'MACD Kesişimi':          { label: '7g vade',  color: 'text-cyan-400   border-cyan-500/30   bg-cyan-500/10'   },
  'RSI Uyumsuzluğu':        { label: '7g vade',  color: 'text-cyan-400   border-cyan-500/30   bg-cyan-500/10'   },
  'Bollinger Sıkışması':    { label: '7g vade',  color: 'text-cyan-400   border-cyan-500/30   bg-cyan-500/10'   },
  'RSI Seviyesi':           { label: '3g vade',  color: 'text-amber-400  border-amber-500/30  bg-amber-500/10'  },
  'Hacim Anomalisi':        { label: '3g vade',  color: 'text-amber-400  border-amber-500/30  bg-amber-500/10'  },
  'Altın Çapraz Yaklaşıyor':{ label: '30g · ⚡ pre', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  'Trend Olgunlaşıyor':     { label: '14g · ⚡ pre', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  'Direnç Testi':           { label: '14g · ⚡ pre', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  'MACD Daralıyor':         { label: '7g · ⚡ pre',  color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  'Çift Dip':               { label: '14g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Çift Tepe':              { label: '14g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Bull Flag':              { label: '14g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Bear Flag':              { label: '14g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Cup & Handle':           { label: '30g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Ters Omuz-Baş-Omuz':     { label: '30g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  'Yükselen Üçgen':         { label: '14g · 📐 form', color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
};

const FORMATION_TYPES = ['Çift Dip','Çift Tepe','Bull Flag','Bear Flag','Cup & Handle','Ters Omuz-Baş-Omuz','Yükselen Üçgen'];

// ── Haftalık uyum rozeti ──────────────────────────────────────────────
export function MTFBadge({ aligned }: { aligned: boolean }) {
  return aligned ? (
    <span title="Haftalık trend ile uyumlu — güçlü sinyal"
      className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">W✓</span>
  ) : (
    <span title="Haftalık trend ile uyumsuz — zayıf sinyal"
      className="inline-flex items-center rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">W✗</span>
  );
}

// ── Accordion sinyal satırı ────────────────────────────────────────────
export function AccordionSignalRow({ sig, explanation, sembol, savedSignalTypes, winRate }: {
  sig: StockSignal;
  explanation: string | null;
  sembol: string;
  savedSignalTypes: string[];
  winRate: WinRateStat | null;
}) {
  const [open, setOpen] = useState(false);
  const isUp   = sig.direction === 'yukari';
  const isDown = sig.direction === 'asagi';
  const borderColor = isUp ? 'border-l-emerald-500' : isDown ? 'border-l-red-500' : 'border-l-border';
  const bgOpen      = isUp ? 'bg-emerald-500/5' : isDown ? 'bg-red-500/5' : 'bg-surface/30';
  const sigData     = sig.data as unknown as Record<string, number> | undefined;

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center gap-2 border-l-2 ${borderColor} px-3 py-3 text-left transition-colors ${open ? bgOpen : 'hover:bg-surface-alt/30'}`}
      >
        <SignalBadge type={sig.type} direction={sig.direction} severity={sig.severity} />
        <WinRateBadge stat={winRate} horizon="7g" showInsufficient />
        {sig.weeklyAligned !== undefined && <MTFBadge aligned={sig.weeklyAligned} />}
        <div className="min-w-0 flex-1">
          {!open && explanation && (
            <p className="truncate text-xs text-text-muted leading-snug hidden sm:block">
              {explanation.replace(/\*\*/g, '').slice(0, 80)}…
            </p>
          )}
        </div>
        {SIGNAL_VADE[sig.type] && (
          <span className={`shrink-0 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${SIGNAL_VADE[sig.type]!.color}`}>
            {SIGNAL_VADE[sig.type]!.label}
          </span>
        )}
        {(() => {
          const helpUrl = signalHelpUrl(sig.type);
          if (!helpUrl) return null;
          const isFormation = FORMATION_TYPES.includes(sig.type);
          return (
            <>
              {isFormation && (
                <span title='Grafikte "📐 Formasyon" toggle ile görselleştir' className="shrink-0 text-[10px] text-orange-400/70">📐</span>
              )}
              <Link href={helpUrl} onClick={(e) => e.stopPropagation()} title={`"${sig.type}" sinyalini öğren`}
                className="shrink-0 text-[11px] text-text-muted/60 hover:text-primary transition-colors">
                ⓘ
              </Link>
            </>
          );
        })()}
        {sigData?.candlesAgo !== undefined && (
          <span className="shrink-0 text-[10px] text-text-muted hidden sm:block">{sigData.candlesAgo}g önce</span>
        )}
        {sigData?.confluenceScore !== undefined && (
          <span className={`shrink-0 text-[10px] font-mono font-semibold hidden sm:block ${
            sigData.confluenceScore >= 70 ? 'text-emerald-400' :
            sigData.confluenceScore >= 40 ? 'text-amber-400' : 'text-text-muted'
          }`}>%{sigData.confluenceScore}</span>
        )}
        <span className={`shrink-0 text-[10px] text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className={`px-3 pb-4 pt-2 space-y-3 border-l-2 ${borderColor} ${bgOpen}`}>
          {sig.stopLoss && sig.targetPrice && sig.entryPrice && (
            <div className="rounded-lg border border-border/60 bg-surface/50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mb-2">Risk Yönetimi</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md border border-red-500/25 bg-red-500/8 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-red-400/70 mb-0.5">Zarar Kes</p>
                  <p className="text-sm font-bold text-red-400">{sig.stopLoss.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-[9px] text-red-400/60 mt-0.5">{(((sig.stopLoss - sig.entryPrice) / sig.entryPrice) * 100).toFixed(1)}%</p>
                </div>
                <div className="rounded-md border border-border/40 bg-surface/40 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-text-muted mb-0.5">Giriş</p>
                  <p className="text-sm font-bold text-text-primary">{sig.entryPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-[9px] text-text-muted mt-0.5">ATR {sig.atr?.toFixed(2)}</p>
                </div>
                <div className="rounded-md border border-emerald-500/25 bg-emerald-500/8 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wider text-emerald-400/70 mb-0.5">Hedef</p>
                  <p className="text-sm font-bold text-emerald-400">{sig.targetPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-[9px] text-emerald-400/60 mt-0.5">+{(((sig.targetPrice - sig.entryPrice) / sig.entryPrice) * 100).toFixed(1)}%</p>
                </div>
              </div>
              {sig.riskRewardRatio && (
                <p className="mt-2 text-center text-[10px] text-text-muted">
                  Risk/Ödül:&nbsp;
                  <span className={`font-semibold ${sig.riskRewardRatio >= 2 ? 'text-emerald-400' : sig.riskRewardRatio >= 1.5 ? 'text-amber-400' : 'text-red-400'}`}>
                    1 : {sig.riskRewardRatio.toFixed(1)}
                  </span>
                  <span className="ml-2 text-text-muted/60">({sig.riskRewardRatio >= 2 ? 'İyi' : sig.riskRewardRatio >= 1.5 ? 'Kabul edilebilir' : 'Düşük'})</span>
                </p>
              )}
              <p className="mt-2 text-[9px] text-text-muted/50 text-center">* ATR bazlı teorik seviyeler. Yatırım tavsiyesi değildir.</p>
            </div>
          )}
          <SignalExplanation text={explanation} isLoading={!explanation} />
          {sig.weeklyAligned !== undefined && (
            <div className={`rounded-md border px-2.5 py-2 text-[11px] ${sig.weeklyAligned ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200' : 'border-red-500/30 bg-red-500/5 text-red-200'}`}>
              <p className="font-semibold">{sig.weeklyAligned ? '✦ Haftalık trend uyumlu' : '⚠ Haftalık trend uyumsuz'}</p>
              <p className="mt-0.5 text-[10px] opacity-80">
                {sig.weeklyAligned
                  ? 'Günlük sinyal yönü haftalık EMA8 trendiyle hizalı — güç çarpanı +'
                  : 'Günlük sinyal haftalık trende ters yönde — counter-trend riski, stop sıkı tutulmalı'}
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <SaveSignalButton sembol={sembol} signalType={sig.type} signalData={sig.data} aiExplanation={explanation ?? ''} isSaved={savedSignalTypes.includes(sig.type)} />
          </div>
        </div>
      )}
    </div>
  );
}
