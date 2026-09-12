-- VERİ ARŞİVİ — kendi point-in-time kaydımız (2026-09-12)
--
-- NEDEN: Temel veriyi çekebiliyoruz, ama "bu rakam hangi gün açıklandı / ne zaman
-- değişti" bilgisi hiçbir ücretsiz kaynakta GEÇMİŞE DÖNÜK yok (KAP aktif bot
-- tespiti arkasında, ölçüldü 2026-09-12). Bu yüzden geriye dönük temel-veri
-- backtest'i yapısal olarak sahtedir: bugünkü tablo düzeltilmiş rakamları taşır,
-- o gün piyasanın ne bildiğini göstermez.
--
-- ÇÖZÜM: Geçmişi satın alamıyoruz ama GELECEĞİ bugünden kaydedebiliriz.
-- Her koşuda kaynaktan gelen içeriğin hash'i alınır:
--   hash aynı  → yeni satır AÇILMAZ, yalnız son_gorulme/gorulme_sayisi güncellenir
--   hash farklı → YENİ satır (= revizyon). ilk_gorulme, o değerin ilk kez
--                 görüldüğü an demektir — yani bizim ürettiğimiz açıklanma damgası.
-- Sonuç: tablo bir "revizyon günlüğü"dür. 6-12 ay sonra kimsenin geriye dönük
-- üretemeyeceği, lookahead'i yapısal olarak imkânsız bir seri oluşur.
--
-- ⚠️ LİSANS: ham İş Yatırım/Yahoo tabloları REDISTRİBÜTE EDİLMEZ (VIOP/fon ilkesi).
-- RLS yalnız service_role; dışarıya yalnız türetilmiş analiz servis edilir.

CREATE TABLE IF NOT EXISTS public.veri_arsivi (
  id              bigserial   PRIMARY KEY,
  kaynak          text        NOT NULL,          -- 'isyatirim-mali' | 'yahoo-temel'
  sembol          text        NOT NULL,
  anahtar         text        NOT NULL,          -- kaynak içi alt anahtar (ör. '2026-6' | 'ozet')
  icerik_hash     text        NOT NULL,          -- sha256(kanonik JSON)
  icerik          jsonb       NOT NULL,
  ilk_gorulme     timestamptz NOT NULL DEFAULT now(),   -- ← ürettiğimiz "açıklanma/değişme" damgası
  son_gorulme     timestamptz NOT NULL DEFAULT now(),
  gorulme_sayisi  int         NOT NULL DEFAULT 1
);

-- Aynı içerik ikinci kez satır açmasın; değişen içerik yeni satır açsın.
CREATE UNIQUE INDEX IF NOT EXISTS veri_arsivi_benzersiz
  ON public.veri_arsivi (kaynak, sembol, anahtar, icerik_hash);

-- "Bu sembolün bu anahtarının revizyon geçmişi" sorgusu
CREATE INDEX IF NOT EXISTS veri_arsivi_seri
  ON public.veri_arsivi (kaynak, sembol, anahtar, ilk_gorulme DESC);

-- "Bugün ne değişti" sorgusu
CREATE INDEX IF NOT EXISTS veri_arsivi_yeni
  ON public.veri_arsivi (ilk_gorulme DESC);

ALTER TABLE public.veri_arsivi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS veri_arsivi_service_all ON public.veri_arsivi;
CREATE POLICY veri_arsivi_service_all ON public.veri_arsivi
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE  public.veri_arsivi IS
  'Point-in-time revizyon günlüğü. Satır = bir içeriğin İLK görüldüğü an. Aynı içerik tekrar yazılmaz.';
COMMENT ON COLUMN public.veri_arsivi.ilk_gorulme IS
  'Bu içeriğin bizde ilk göründüğü an — geriye dönük elde edilemeyen açıklanma/revizyon damgası.';
