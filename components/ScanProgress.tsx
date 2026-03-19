'use client';

interface ScanProgressProps {
  current: number;
  total: number;
  symbol: string;
}

export function ScanProgress({ current, total, symbol }: ScanProgressProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="rounded-card border border-border bg-surface/50 p-6">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="text-text-secondary">
          Taranıyor: <span className="font-medium text-text-primary">{symbol}</span>
        </span>
        <span className="text-text-secondary">
          {current}/{total}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-center text-xs text-text-secondary">
        %{percent} tamamlandı
      </p>
    </div>
  );
}
