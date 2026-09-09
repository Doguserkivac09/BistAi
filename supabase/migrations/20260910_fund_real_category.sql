-- Fon GERÇEK kategorisi (FON-FAZ6-PLAN 6D)
--
-- ⚠️ PLAN "migration gerekmez" DİYORDU — YANLIŞTI. Gerçek kategori bir METİN
-- ("Hisse Senedi Fonu", "Başlangıç Katılım Fonu"); mevcut `fund_meta.category`
-- ise TEFAS'ın 12 şemsiye türüne karşılık gelen bir INT. Metni int'e sıkıştırmak
-- granülerliği yok eder ve BES'in kendi taksonomisini büsbütün kaybettirir.
--
-- NE DEĞİŞTİRİYOR: emsal grubu artık ad tahmininden (`guessBesCategory`) değil,
-- kaynağın kendi kategorisinden gelir → daha doğru medyan → daha doğru skor.
-- Eski `category` int kolonu DURUYOR (geriye uyum + gerçek kategori gelmemiş
-- fonlar için yedek); runner önce gerçek kategoriyi dener.
--
-- Kaynak: POST /api/funds/fonBilgiGetir  {fonKodu, dil:'TR'}
--   fonKategori "Hisse Senedi Fonu" · kategoriDerece 143 · kategoriFonSay 200

ALTER TABLE public.fund_meta
  ADD COLUMN IF NOT EXISTS category_name text,      -- fonKategori (GERÇEK)
  ADD COLUMN IF NOT EXISTS category_rank int,       -- kategoriDerece (TEFAS'ın kendi sırası)
  ADD COLUMN IF NOT EXISTS category_size int,       -- kategoriFonSay
  ADD COLUMN IF NOT EXISTS category_name_at timestamptz;

-- Emsal gruplaması artık bu kolon üzerinden yapılıyor.
CREATE INDEX IF NOT EXISTS idx_fund_meta_category_name
  ON public.fund_meta(universe, category_name);

-- Tazelik sorgusu: en eski çekilenden başlayarak tamamlanır (betik bütçeli).
CREATE INDEX IF NOT EXISTS idx_fund_meta_category_name_at
  ON public.fund_meta(universe, category_name_at NULLS FIRST);
