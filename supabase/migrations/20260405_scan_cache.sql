-- scan_cache: Günlük otomatik tarama sonuçlarını saklar
-- Cron 07:30'da tüm BIST hisselerini tarar, buraya yazar
-- Kullanıcı tarama sayfasına gelince buradan okur → anında yükler

CREATE TABLE IF NOT EXISTS scan_cache (
  sembol          TEXT PRIMARY KEY,
  signals_json    JSONB        NOT NULL DEFAULT '[]',
  candles_json    JSONB        NOT NULL DEFAULT '[]',  -- son 60 mum (MiniChart için)
  change_percent  FLOAT8,
  scanned_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index: en son taranan hisseleri hızlı çek
CREATE INDEX IF NOT EXISTS scan_cache_scanned_at_idx ON scan_cache (scanned_at DESC);

-- RLS: Herkes okuyabilir, sadece service_role yazabilir
ALTER TABLE scan_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scan_cache_public_read"
  ON scan_cache FOR SELECT USING (true);

CREATE POLICY "scan_cache_service_write"
  ON scan_cache FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
