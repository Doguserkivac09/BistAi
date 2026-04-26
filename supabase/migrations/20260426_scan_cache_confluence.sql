-- Screener'da hisse-seviyesi confluence skor filtresi için.
-- 0-100, lib/signals.ts computeConfluence() çıktısı.
-- Backward compat: NULL kabul edilir, eski kayıtlarda günlük cron sonrası dolar.

ALTER TABLE scan_cache
  ADD COLUMN IF NOT EXISTS confluence_score INT;

CREATE INDEX IF NOT EXISTS scan_cache_confluence_idx
  ON scan_cache (confluence_score DESC NULLS LAST);
