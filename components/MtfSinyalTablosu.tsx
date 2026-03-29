'use client';

import { useEffect, useState } from 'react';
import type { MtfResponse, MtfRow } from '@/app/api/mtf-analiz/route';

interface Props {
  sembol: string;
}

export function MtfSinyalTablosu({ sembol }: Props) {
  const [data, setData] = useState<MtfResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sembol) return;
    setLoading(true);
    fetch(`/api/mtf-analiz?symbol=${sembol}`)
      .then(r => r.json())
      .then((d: MtfResponse) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sembol]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-surface" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-3">
      {/* Tablo */}
      <div className="overflow-hidden rounded-xl border border-border">
        {/* Başlık satırı */}
        <div className="grid grid-cols-4 border-b border-border bg-surface/80 px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
          <span>Zaman Dilimi</span>
          <span className="text-center">Karar</span>
          <span className="text-center">Sinyaller</span>
          <span className="text-center">Ağırlık</span>
        </div>

        {/* Satırlar */}
        {data.rows.map((row, i) => (
          <MtfSatir key={row.tf} row={row} isLast={i === data.rows.length - 1} />
        ))}
      </div>

      {/* Uyum özeti */}
      <ConfluenceBadge data={data} />
    </div>
  );
}

// ── Tek satır ─────────────────────────────────────────────────────────────────

function MtfSatir({ row, isLast }: { row: MtfRow; isLast: boolean }) {
  const decisionColor = {
    AL:  'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    SAT: 'text-red-400 bg-red-500/10 border-red-500/30',
    TUT: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  }[row.decision];

  const strengthColor = {
    güçlü: 'text-emerald-400',
    orta:  'text-yellow-400',
    zayıf: 'text-text-muted',
  }[row.strength];

  const bars = row.totalSignals > 0
    ? Math.max(1, Math.round((row.totalSignals / 4) * 3)) // max 3 çubuk
    : 0;

  return (
    <div className={`grid grid-cols-4 items-center px-4 py-3 ${!isLast ? 'border-b border-border/50' : ''} hover:bg-surface/50 transition-colors`}>
      {/* Zaman dilimi */}
      <div>
        <span className="text-sm font-bold text-text-primary">{row.shortLabel}</span>
        <span className="ml-1.5 text-[10px] text-text-muted">{row.label}</span>
      </div>

      {/* Karar badge */}
      <div className="flex justify-center">
        <span className={`rounded border px-2.5 py-0.5 text-xs font-bold ${decisionColor}`}>
          {row.decision}
        </span>
      </div>

      {/* Sinyal adları */}
      <div className="flex justify-center">
        {row.dominantSignals.length > 0 ? (
          <div className="flex flex-col items-center gap-0.5">
            {row.dominantSignals.map(s => (
              <span key={s} className="text-[10px] text-text-secondary leading-tight text-center">
                {s}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-[10px] text-text-muted">—</span>
        )}
      </div>

      {/* Güç çubukları */}
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex gap-0.5">
          {[1, 2, 3].map(n => (
            <div
              key={n}
              className={`h-3 w-1.5 rounded-sm transition-colors ${
                n <= bars ? strengthColor.replace('text-', 'bg-').replace('-400', '-400/80') : 'bg-border/40'
              }`}
            />
          ))}
        </div>
        <span className={`text-[9px] ${strengthColor}`}>{row.strength}</span>
      </div>
    </div>
  );
}

// ── Uyum özeti ────────────────────────────────────────────────────────────────

function ConfluenceBadge({ data }: { data: MtfResponse }) {
  const { confluenceLabel, confluenceDir, bullishTfCount, bearishTfCount, rows } = data;
  const total = rows.length;

  // Günlük (1d) veya haftalık (1wk) zaman dilimi genel konsensüsle çelişiyor mu?
  const dailyRow   = rows.find(r => r.tf === '1d');
  const weeklyRow  = rows.find(r => r.tf === '1wk');
  const dailyConflicts  = dailyRow  && dailyRow.decision  !== 'TUT' && dailyRow.decision  !== confluenceDir;
  const weeklyConflicts = weeklyRow && weeklyRow.decision !== 'TUT' && weeklyRow.decision !== confluenceDir;

  const bgColor = {
    AL:  'border-emerald-500/30 bg-emerald-500/8',
    SAT: 'border-red-500/30 bg-red-500/8',
    TUT: 'border-yellow-500/30 bg-yellow-500/8',
  }[confluenceDir];

  const textColor = {
    AL:  'text-emerald-400',
    SAT: 'text-red-400',
    TUT: 'text-yellow-400',
  }[confluenceDir];

  return (
    <div className="space-y-1.5">
      <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${bgColor}`}>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${textColor}`}>{confluenceLabel}</span>
          <span className="text-xs text-text-muted">
            ({bullishTfCount} AL · {bearishTfCount} SAT · {total - bullishTfCount - bearishTfCount} TUT)
          </span>
        </div>
        {/* Mini progress */}
        <div className="flex items-center gap-1">
          {rows.map(r => (
            <div
              key={r.tf}
              title={`${r.shortLabel}: ${r.decision}`}
              className={`h-2 w-2 rounded-full ${
                r.decision === 'AL'  ? 'bg-emerald-400' :
                r.decision === 'SAT' ? 'bg-red-400' :
                'bg-yellow-400/50'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Çelişki uyarısı */}
      {(dailyConflicts || weeklyConflicts) && (
        <div className="flex items-start gap-1.5 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2">
          <span className="mt-0.5 text-xs">⚠️</span>
          <p className="text-[11px] text-orange-300/80 leading-snug">
            {dailyConflicts && weeklyConflicts
              ? `Günlük ve haftalık zaman dilimleri ${dailyRow!.decision} sinyali veriyor — genel uyumla çelişiyor. Kısa vadeli hareketlere dikkat edin.`
              : dailyConflicts
              ? `Günlük (1G) zaman dilimi ${dailyRow!.decision} sinyali veriyor — diğer zaman dilimleriyle çelişiyor. AI Yorumu günlük sinyali baz alır.`
              : `Haftalık (1H) zaman dilimi ${weeklyRow!.decision} sinyali veriyor — uzun vadeli trend farklı yönde.`
            }
          </p>
        </div>
      )}
    </div>
  );
}
