-- signal_performance tablosuna market kolonu ekle
-- BIST = Borsa İstanbul sinyalleri (scan-cache, scan cron'larından)
-- US   = Amerikan borsası (ilerleyen aşamada planlandı)
--
-- Tüm mevcut NULL kayıtlar BIST kabul edilir (geri uyumluluk).
-- idempotent: birden fazla çalıştırılabilir.

ALTER TABLE signal_performance
  ADD COLUMN IF NOT EXISTS market text DEFAULT 'BIST';

-- Mevcut NULL kayıtları BIST olarak backfill et
UPDATE signal_performance
  SET market = 'BIST'
  WHERE market IS NULL;

-- Sorgu performansı için index
CREATE INDEX IF NOT EXISTS signal_performance_market_idx
  ON signal_performance(market);

-- RLS: market bazlı kısıtlama gerekirse buraya eklenebilir (şimdilik yok)
