-- APEX Portföyü — Agresif Momentum Trader
-- Günlük kararlar, yüksek konsantrasyon, tight stop, trailing-only çıkış.

CREATE TABLE IF NOT EXISTS public.apex_portfolio_positions (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  sembol           text        NOT NULL,
  sector_id        text,
  sector_name      text,
  shares           float8      NOT NULL,
  entry_price      float8      NOT NULL,
  entry_time       timestamptz NOT NULL DEFAULT now(),
  entry_date       date        NOT NULL DEFAULT CURRENT_DATE,
  current_price    float8,
  stop_loss        float8,
  take_profit      float8,
  trailing_stop    float8,
  cost_basis       float8,
  -- Giriş sinyali bilgisi
  entry_confluence int,
  entry_rel_vol5   float8,
  entry_phase      text,
  -- Durum
  is_open          boolean     DEFAULT true,
  closed_at        timestamptz,
  close_price      float8,
  close_reason     text,
  realized_pnl     float8,
  realized_pnl_pct float8,
  days_held        int,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apex_positions_open
  ON public.apex_portfolio_positions (is_open, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_apex_positions_sembol
  ON public.apex_portfolio_positions (sembol, is_open);

-- Günlük portföy snapshot
CREATE TABLE IF NOT EXISTS public.apex_portfolio_history (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date    date        NOT NULL UNIQUE,
  total_value      float8      NOT NULL,
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

-- Karar audit trail (her işlem)
CREATE TABLE IF NOT EXISTS public.apex_portfolio_decisions (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_date    date        NOT NULL DEFAULT CURRENT_DATE,
  sembol           text        NOT NULL,
  action           text        NOT NULL CHECK (action IN ('BUY','SELL','HOLD','ROTATE_OUT','ROTATE_IN')),
  shares           float8,
  theoretical_price float8,
  cost_or_proceeds float8,
  confluence_score int,
  rel_vol5         float8,
  phase            text,
  stop_loss        float8,
  reason_short     text        NOT NULL,
  outcome_return   float8,
  was_correct      boolean,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apex_decisions_date
  ON public.apex_portfolio_decisions (decision_date DESC);

-- Başlangıç sermayesi: 100.000₺
INSERT INTO public.apex_portfolio_history (snapshot_date, total_value, cash, positions_value, total_return)
SELECT CURRENT_DATE, 100000, 100000, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM public.apex_portfolio_history LIMIT 1);

-- RLS
ALTER TABLE public.apex_portfolio_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apex_portfolio_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apex_portfolio_decisions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apex_public_read_pos"  ON public.apex_portfolio_positions FOR SELECT USING (true);
CREATE POLICY "apex_public_read_his"  ON public.apex_portfolio_history   FOR SELECT USING (true);
CREATE POLICY "apex_public_read_dec"  ON public.apex_portfolio_decisions  FOR SELECT USING (true);
CREATE POLICY "apex_svc_write_pos"    ON public.apex_portfolio_positions FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
CREATE POLICY "apex_svc_write_his"    ON public.apex_portfolio_history   FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
CREATE POLICY "apex_svc_write_dec"    ON public.apex_portfolio_decisions  FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
