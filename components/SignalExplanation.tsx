'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface SignalExplanationProps {
  text: string | null;
  isLoading?: boolean;
  error?: string | null;
  className?: string;
  /** Metni 4 satırla sınırla, taşıyorsa "Daha fazla" toggle göster */
  clamp?: boolean;
}

export function SignalExplanation({
  text,
  isLoading,
  error,
  className,
  clamp = false,
}: SignalExplanationProps) {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const pRef = useRef<HTMLParagraphElement>(null);

  // Metnin gerçekten taşıp taşmadığını ölç
  useEffect(() => {
    if (!clamp || !pRef.current || expanded) return;
    setIsClamped(pRef.current.scrollHeight > pRef.current.offsetHeight + 2);
  }, [text, clamp, expanded]);

  if (error) {
    return <p className={cn('text-sm text-bearish', className)}>{error}</p>;
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
      <p className={cn('text-sm text-text-secondary', className)}>
        Açıklama yükleniyor...
      </p>
    );
  }

  return (
    <div className={className}>
      <p
        ref={pRef}
        className={cn(
          'text-sm text-text-secondary leading-relaxed',
          clamp && !expanded && 'line-clamp-4'
        )}
      >
        {renderBoldText(text)}
      </p>
      {clamp && (isClamped || expanded) && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-xs text-primary hover:underline"
        >
          {expanded ? 'Daha az' : 'Daha fazla'}
        </button>
      )}
    </div>
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
