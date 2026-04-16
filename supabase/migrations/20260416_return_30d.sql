-- Phase 14: Multi-horizon backtest desteği
-- return_30d kolonu ekleniyor — 30 takvim günü sonraki kapanış fiyatına göre getiri

ALTER TABLE public.signal_performance
  ADD COLUMN IF NOT EXISTS return_30d numeric;

CREATE INDEX IF NOT EXISTS idx_signal_perf_return30d
  ON public.signal_performance(return_30d);
