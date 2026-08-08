-- changelog_publish_log
-- Amaç: /api/changelog/latest her çağrıldığında changelog.json'daki hangi
-- versiyonların Telegram grubuna zaten gönderildiğini kaydeder — aynı
-- yama notunun tekrar tekrar paylaşılmasını önler.

CREATE TABLE IF NOT EXISTS changelog_publish_log (
  version      TEXT PRIMARY KEY,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: Bu tablo yalnızca service role üzerinden erişilir (Make.com API key korumalı endpoint)
ALTER TABLE changelog_publish_log ENABLE ROW LEVEL SECURITY;

-- Hiçbir anon / authenticated kullanıcı okuyamaz/yazamaz
CREATE POLICY "service_role_only" ON changelog_publish_log
  USING (false)
  WITH CHECK (false);
