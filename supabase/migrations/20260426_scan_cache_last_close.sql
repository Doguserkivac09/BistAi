-- Screener'da son kapanış fiyatını göstermek için scan_cache'e ekle.
-- candles_json'dan türetebiliriz ama 60 mum × 200 satır = ~1.5MB payload — ayrı kolon hızlı.
-- Backward compat: NULL kabul edilir, eski kayıtlarda günlük cron sonrası dolar.

ALTER TABLE scan_cache
  ADD COLUMN IF NOT EXISTS last_close FLOAT8;

CREATE INDEX IF NOT EXISTS scan_cache_last_close_idx ON scan_cache (last_close);
