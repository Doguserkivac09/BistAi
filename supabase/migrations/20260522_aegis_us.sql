-- Aegis-US Portföyü — ABD Borsası Orta Vadeli
-- Aegis BIST'in USD bazlı aynası. Başlangıç: $2.000

CREATE TABLE IF NOT EXISTS public.aegis_us_positions (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  sembol            text        NOT NULL,
  sector_id         text,
  sector_name       text,
  shares            float8      NOT NULL,
  entry_price       float8      NOT NULL,
  entry_time        timestamptz NOT NULL DEFAULT now(),
  entry_date        date        NOT NULL DEFAULT CURRENT_DATE,
  current_price     float8,
  stop_loss         float8,
  take_profit       float8,
  trailing_stop     float8,
  cost_basis        float8,
  entry_week        int,
  entry_year        int,
  is_open           boolean     DEFAULT true,
  closed_at         timestamptz,
  close_price       float8,
  close_reason      text,
  realized_pnl      float8,
  realized_pnl_pct  float8,
  tp1_hit           boolean     DEFAULT false,
  tp1_hit_at        timestamptz,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aegis_us_positions_open
  ON public.aegis_us_positions (is_open, entry_date DESC);

CREATE TABLE IF NOT EXISTS public.aegis_us_history (
  id               uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  week_number      int   NOT NULL,
  year             int   NOT NULL,
  total_value      float8 NOT NULL,
  cash             float8 NOT NULL,
  positions_value  float8 NOT NULL,
  weekly_return    float8,
  sp500_return     float8,
  alpha            float8,
  total_return     float8,
  max_drawdown     float8,
  position_count   int   DEFAULT 0,
  closed_this_week int   DEFAULT 0,
  opened_this_week int   DEFAULT 0,
  UNIQUE (week_number, year)
);

-- Başlangıç sermayesi: $2.000
INSERT INTO public.aegis_us_history (week_number, year, total_value, cash, positions_value, total_return)
SELECT
  EXTRACT(WEEK FROM CURRENT_DATE)::int,
  EXTRACT(YEAR FROM CURRENT_DATE)::int,
  2000, 2000, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.aegis_us_history LIMIT 1);

CREATE TABLE IF NOT EXISTS public.aegis_us_decisions (
  id                uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  week_number       int   NOT NULL,
  year              int   NOT NULL,
  sembol            text  NOT NULL,
  action            text  NOT NULL CHECK (action IN ('BUY','SELL','HOLD','PARTIAL_SELL')),
  shares            float8,
  theoretical_price float8,
  cost_or_proceeds  float8,
  technical_score   int,
  macro_context     text,
  reason_short      text  NOT NULL,
  outcome_return    float8,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aegis_us_decisions_week
  ON public.aegis_us_decisions (year DESC, week_number DESC);

ALTER TABLE public.aegis_us_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aegis_us_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aegis_us_decisions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aegis_us_positions' AND policyname='aegis_us_pub_read_pos') THEN
    CREATE POLICY "aegis_us_pub_read_pos" ON public.aegis_us_positions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aegis_us_positions' AND policyname='aegis_us_svc_pos') THEN
    CREATE POLICY "aegis_us_svc_pos" ON public.aegis_us_positions FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aegis_us_history' AND policyname='aegis_us_pub_read_his') THEN
    CREATE POLICY "aegis_us_pub_read_his" ON public.aegis_us_history FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aegis_us_history' AND policyname='aegis_us_svc_his') THEN
    CREATE POLICY "aegis_us_svc_his" ON public.aegis_us_history FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aegis_us_decisions' AND policyname='aegis_us_pub_read_dec') THEN
    CREATE POLICY "aegis_us_pub_read_dec" ON public.aegis_us_decisions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='aegis_us_decisions' AND policyname='aegis_us_svc_dec') THEN
    CREATE POLICY "aegis_us_svc_dec" ON public.aegis_us_decisions FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
  END IF;
END $$;
