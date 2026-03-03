'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { saveSignal } from '@/app/hisse/[sembol]/signal-actions';

interface SaveSignalButtonProps {
  sembol: string;
  signalType: string;
  signalData: Record<string, unknown>;
  aiExplanation: string;
  isSaved: boolean;
}

export function SaveSignalButton({
  sembol,
  signalType,
  signalData,
  aiExplanation,
  isSaved: initialSaved,
}: SaveSignalButtonProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (saved || pending) return;
    setSaved(true);
    setPending(true);
    try {
      await saveSignal({
        sembol,
        signalType,
        signalData,
        aiExplanation,
      });
      router.refresh();
    } catch {
      setSaved(false);
    } finally {
      setPending(false);
    }
  }

  if (saved) {
    return (
      <Button variant="secondary" size="sm" disabled className="shrink-0">
        Kaydedildi
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      className="shrink-0"
    >
      {pending ? '...' : 'Kaydet'}
    </Button>
  );
}
