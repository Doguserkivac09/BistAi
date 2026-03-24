'use client';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface SignalExplanationProps {
  text: string | null;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

export function SignalExplanation({
  text,
  isLoading,
  error,
  className,
}: SignalExplanationProps) {
  if (error) {
    return (
      <p className={cn('text-sm text-bearish', className)}>{error}</p>
    );
  }
  if (isLoading) {
    return (
      <div className={cn('space-y-2', className)}>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    );
  }
  if (!text) {
    return (
      <p className={cn('text-sm text-text-secondary', className)}>Açıklama yükleniyor...</p>
    );
  }
  return (
    <p className={cn('text-sm text-text-secondary leading-relaxed', className)}>
      {renderBoldText(text)}
    </p>
  );
}

function renderBoldText(text: string) {
  const parts = text.split('**');
  return parts.map((part, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-semibold text-text-primary">{part}</strong>
      : part
  );
}
