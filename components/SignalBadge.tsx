'use client';

import { cn } from '@/lib/utils';
import type { SignalDirection, SignalSeverity } from '@/types';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

interface SignalBadgeProps {
  type: string;
  direction: SignalDirection;
  severity: SignalSeverity;
  className?: string;
}

const severityLabels: Record<SignalSeverity, string> = {
  güçlü: 'Güçlü',
  orta: 'Orta',
  zayıf: 'Zayıf',
};

export function SignalBadge({ type, direction, severity, className }: SignalBadgeProps) {
  const isUp = direction === 'yukari';
  const isDown = direction === 'asagi';
  const colorClass = isUp ? 'text-bullish' : isDown ? 'text-bearish' : 'text-text-secondary';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium',
        className
      )}
    >
      <span className="text-text-primary">{type}</span>
      <span className={cn('flex items-center', colorClass)}>
        {isUp && <ArrowUp className="h-3.5 w-3.5" />}
        {isDown && <ArrowDown className="h-3.5 w-3.5" />}
        {direction === 'nötr' && <Minus className="h-3.5 w-3.5" />}
      </span>
      <span className="text-text-secondary">•</span>
      <span className="text-text-secondary">{severityLabels[severity]}</span>
    </div>
  );
}
