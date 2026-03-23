'use client';

import type { TechFairValueResult, FairValueZone } from '@/lib/tech-fair-value';

interface AdilDegerMetreProps {
  result: TechFairValueResult;
}

const ZONE_CONFIG: Record<FairValueZone, {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  barColor: string;
}> = {
  asiri_pahali: {
    label:       'Aşırı Pahalı',
    color:       'text-red-400',
    bgColor:     'bg-red-500/10',
    borderColor: 'border-red-500/30',
    barColor:    'bg-red-500',
  },
  pahali: {
    label:       'Pahalı',
    color:       'text-orange-400',
    bgColor:     'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    barColor:    'bg-orange-500',
  },
  adil_deger: {
    label:       'Adil Değer',
    color:       'text-emerald-400',
    bgColor:     'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    barColor:    'bg-emerald-500',
  },
  ucuz: {
    label:       'Ucuz',
    color:       'text-sky-400',
    bgColor:     'bg-sky-500/10',
    borderColor: 'border-sky-500/30',
    barColor:    'bg-sky-500',
  },
  asiri_ucuz: {
    label:       'Aşırı Ucuz',
    color:       'text-blue-400',
    bgColor:     'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    barColor:    'bg-blue-500',
  },
};

/**
 * Teknik Adil Değer Metre bileşeni.
 * Fiyatın EMA50/200 + SMA20 ortalamasına göre konumunu görselleştirir.
 */
export function AdilDegerMetre({ result }: AdilDegerMetreProps) {
  if (!result.valid) {
    return (
      <p className="text-sm text-text-secondary">
        Adil değer hesabı için yeterli veri yok (minimum 50 mum gerekli).
      </p>
    );
  }

  const cfg = ZONE_CONFIG[result.zone];

  // Gösterge ibresi pozisyonu: sapma -30% → 0%, 0% → 50%, +30% → 100%
  // Aralık: -30..+30 → 0..100
  const RANGE = 30;
  const needlePct = Math.max(0, Math.min(100,
    ((result.deviationPct + RANGE) / (RANGE * 2)) * 100
  ));

  return (
    <div className="space-y-4">
      {/* Bölge etiketi */}
      <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 ${cfg.bgColor} ${cfg.borderColor}`}>
        <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
        <span className={`text-xs ${cfg.color}`}>
          {result.deviationPct > 0 ? '+' : ''}{result.deviationPct}%
        </span>
      </div>

      {/* Gradient ölçek çubuğu */}
      <div className="relative">
        {/* Ölçek renk bandı */}
        <div className="h-3 w-full overflow-hidden rounded-full"
          style={{
            background: 'linear-gradient(to right, #3b82f6, #38bdf8, #34d399, #f97316, #ef4444)',
          }}
        />

        {/* İbre */}
        <div
          className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md"
          style={{ left: `${needlePct}%` }}
        />

        {/* Bölge etiketleri */}
        <div className="mt-1.5 flex justify-between text-[10px] text-text-muted">
          <span>Aşırı Ucuz</span>
          <span>Ucuz</span>
          <span>Adil Değer</span>
          <span>Pahalı</span>
          <span>Aşırı Pahalı</span>
        </div>
      </div>

      {/* Fiyat bilgileri */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetreCell
          label="Mevcut Fiyat"
          value={`${result.currentPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}₺`}
          highlight
        />
        <MetreCell
          label="Adil Değer"
          value={`${result.fairValue.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}₺`}
        />
        {result.ema50 && (
          <MetreCell label="EMA50" value={`${result.ema50.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}₺`} />
        )}
        {result.ema200 && (
          <MetreCell label="EMA200" value={`${result.ema200.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}₺`} />
        )}
      </div>

      {/* Açıklama */}
      <p className="text-xs text-text-muted">
        Adil değer = EMA50{result.ema200 ? ' + EMA200' : ''} + SMA20 ortalaması.
        {result.deviationPct > 0
          ? ` Fiyat adil değerin %${Math.abs(result.deviationPct)} üzerinde.`
          : result.deviationPct < 0
          ? ` Fiyat adil değerin %${Math.abs(result.deviationPct)} altında.`
          : ' Fiyat adil değer bölgesinde.'}
      </p>
    </div>
  );
}

function MetreCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-2 text-center ${highlight ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface'}`}>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-primary' : 'text-text-primary'}`}>{value}</p>
    </div>
  );
}
