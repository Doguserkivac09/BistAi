'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';

export async function removeFromWatchlist(sembol: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/giris');
  }

  const normalized = sembol.toUpperCase().trim();
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('user_id', user.id)
    .eq('sembol', normalized);

  if (error) {
    throw new Error(`İzleme listesinden çıkarılamadı: ${error.message}`);
  }

  revalidatePath('/dashboard');
  revalidatePath(`/hisse/${normalized}`);
}
