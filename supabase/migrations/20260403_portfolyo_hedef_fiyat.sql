-- portfolios tablosuna hedef_fiyat kolonu ekle
ALTER TABLE portfolios
  ADD COLUMN IF NOT EXISTS hedef_fiyat numeric(12, 4) DEFAULT NULL;
