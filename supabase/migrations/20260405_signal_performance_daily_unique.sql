-- signal_performance tablosuna günlük unique constraint ekle.
-- Aynı hisse + sinyal tipi için günde bir kayıt yeterli (cron deduplication).
-- entry_time zaten UTC midnight olarak normalize edilmiş gelir (cron bunu garanti eder).

ALTER TABLE public.signal_performance
  ADD CONSTRAINT signal_performance_daily_unique
  UNIQUE (sembol, signal_type, entry_time);
