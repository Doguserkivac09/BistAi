-- scan_cache: market kolonu ekle (BIST ve US ayrımı)
-- İdempotent: koşullu adımlar

-- 1. market kolonu ekle (varsa atla)
ALTER TABLE public.scan_cache
  ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'BIST';

-- 2. Mevcut kayıtları BIST olarak işaretle (yeni default zaten 'BIST')
UPDATE public.scan_cache SET market = 'BIST' WHERE market IS NULL;

-- 3. Composite PK'ye geç: (sembol, market)
--    Önce eski PK'yi kaldır, sonra yenisini ekle
DO $$
BEGIN
  -- Eski PK kaldır (sadece tek kolonlu PK varsa)
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'scan_cache'
      AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE public.scan_cache DROP CONSTRAINT scan_cache_pkey;
  END IF;
END $$;

ALTER TABLE public.scan_cache
  ADD CONSTRAINT scan_cache_pkey PRIMARY KEY (sembol, market);

-- 4. Market bazlı index (screener filtrelemesi için)
CREATE INDEX IF NOT EXISTS scan_cache_market_idx
  ON public.scan_cache (market, scanned_at DESC);

CREATE INDEX IF NOT EXISTS scan_cache_market_conf_idx
  ON public.scan_cache (market, confluence_score DESC);
