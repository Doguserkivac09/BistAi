-- Swing kurulumu İLERİYE DÖNÜK SİCİL (2026-09-11)
--
-- NEDEN: ABD günlük swing kurulumu (lib/swing-setup.ts) geriye dönük ölçümde
-- SPY'a göre anlamlı çıktı AMA tanım aynı veride birkaç tur düzeltildi → geçmişe
-- uydurma riski. Yayından önce gerçek zamanlı kanıt gerekiyor. Bu tablo her
-- sinyali ve yanında RASTGELE KONTROL girişlerini (aynı gün, aynı çıkış kuralı)
-- kaydeder; aylar sonra "giriş katkısı" gerçek veriyle ölçülür.
--
-- GİZLİ: ürün yüzeyinde gösterilmez. RLS yalnız service_role.
-- rule_version: kural değişirse eski kayıtlarla karışmasın diye.

CREATE TABLE IF NOT EXISTS public.swing_sicil (
  id                bigserial PRIMARY KEY,
  market            text        NOT NULL DEFAULT 'US',
  symbol            text        NOT NULL,
  kind              text        NOT NULL CHECK (kind IN ('sinyal', 'kontrol')),
  signal_date       date        NOT NULL,             -- kurulumun tamamlandığı mum
  status            text        NOT NULL DEFAULT 'bekliyor'
                    CHECK (status IN ('bekliyor', 'acik', 'cikiyor', 'kapali')),
  entry_date        date,                              -- sinyal + 1 işlem günü (açılış)
  entry_price       numeric,
  bench_entry       numeric,                           -- SPY aynı an
  exit_signal_date  date,                              -- −DI > +DI kesişim mumu
  exit_reason       text CHECK (exit_reason IN ('di-kesisim', 'sure-doldu')),
  exit_date         date,
  exit_price        numeric,
  bench_exit        numeric,
  return_pct        numeric,                           -- yüzde (ör. 2.35)
  bench_return_pct  numeric,
  bars_held         int,
  rule_version      text        NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (market, symbol, kind, signal_date)
);

CREATE INDEX IF NOT EXISTS idx_swing_sicil_status
  ON public.swing_sicil(market, status);
CREATE INDEX IF NOT EXISTS idx_swing_sicil_symbol_date
  ON public.swing_sicil(market, symbol, signal_date DESC);

ALTER TABLE public.swing_sicil ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'swing_sicil' AND policyname = 'swing_sicil_svc_all'
  ) THEN
    CREATE POLICY swing_sicil_svc_all ON public.swing_sicil
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
