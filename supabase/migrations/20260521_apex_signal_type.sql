-- APEX decisions: signal_type kolonu ekle (win rate by setup takibi için)
-- İdempotent: ADD COLUMN IF NOT EXISTS

ALTER TABLE public.apex_portfolio_decisions
  ADD COLUMN IF NOT EXISTS signal_type text;

COMMENT ON COLUMN public.apex_portfolio_decisions.signal_type IS
  'Giriş kararındaki dominant AL sinyalinin tipi (örn: RSI Uyumsuzluğu, Hacim Anomalisi, Trend Başlangıcı). Win rate by setup analizi için.';
