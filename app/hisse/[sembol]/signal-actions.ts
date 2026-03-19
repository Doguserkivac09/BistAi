'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';

interface SaveSignalParams {
  sembol: string;
  signalType: string;
  signalData: Record<string, unknown>;
  aiExplanation: string;
}

export async function saveSignal({
  sembol,
  signalType,
  signalData,
  aiExplanation,
}: SaveSignalParams) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/giris');
  }

  const normalizedSembol = sembol.toUpperCase().trim();
  const { error } = await supabase.from('saved_signals').insert({
    user_id: user.id,
    sembol: normalizedSembol,
    signal_type: signalType,
    signal_data: signalData ?? {},
    ai_explanation: aiExplanation ?? '',
  });

  if (error) {
    if (error.code === '23505') {
      revalidatePath('/dashboard');
      revalidatePath(`/hisse/${normalizedSembol}`);
      return;
    }
    throw new Error(`Sinyal kaydedilemedi: ${error.message}`);
  }

  revalidatePath('/dashboard');
  revalidatePath(`/hisse/${normalizedSembol}`);
}
