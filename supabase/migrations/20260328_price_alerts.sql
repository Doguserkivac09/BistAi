-- Fiyat Alert Sistemi
-- Kullanıcılar belirli bir hisse için hedef fiyat belirler.
-- Cron günlük kontrol eder, fiyata ulaşınca email gönderir.

CREATE TABLE IF NOT EXISTS public.price_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sembol        text NOT NULL,
  target_price  numeric(10,2) NOT NULL,
  direction     text NOT NULL CHECK (direction IN ('above', 'below')),
  -- 'above': fiyat bu seviyeye ulaşınca/geçince tetikle
  -- 'below': fiyat bu seviyenin altına düşünce tetikle
  note          text,
  triggered     boolean NOT NULL DEFAULT false,
  triggered_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Kullanıcı kendi alertlerini yönetir"
  ON public.price_alerts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Servis role için tam erişim (cron)
CREATE POLICY "Service role tam erişim"
  ON public.price_alerts FOR ALL
  USING (auth.role() = 'service_role');

-- İndeks: aktif alertler hızlı sorgulanabilsin
CREATE INDEX IF NOT EXISTS idx_price_alerts_active
  ON public.price_alerts (user_id, triggered)
  WHERE triggered = false;
