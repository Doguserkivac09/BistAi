-- APEX-US Portföyü — ABD Borsası Agresif Momentum
-- apex_portfolio_* tablolarının USD bazlı aynası
-- Başlangıç sermayesi: $2.000 USD

-- ── Pozisyonlar ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.apex_us_positions (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  sembol            text        NOT NULL,
  sector_id         text,
  sector_name       text,
  shares            float8      NOT NULL,          -- Fractional izinli
  entry_price       float8      NOT NULL,           -- USD
  entry_time        timestamptz NOT NULL DEFAULT now(),
  entry_date        date        NOT NULL DEFAULT CURRENT_DATE,
  current_price     float8,
  stop_loss         float8,
  trailing_stop     float8,
  cost_basis        float8,                         -- USD
  entry_confluence  int,
  entry_rel_vol5    float8,
  is_open           boolean     DEFAULT true,
  closed_at         timestamptz,
  close_price       float8,
  close_reason      text,
  realized_pnl      float8,                         -- USD
  realized_pnl_pct  float8,
  -- Context-aware exit
  tp1_hit           boolean     DEFAULT false,
  tp1_hit_at        timestamptz,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apex_us_positions_open
  ON public.apex_us_positions (is_open, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_apex_us_positions_sembol
  ON public.apex_us_positions (sembol, is_open);

-- ── Günlük Snapshot ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.apex_us_history (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date    date        NOT NULL UNIQUE,
  total_value      float8      NOT NULL,            -- USD
  cash             float8      NOT NULL,
  positions_value  float8      NOT NULL,
  daily_return     float8,
  total_return     float8,
  max_drawdown     float8,
  position_count   int         DEFAULT 0,
  trades_today     int         DEFAULT 0,
  win_rate_30d     float8,
  created_at       timestamptz DEFAULT now()
);

-- Başlangıç sermayesi: $2.000
INSERT INTO public.apex_us_history (snapshot_date, total_value, cash, positions_value, total_return)
SELECT CURRENT_DATE, 2000, 2000, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.apex_us_history LIMIT 1);

-- ── Karar Audit Trail ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.apex_us_decisions (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_date     date        NOT NULL DEFAULT CURRENT_DATE,
  sembol            text        NOT NULL,
  action            text        NOT NULL CHECK (action IN ('BUY','SELL','HOLD','ROTATE_OUT','ROTATE_IN','PARTIAL_SELL')),
  shares            float8,
  theoretical_price float8,                         -- USD
  cost_or_proceeds  float8,                         -- USD
  confluence_score  int,
  rel_vol5          float8,
  stop_loss         float8,
  reason_short      text        NOT NULL,
  signal_type       text,                            -- Win rate by setup
  outcome_return    float8,
  was_correct       boolean,
  -- Haber fiyatlandırma
  news_status       text,
  news_score_adj    int,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apex_us_decisions_date
  ON public.apex_us_decisions (decision_date DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.apex_us_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apex_us_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apex_us_decisions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Positions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='apex_us_positions' AND policyname='apex_us_public_read_pos') THEN
    CREATE POLICY "apex_us_public_read_pos" ON public.apex_us_positions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='apex_us_positions' AND policyname='apex_us_svc_write_pos') THEN
    CREATE POLICY "apex_us_svc_write_pos" ON public.apex_us_positions FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
  END IF;
  -- History
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='apex_us_history' AND policyname='apex_us_public_read_his') THEN
    CREATE POLICY "apex_us_public_read_his" ON public.apex_us_history FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='apex_us_history' AND policyname='apex_us_svc_write_his') THEN
    CREATE POLICY "apex_us_svc_write_his" ON public.apex_us_history FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
  END IF;
  -- Decisions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='apex_us_decisions' AND policyname='apex_us_public_read_dec') THEN
    CREATE POLICY "apex_us_public_read_dec" ON public.apex_us_decisions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='apex_us_decisions' AND policyname='apex_us_svc_write_dec') THEN
    CREATE POLICY "apex_us_svc_write_dec" ON public.apex_us_decisions FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
  END IF;
END $$;
