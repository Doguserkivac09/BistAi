-- Sprint 3: 52 hafta tepe/dip mesafesi + Relative Volume (5g)
-- Backward compat: NULL kabul edilir, eski kayıtlarda günlük cron sonrası dolar.
--
-- pct_from_52w_high : (lastClose - 52wHigh) / 52wHigh * 100  → negatif (örn -3% = tepeye yakın)
-- pct_from_52w_low  : (lastClose - 52wLow)  / 52wLow  * 100  → pozitif (örn 12% = dipten 12% yukarıda)
-- rel_vol5          : lastVolume / avg(volume, 5g)            → 1 = normal, 2 = 2x patlama

ALTER TABLE scan_cache
  ADD COLUMN IF NOT EXISTS pct_from_52w_high FLOAT8,
  ADD COLUMN IF NOT EXISTS pct_from_52w_low  FLOAT8,
  ADD COLUMN IF NOT EXISTS rel_vol5          FLOAT8;

CREATE INDEX IF NOT EXISTS scan_cache_pct_from_52w_high_idx ON scan_cache (pct_from_52w_high);
CREATE INDEX IF NOT EXISTS scan_cache_pct_from_52w_low_idx  ON scan_cache (pct_from_52w_low);
CREATE INDEX IF NOT EXISTS scan_cache_rel_vol5_idx          ON scan_cache (rel_vol5 DESC NULLS LAST);
