-- Haftanın Seçimleri
--
-- Her hafta algoritma en güçlü 5-7 hisseyi seçer.
-- Hafta kapanışında performans hesaplanır (entry_price vs kapanış).
-- BIST benchmark ile karşılaştırılır.

CREATE TABLE IF NOT EXISTS public.weekly_picks (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Hafta tanımlayıcısı (ISO hafta numarası + yıl)
  week_number      int         NOT NULL,
  year             int         NOT NULL,
  -- Hisse bilgisi
  sembol           text        NOT NULL,
  sector_id        text,
  sector_name      text,
  -- Seçim anındaki veriler
  entry_price      float8      NOT NULL,
  entry_time       timestamptz NOT NULL DEFAULT now(),
  confluence_score int,
  signal_types     text[]      DEFAULT '{}',
  weekly_aligned   boolean,
  -- Performans (hafta kapanışında güncellenir)
  close_price      float8,      -- Haftanın kapanış fiyatı
  return_pct       float8,      -- (close - entry) / entry * 100
  is_closed        boolean     DEFAULT false,
  closed_at        timestamptz,
  -- BIST benchmark (seçim haftası)
  bist_entry       float8,
  bist_close       float8,
  bist_return_pct  float8,
  -- Meta
  notes            text,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (week_number, year, sembol)
);

-- Index: hafta bazlı sorgular için
CREATE INDEX IF NOT EXISTS idx_weekly_picks_week
  ON public.weekly_picks (year DESC, week_number DESC);

CREATE INDEX IF NOT EXISTS idx_weekly_picks_sembol
  ON public.weekly_picks (sembol, year DESC, week_number DESC);

-- RLS: Herkes okuyabilir (public feature)
ALTER TABLE public.weekly_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_picks_public_read"
  ON public.weekly_picks FOR SELECT USING (true);

CREATE POLICY "weekly_picks_service_write"
  ON public.weekly_picks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
