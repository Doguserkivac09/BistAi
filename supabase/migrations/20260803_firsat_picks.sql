-- Fırsat Sicili — İleriye Dönük Takip (published track record)
--
-- NEDEN GEREKLİ: /api/firsatlar'ın yayınladığı liste HİÇBİR YERDE saklanmıyordu.
-- `signal_performance` ham sinyalleri tutar; yayın kapısı (MIN_PUBLISH_SCORE),
-- `adjustedScore` ve `tier` (onaylı/teknik) istek anında hesaplanıp atılıyor.
-- adjustedScore o günkü makro/rejim/katalist bağlamına bağlı → GERİYE DÖNÜK
-- YENİDEN KURULAMAZ. Dolayısıyla "geçen ay onaylı katmanda gösterdiklerimiz şu
-- kadar getirdi" iddiası ancak İLERİYE DÖNÜK kayıtla dürüstçe yapılabilir.
--
-- Kayıt, kullanıcının GÖRDÜĞÜ listenin ta kendisidir: snapshot cron'u kendi
-- /api/firsatlar endpoint'ini çağırır → "yayınlanan" ile "ölçülen" ayrışamaz.
--
-- baby_picks / weekly_picks deseninin kısa-vade versiyonu (ufuklar 1/2/4 hafta,
-- fırsatların kanonik değerlendirme ufkuyla — 7-30 gün — uyumlu).
-- İdempotent — Supabase SQL Editor'da çalıştır.

CREATE TABLE IF NOT EXISTS public.firsat_picks (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Snapshot haftası (o haftanın Pazartesi'si)
  week_start       date        NOT NULL,
  sembol           text        NOT NULL,
  sector_id        text,
  -- Yayın anındaki hâli (kullanıcı bunu gördü)
  tier             text        NOT NULL,          -- 'onayli' | 'teknik'
  score            int         NOT NULL,          -- adjustedScore
  direction        text        NOT NULL,          -- 'yukari' | 'asagi' | 'notr'
  entry_price      float8      NOT NULL,
  entry_time       timestamptz NOT NULL DEFAULT now(),
  stop_loss        float8,
  target_price     float8,
  risk_reward      float8,
  -- Gerekçeler (o anki hâli) — sicili "neden" ile birlikte okuyabilmek için
  reasons          jsonb,
  bist_entry       float8,                        -- XU100 giriş (benchmark)
  -- Değerlendirme — ufuk dolunca doldurulur
  price_1w         float8,  ret_1w  float8,  bist_ret_1w  float8,
  price_2w         float8,  ret_2w  float8,  bist_ret_2w  float8,
  price_4w         float8,  ret_4w  float8,  bist_ret_4w  float8,
  last_evaluated_at timestamptz,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (week_start, sembol)
);

CREATE INDEX IF NOT EXISTS idx_firsat_picks_week
  ON public.firsat_picks (week_start DESC);

CREATE INDEX IF NOT EXISTS idx_firsat_picks_open
  ON public.firsat_picks (ret_4w) WHERE ret_4w IS NULL;

CREATE INDEX IF NOT EXISTS idx_firsat_picks_tier
  ON public.firsat_picks (tier, week_start DESC);

-- RLS: okuma herkese açık (sicil şeffaf olmalı), yazma yalnız service role (cron)
ALTER TABLE public.firsat_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "firsat_picks_public_read" ON public.firsat_picks;
CREATE POLICY "firsat_picks_public_read"
  ON public.firsat_picks FOR SELECT
  USING (true);
