-- Screener için scan_cache tablosuna ek sütunlar.
-- rsi       : Son RSI(14) değeri — filtre için
-- last_volume: Son kapanış günü hacmi
-- sector    : Hissenin sektörü (lib/sectors.ts mapping'inden)

ALTER TABLE scan_cache
  ADD COLUMN IF NOT EXISTS rsi          FLOAT8,
  ADD COLUMN IF NOT EXISTS last_volume  FLOAT8,
  ADD COLUMN IF NOT EXISTS sector       TEXT;

-- Screener sorguları için index'ler
CREATE INDEX IF NOT EXISTS scan_cache_rsi_idx        ON scan_cache (rsi);
CREATE INDEX IF NOT EXISTS scan_cache_sector_idx     ON scan_cache (sector);
CREATE INDEX IF NOT EXISTS scan_cache_volume_idx     ON scan_cache (last_volume DESC);
