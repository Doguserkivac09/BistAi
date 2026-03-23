'use client';

import { useEffect, useState } from 'react';
import type { SinyalGecmisiResponse, SignalRecord } from '@/app/api/sinyal-gecmisi/route';

interface SinyalGecmisiProps {
  sembol: string;
}

/**
 * Sinyal Geçmişi bileşeni.
 * Kullanıcının bu hisse için kayıtlı sinyal performans geçmişini gösterir.
 */
export function SinyalGecmisi({ sembol }: SinyalGecmisiProps) {
  const [data, setData]       = useState<SinyalGecmisiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notAuth, setNotAuth] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotAuth(false);

    fetch(`/api/sinyal-gecmisi?symbol=${encodeURIComponent(sembol)}&limit=10`)
      .then(async (r) => {
        if (r.status === 401) { if (!cancelled) setNotAuth(true); return; }
        if (!r.ok) return;
        const json: SinyalGecmisiResponse = await r.json();
        if (!cancelled) setData(json);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [sembol]);

  if (loading) return <GecmisSkeleton />;

  if (notAuth) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">
          Sinyal geçmişini görmek için giriş yapmanız gerekiyor.
        </p>
      </div>
    );
  }

  if (!data || data.stats.total === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <p className="text-sm text-text-secondary">
          {sembol} için henüz kayıtlı sinyal geçmişi yok.
          Hisse detay sayfasını ziyaret ettikçe sinyaller otomatik kaydedilir.
        </p>
      </div>
    );
  }

  const { signals, stats } = data;

  return (
    <div className="space-y-4">
      {/* Özet istatistik */}
      <div className="grid grid-cols-3 gap-3">
        <StatCell label="Toplam Sinyal" value={String(stats.total)} />
        <StatCell label="Değerlendirilen" value={String(stats.evaluated)} />
        <StatCell
          label="Başarı Oranı"
          value={stats.successRate !== null ? `%${stats.successRate}` : '—'}
          highlight={stats.successRate !== null}
          successRate={stats.successRate}
        />
      </div>

      {/* Sinyal listesi */}
      <div className="space-y-2">
        {signals.map((sig) => (
          <SinyalSatir key={sig.id} signal={sig} />
        ))}
      </div>

      {stats.total > signals.length && (
        <p className="text-center text-xs text-text-muted">
          +{stats.total - signals.length} daha eski kayıt var
        </p>
      )}
    </div>
  );
}

// ── Alt Bileşenler ────────────────────────────────────────────────────

function SinyalSatir({ signal }: { signal: SignalRecord }) {
  const directionLabel =
    signal.direction === 'yukari' ? 'Yükseliş' :
    signal.direction === 'asagi'  ? 'Düşüş'    : 'Nötr';

  const directionColor =
    signal.direction === 'yukari' ? 'text-emerald-400' :
    signal.direction === 'asagi'  ? 'text-red-400'     : 'text-gray-400';

  const tarih = new Date(signal.entry_time).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2.5 gap-2">
      {/* Sol: Tarih + sinyal tipi */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-text-primary truncate">
            {signal.signal_type}
          </span>
          <span className={`text-xs ${directionColor}`}>{directionLabel}</span>
          {signal.regime && (
            <span className="rounded bg-surface-alt px-1.5 py-0.5 text-[10px] text-text-muted border border-border">
              {signal.regime === 'bull_trend' ? 'Boğa' : signal.regime === 'bear_trend' ? 'Ayı' : 'Yatay'}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-text-muted">
          <span>{tarih}</span>
          <span>·</span>
          <span>Giriş: {signal.entry_price.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}₺</span>
        </div>
      </div>

      {/* Sağ: Getiri + sonuç */}
      <div className="flex items-center gap-2 shrink-0">
        {signal.evaluated && signal.return_7d != null ? (
          <>
            <ReturnBadge label="3G" value={signal.return_3d} />
            <ReturnBadge label="7G" value={signal.return_7d} bold />
            <SuccessBadge success={signal.success} />
          </>
        ) : (
          <span className="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-[10px] text-text-muted">
            ⏳ Beklemede
          </span>
        )}
      </div>
    </div>
  );
}

function ReturnBadge({ label, value, bold }: { label: string; value: number | null; bold?: boolean }) {
  if (value == null) return null;
  const isPos = value >= 0;
  return (
    <div className="text-center">
      <p className="text-[10px] text-text-muted">{label}</p>
      <p className={`text-xs ${bold ? 'font-semibold' : ''} ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
        {isPos ? '+' : ''}{value.toFixed(1)}%
      </p>
    </div>
  );
}

function SuccessBadge({ success }: { success: boolean | null }) {
  if (success === null) return null;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
      success
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
        : 'border-red-500/40 bg-red-500/10 text-red-400'
    }`}>
      {success ? '✓ Başarılı' : '✗ Başarısız'}
    </span>
  );
}

function StatCell({
  label, value, highlight, successRate,
}: {
  label: string; value: string; highlight?: boolean; successRate?: number | null;
}) {
  const valueColor = highlight && successRate != null
    ? successRate >= 60 ? 'text-emerald-400'
    : successRate >= 40 ? 'text-yellow-400'
    : 'text-red-400'
    : 'text-text-primary';

  return (
    <div className="rounded-lg border border-border bg-surface p-2.5 text-center">
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-base font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}

function GecmisSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-surface" />)}
      </div>
      {[1, 2, 3].map((i) => <div key={i} className="h-14 rounded-lg bg-surface" />)}
    </div>
  );
}
