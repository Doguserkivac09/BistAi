-- alert_subscriptions tablosuna sinyal tipi filtresi eklenir
-- Kullanıcı hangi sinyal tiplerini almak istediğini seçebilir
-- Boş array = tüm sinyal tipleri (varsayılan davranış)

ALTER TABLE alert_subscriptions
  ADD COLUMN IF NOT EXISTS signal_types TEXT[] DEFAULT '{}';

-- Yorum: boş array → tüm tipler gönderilir
-- Dolu array → sadece listedekiler gönderilir (örn: '{"Kırılım","Hacim Anomalisi"}')
