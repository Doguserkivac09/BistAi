-- Görev 1.1 — Formasyon backtest entegrasyonu
--
-- 7 formasyon (Çift Dip, Çift Tepe, Bull/Bear Flag, Cup & Handle,
-- Ters OBO, Yükselen Üçgen) iki AŞAMADA tetiklenir:
--  • 'oluşum' — pattern oluşmaya başladı, kırılım henüz olmadı
--  • 'kırılım' — fiyat tetik seviyesini geçti, breakout teyit
--
-- Bu iki aşamanın WİN RATE'i çok farklıdır:
--  - oluşum aşamasında giren = erken giriş, bazen formasyon başarısız olur
--  - kırılım sonrası giren = teyitli giriş, daha güvenilir ama biraz geç
--
-- Backtest'in bu ayrımı yapabilmesi için stage kolonu gerekir.

ALTER TABLE public.signal_performance
  ADD COLUMN IF NOT EXISTS stage TEXT;

-- Mevcut kayıtlara NULL kalır (backwards compat).
-- Klasik indikatörlerde (RSI, MACD vb.) stage kavramı yoktur — NULL doğru.

-- Composite index: backtest sorguları için
-- Tipik sorgu: WHERE signal_type = X AND evaluated = true ORDER BY entry_time DESC
CREATE INDEX IF NOT EXISTS idx_signal_performance_signal_stage
  ON public.signal_performance (signal_type, stage, evaluated, entry_time DESC);

-- Stage değerleri için CHECK constraint (opsiyonel — defansif)
-- Postgres'te ALTER + ADD CONSTRAINT IF NOT EXISTS yok, bu yüzden DO block
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'signal_performance' AND constraint_name = 'signal_performance_stage_check'
  ) THEN
    ALTER TABLE public.signal_performance
      ADD CONSTRAINT signal_performance_stage_check
      CHECK (stage IS NULL OR stage IN ('oluşum', 'kırılım'));
  END IF;
END $$;
