-- APEX: TP1 takibi + PARTIAL_SELL action desteği
-- İdempotent: ADD COLUMN IF NOT EXISTS

-- 1. apex_portfolio_positions: TP1 durum alanları
ALTER TABLE public.apex_portfolio_positions
  ADD COLUMN IF NOT EXISTS tp1_hit     boolean    DEFAULT false,
  ADD COLUMN IF NOT EXISTS tp1_hit_at  timestamptz;

-- 2. apex_portfolio_decisions: CHECK kısıtına PARTIAL_SELL ekle
--    Önce eski kısıtı kaldır, sonra yenisini ekle
ALTER TABLE public.apex_portfolio_decisions
  DROP CONSTRAINT IF EXISTS apex_portfolio_decisions_action_check;

ALTER TABLE public.apex_portfolio_decisions
  ADD CONSTRAINT apex_portfolio_decisions_action_check
  CHECK (action IN ('BUY', 'SELL', 'HOLD', 'ROTATE_OUT', 'ROTATE_IN', 'PARTIAL_SELL'));
