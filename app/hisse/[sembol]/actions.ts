'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';

export async function addToWatchlist(sembol: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/giris?redirect=/dashboard');
  }

  const normalized = sembol.toUpperCase().trim();
  const { error } = await supabase.from('watchlist').insert({
    user_id: user.id,
    sembol: normalized,
  });

  if (error) {
    if (error.code === '23505') {
      revalidatePath('/dashboard');
      revalidatePath(`/hisse/${normalized}`);
      return;
    }
    throw new Error(`İzleme listesine eklenemedi: ${error.message}`);
  }

  revalidatePath('/dashboard');
  revalidatePath(`/hisse/${normalized}`);
}

export async function removeFromWatchlist(sembol: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/giris?redirect=/dashboard');
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
