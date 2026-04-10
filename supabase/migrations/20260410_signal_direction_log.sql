-- signal_direction_log
-- Amaç: Aynı gün içinde yön değişimini (AL→SAT, SAT→AL) tespit etmek için
-- /api/signals/latest her çalıştığında o çalıştırmada dönen sinyallerin
-- ilk yönünü kaydeder. Sonraki çalıştırmalarda yön değiştiyse flip mesajı üretilir.

CREATE TABLE IF NOT EXISTS signal_direction_log (
  symbol      TEXT NOT NULL,
  signal_date DATE NOT NULL,
  direction   TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (symbol, signal_date)   -- günde bir hisse için yalnızca ilk yön saklanır
);

-- Eski kayıtları tutmaya gerek yok — 7 günden eski satırları silebilirsiniz
-- DELETE FROM signal_direction_log WHERE signal_date < CURRENT_DATE - INTERVAL '7 days';

-- RLS: Bu tablo yalnızca service role üzerinden erişilir (Make.com API key korumalı endpoint)
ALTER TABLE signal_direction_log ENABLE ROW LEVEL SECURITY;

-- Hiçbir anon / authenticated kullanıcı okuyamaz/yazamaz
CREATE POLICY "service_role_only" ON signal_direction_log
  USING (false)
  WITH CHECK (false);
