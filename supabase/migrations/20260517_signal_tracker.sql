-- Sinyal Takipçisi
-- Kullanıcı fırsatlar sayfasındaki bir sinyali "takibe alır".
-- Fiyat hareketi bildirim gönderir (+%10, +%20, -%8 eşikleri).

CREATE TABLE IF NOT EXISTS public.signal_tracker (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sembol           text        NOT NULL,
  signal_type      text        NOT NULL,
  direction        text,                          -- 'yukari' | 'asagi'
  tracked_at       timestamptz DEFAULT now(),
  entry_price      float8      NOT NULL,          -- Takibe alındığı andaki fiyat
  confluence_score int,
  sector_name      text,
  notes            text,
  -- İzleme durumu
  is_active        boolean     DEFAULT true,
  -- Bildirim takibi (hangi eşikler zaten gönderildi)
  notified_pcts    float8[]    DEFAULT '{}',
  last_price       float8,                        -- Son güncellenen fiyat
  last_checked_at  timestamptz,
  -- Sonuç (aktif olmaktan çıkınca)
  exit_price       float8,
  exit_reason      text,                          -- 'manual' | 'stop_hit' | 'target_hit'
  deactivated_at   timestamptz,
  UNIQUE(user_id, sembol, signal_type)
);

CREATE INDEX IF NOT EXISTS idx_signal_tracker_user
  ON public.signal_tracker (user_id, is_active, tracked_at DESC);

CREATE INDEX IF NOT EXISTS idx_signal_tracker_sembol
  ON public.signal_tracker (sembol, is_active);

-- RLS
ALTER TABLE public.signal_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signal_tracker_own"
  ON public.signal_tracker FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
