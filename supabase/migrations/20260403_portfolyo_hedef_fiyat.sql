-- Portföy pozisyonlarına hedef_fiyat kolonu ekle.
--
-- ⚠️ DÜZELTİLDİ (2026-09-10): bu dosya `portfolios` tablosuna yazıyordu ama
-- öyle bir tablo YOK — gerçek ad `portfolyo_pozisyonlar` (bkz.
-- 20260321_portfolyo.sql). Dosya olduğu gibi çalıştırılsaydı
-- "relation portfolios does not exist" hatası verirdi. Kolon canlıda zaten
-- doğru tabloda mevcut (denetimde doğrulandı), yani vaktinde elle düzeltilerek
-- uygulanmış; dosya geride yanlış hâliyle kalmış. Artık idempotent ve doğru.

ALTER TABLE public.portfolyo_pozisyonlar
  ADD COLUMN IF NOT EXISTS hedef_fiyat numeric(12, 4) DEFAULT NULL;
