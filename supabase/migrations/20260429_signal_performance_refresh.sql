-- Fırsatlar gün içi yenilenme bug'ı çözümü.
--
-- SORUN: signal_performance tablosunda entry_time UTC midnight'a normalize edilip
-- upsert(ignoreDuplicates: true) ile yazılıyordu. 12:00 ve 19:00 cron'ları aynı
-- entry_time gördüğü için confluence/stop/hedef/RR güncellemeleri kayboluyordu.
-- Sonuç: Fırsatlar sayfası günde sadece sabah ki ilk taramayı gösteriyordu.
--
-- ÇÖZÜM: last_refreshed_at kolonu — cron her çalıştığında bu kolonu günceller,
-- entry_time + entry_price ise ilk cron'unki kalır (backtest doğruluğu için).

ALTER TABLE public.signal_performance
  ADD COLUMN IF NOT EXISTS last_refreshed_at TIMESTAMPTZ;

-- Mevcut kayıtlara created_at değerini ata (NULL kalmasın, UI rozeti için)
UPDATE public.signal_performance
   SET last_refreshed_at = created_at
 WHERE last_refreshed_at IS NULL;

-- Index — Fırsatlar API "MAX(last_refreshed_at)" sorgusu için
CREATE INDEX IF NOT EXISTS idx_signal_performance_last_refreshed
  ON public.signal_performance (last_refreshed_at DESC NULLS LAST);

-- Composite index — Fırsatlar lookback (entry_time, evaluated=false) + refresh sıralaması
CREATE INDEX IF NOT EXISTS idx_signal_performance_active_refresh
  ON public.signal_performance (entry_time DESC, last_refreshed_at DESC)
  WHERE evaluated = false;
