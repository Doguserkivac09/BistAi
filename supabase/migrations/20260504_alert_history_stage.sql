-- Görev 3 — Formasyon bildirim sistemi
--
-- alert_history tablosuna stage kolonu ekleniyor.
-- Böylece aynı sembol+sinyal için oluşum ve kırılım bildirimleri
-- ayrı ayrı gönderilebilir (bugün hem oluşum hem kırılım olabilir).

ALTER TABLE public.alert_history
  ADD COLUMN IF NOT EXISTS stage TEXT;

-- Mevcut kayıtlara NULL kalır
-- Klasik sinyallerde stage yok, NULL doğru

-- Deduplication index'i stage dahil güncellenmiş composite
-- (user_id, sembol, signal_type, stage, sent_at tarih bazlı)
-- Mevcut index varsa koruyoruz, yeni partial index ekliyoruz
CREATE INDEX IF NOT EXISTS idx_alert_history_stage
  ON public.alert_history (user_id, sembol, signal_type, stage, sent_at);
