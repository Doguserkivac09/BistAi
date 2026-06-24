-- Bebek Hisseler — İleriye Dönük Takip (Forward-Tracking, FAZ 4)
--
-- Her hafta modelin EN TEMİZ adaylarını (güçlü/umut + risksiz + likit) fiyat
-- snapshot'ıyla kaydeder. Sonra 4/12/26 hafta ufuklarında getiri + BIST100
-- benchmark hesaplanır. Modelin gerçek kanıtı: "adayların %X'i 3 ayda BIST'i geçti".
--
-- weekly_picks deseninin çoklu-ufuklu versiyonu (bebek oyunları aylarca oynanır).
-- İdempotent — Supabase SQL Editor'da çalıştır.

CREATE TABLE IF NOT EXISTS public.baby_picks (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Hafta tanımlayıcısı (pick'in yapıldığı Pazartesi)
  week_start       date        NOT NULL,
  sembol           text        NOT NULL,
  sector_id        text,
  -- Seçim anındaki snapshot
  baby_score       int         NOT NULL,
  verdict          text,
  entry_price      float8      NOT NULL,
  entry_time       timestamptz NOT NULL DEFAULT now(),
  components       jsonb,        -- { scarcity, accumulation, ignition, catalyst, timing }
  risk_flags       jsonb,
  free_float       float8,
  market_cap       float8,
  pos52            float8,
  range_width      float8,
  bist_entry       float8,       -- XU100 pick anı (benchmark)
  -- Değerlendirme — çoklu ufuk (ufuk geçince doldurulur)
  price_4w         float8,  ret_4w   float8,  bist_ret_4w  float8,
  price_12w        float8,  ret_12w  float8,  bist_ret_12w float8,
  price_26w        float8,  ret_26w  float8,  bist_ret_26w float8,
  last_evaluated_at timestamptz,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (week_start, sembol)
);

CREATE INDEX IF NOT EXISTS idx_baby_picks_week
  ON public.baby_picks (week_start DESC);

CREATE INDEX IF NOT EXISTS idx_baby_picks_sembol
  ON public.baby_picks (sembol, week_start DESC);

ALTER TABLE public.baby_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "baby_picks_public_read"
  ON public.baby_picks FOR SELECT USING (true);

CREATE POLICY "baby_picks_service_write"
  ON public.baby_picks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
