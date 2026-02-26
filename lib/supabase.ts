/**
 * Supabase istemci ve auth/veritabanı yardımcıları.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { WatchlistItem, SavedSignal } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function createClient() {
  return createSupabaseClient(supabaseUrl, supabaseAnonKey);
}

export async function getWatchlist(userId: string): Promise<WatchlistItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`İzleme listesi alınamadı: ${error.message}`);
  }
  return (data as WatchlistItem[]) ?? [];
}

export async function addToWatchlist(userId: string, sembol: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('watchlist').insert({
    user_id: userId,
    sembol: sembol.toUpperCase().trim(),
  });

  if (error) {
    if (error.code === '23505') {
      throw new Error('Bu hisse zaten izleme listenizde.');
    }
    throw new Error(`İzleme listesine eklenemedi: ${error.message}`);
  }
}

export async function removeFromWatchlist(userId: string, sembol: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('user_id', userId)
    .eq('sembol', sembol.toUpperCase().trim());

  if (error) {
    throw new Error(`İzleme listesinden çıkarılamadı: ${error.message}`);
  }
}

export async function isInWatchlist(userId: string, sembol: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('watchlist')
    .select('id')
    .eq('user_id', userId)
    .eq('sembol', sembol.toUpperCase().trim())
    .maybeSingle();

  if (error) return false;
  return !!data;
}

export async function saveSignal(
  userId: string,
  sembol: string,
  signalType: string,
  signalData: Record<string, unknown>,
  aiExplanation: string
): Promise<SavedSignal> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('saved_signals')
    .insert({
      user_id: userId,
      sembol,
      signal_type: signalType,
      signal_data: signalData,
      ai_explanation: aiExplanation,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Sinyal kaydedilemedi: ${error.message}`);
  }
  return data as SavedSignal;
}

export async function getRecentSavedSignals(userId: string, limit: number = 10): Promise<SavedSignal[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('saved_signals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Kayıtlı sinyaller alınamadı: ${error.message}`);
  }
  return (data as SavedSignal[]) ?? [];
}
