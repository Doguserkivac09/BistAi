-- scanner_signals — kalite ve bağlam kolonları
--
-- Neden: "iFVG ne kadar V şekline benziyorsa o kadar güçlü" ve "yön değişimi
-- için bir sebep (seans açılışı / yoğunluk / haber) gerekir" hipotezlerini
-- ÖLÇEBİLMEK için. Varsayım olarak ağırlık vermiyoruz — veriyle sınayacağız.
--
-- ÖNEMLİ: Bu kolonlar veri akmaya BAŞLAMADAN eklenmeli. Sonradan eklenirse
-- o ana kadarki kayıtlarda boş kalır ve karşılaştırma yapılamaz.

ALTER TABLE scanner_signals
  -- iFVG yapı kalitesi (0-100): keskinlik + dönüş barı büyüklüğü + fitil + geri kazanım
  -- Boğa iFVG'sinde "V", ayı iFVG'sinde ters-V (Λ) simetrik ölçülür.
  ADD COLUMN IF NOT EXISTS v_score         REAL,

  -- Seans bağlamı — "sebep" hipotezinin zaman ayağı
  ADD COLUMN IF NOT EXISTS session_phase   TEXT,      -- "acilis" | "govde" | "ogle" | "kapanis" | "disi"
  ADD COLUMN IF NOT EXISTS mins_since_open SMALLINT,  -- BIST açılışından (10:00) geçen dakika

  -- Katalist bağlamı — "sebep" hipotezinin haber ayağı.
  -- Pine bunu göremez; sunucu mevcut news-catalyst / ekonomi-takvimi
  -- altyapısından okuyup iliştirir (3. adımda doldurulacak).
  ADD COLUMN IF NOT EXISTS catalyst        TEXT,      -- "yok" | "destekli" | "fiyatlandi" | "celisiyor"
  ADD COLUMN IF NOT EXISTS catalyst_type   TEXT,      -- "haber" | "kap" | "takvim"
  ADD COLUMN IF NOT EXISTS event_near_min  SMALLINT;  -- planlı olaya ± dakika (varsa)

-- iFVG kalite sorgusu: "V-skoru yüksek olanlar gerçekten daha çok mu tutuyor?"
CREATE INDEX IF NOT EXISTS scanner_signals_vscore_idx
  ON scanner_signals (scan_tf, v_score)
  WHERE v_score IS NOT NULL;

-- Seans fazı sorgusu: "açılışta gelen sinyaller gövdedekilerden iyi mi?"
CREATE INDEX IF NOT EXISTS scanner_signals_session_idx
  ON scanner_signals (scan_tf, session_phase);
