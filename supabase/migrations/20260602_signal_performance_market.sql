-- signal_performance tablosuna market kolonu ekle (BIST / US ayrımı).
-- US sinyalleri de forward-evaluation ile takip edilip win rate hesaplanacak.
-- Idempotent — tekrar çalıştırılabilir.

-- 1) market kolonu (mevcut tüm satırlar BIST kabul edilir)
ALTER TABLE public.signal_performance
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'BIST';

-- 2) Günlük unique constraint'i market ile genişlet
--    (US sembolü, aynı isimli bir BIST sembolüyle çakışmasın)
ALTER TABLE public.signal_performance
  DROP CONSTRAINT IF EXISTS signal_performance_daily_unique;

ALTER TABLE public.signal_performance
  ADD CONSTRAINT signal_performance_daily_unique
  UNIQUE (sembol, signal_type, entry_time, market);

-- 3) Market bazlı sorgu indeksi (win rate aggregation + evaluate filtresi)
CREATE INDEX IF NOT EXISTS idx_signal_performance_market_evaluated
  ON public.signal_performance(market, evaluated);
