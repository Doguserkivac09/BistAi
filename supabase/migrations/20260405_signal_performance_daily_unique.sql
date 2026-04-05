-- signal_performance tablosuna günlük unique constraint ekle.
-- Aynı hisse + sinyal tipi için günde bir kayıt yeterli (cron deduplication).
-- entry_time günün başına normalize edilir (UTC midnight).

CREATE UNIQUE INDEX IF NOT EXISTS signal_performance_daily_unique
  ON public.signal_performance (sembol, signal_type, date_trunc('day', entry_time));
