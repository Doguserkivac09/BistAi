'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

/**
 * Supabase Realtime ile yeni yorum dinler.
 * Post detay sayfasında kullanılır.
 *
 * Phase 10.7
 */
export function useRealtimeComments(
  postId: string | null,
  onNewComment: () => void
) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!postId) return;

    const supabase = createClient();

    const channel = supabase
      .channel(`comments:${postId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          onNewComment();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${postId}`,
        },
        () => {
          onNewComment();
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [postId, onNewComment]);
}
