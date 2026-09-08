-- Fon kalıcı depolama (FON-BACKFILL-PLAN FAZ 1)
--
-- NEDEN TABLO: ham NAV geçmişi tek ai_cache satırına SIĞMIYOR (1 yıl ≈ 33 MB).
-- Kayan 75 günlük pencere + 5 günlük TTL üç şeyi birden kilitliyordu:
--   1) her koşu elindeki tarihi tekrar çekiyordu (gerçek artımlı backfill yok)
--   2) 75 gün kırpması derine inmeyi imkânsız kılıyordu
--   3) cron 5 gün koşmazsa biriken pencere komple siliniyordu
-- Tablo üçünü de kökten çözer; ai_cache yalnız sunum önbelleği olarak kalır.
--
-- RLS: YALNIZ service_role. Public read YOK — FON-ANALIZ-PLAN lisans ilkesi:
-- "türetilmiş analiz servis et, ham veri setini yayınlama". API admin client ile
-- okur ve dışarıya yalnız hesaplanmış metrik verir.

-- ── 1) Günlük NAV + akım serisi ────────────────────────────────────────────
-- shares (tedPaySayisi) akım analizinin TEK doğru kaynağı: fon büyüklüğü fiyatla
-- da değişir, pay adedi yalnız yatırımcı alıp sattığında değişir.
CREATE TABLE IF NOT EXISTS public.fund_prices (
  universe   text    NOT NULL,           -- 'TEFAS' | 'BES'
  code       text    NOT NULL,           -- fonKodu
  date       date    NOT NULL,
  price      numeric NOT NULL,           -- birim pay değeri
  shares     numeric,                    -- tedPaySayisi  → akım
  investors  integer,                    -- kisiSayisi    → perakende/kurumsal
  size       numeric,                    -- portfoyBuyukluk
  PRIMARY KEY (universe, code, date)
);

CREATE INDEX IF NOT EXISTS idx_fund_prices_universe_date
  ON public.fund_prices(universe, date);
CREATE INDEX IF NOT EXISTS idx_fund_prices_code_date
  ON public.fund_prices(universe, code, date DESC);

-- ── 2) Fon meta — kategori KALICI ──────────────────────────────────────────
-- Kategori satırlarda gelmiyor, ayrı 12 sorguyla türetiliyor (~100-130 sn/koşu).
-- Burada kalıcı tutulunca o vergi ortadan kalkar (7 günde bir tazelenir) ve
-- runner artık "bu koşuda çekilen meta"ya bağımlı olmaz (latent crash kökten çözülür).
CREATE TABLE IF NOT EXISTS public.fund_meta (
  universe     text NOT NULL,
  code         text NOT NULL,
  name         text,
  category     int,
  category_at  timestamptz,
  updated_at   timestamptz DEFAULT now(),
  PRIMARY KEY (universe, code)
);

CREATE INDEX IF NOT EXISTS idx_fund_meta_universe_cat
  ON public.fund_meta(universe, category);

-- ── 3) Tarih kapsama günlüğü — GAP tespitinin kesin kaynağı ────────────────
-- complete=false: sayfalama 429'da kesildi veya satır sayısı beklenenin altında.
-- Kısmi tarih "var" sayılmaz; bir sonraki koşuda tekrar denenir.
CREATE TABLE IF NOT EXISTS public.fund_scan_days (
  universe    text    NOT NULL,
  date        date    NOT NULL,
  row_count   int     NOT NULL,
  complete    boolean NOT NULL DEFAULT false,
  fetched_at  timestamptz DEFAULT now(),
  PRIMARY KEY (universe, date)
);

CREATE INDEX IF NOT EXISTS idx_fund_scan_days_lookup
  ON public.fund_scan_days(universe, complete, date DESC);

-- ── RLS: yalnız service_role ───────────────────────────────────────────────
ALTER TABLE public.fund_prices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_meta      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fund_scan_days ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fund_prices','fund_meta','fund_scan_days'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = t || '_svc_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL USING (auth.role()=''service_role'') WITH CHECK (auth.role()=''service_role'')',
        t || '_svc_all', t
      );
    END IF;
  END LOOP;
END $$;
