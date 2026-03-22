-- E-posta bildirim tercihleri tablosu
-- Her kullanıcı için 1 satır (UPSERT ile güncellenir)

CREATE TABLE IF NOT EXISTS alert_subscriptions (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID        REFERENCES auth.users NOT NULL,
  email_enabled   BOOLEAN     DEFAULT true,
  min_severity    TEXT        DEFAULT 'orta'
                  CHECK (min_severity IN ('güçlü', 'orta', 'zayıf')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Gönderim geçmişi — duplicate önleme için (aynı gün aynı sinyal 1 kere)
CREATE TABLE IF NOT EXISTS alert_history (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users NOT NULL,
  sembol      TEXT        NOT NULL,
  signal_type TEXT        NOT NULL,
  sent_at     TIMESTAMPTZ DEFAULT NOW()
);
-- Aynı gün aynı sinyali tekrar gönderme
CREATE UNIQUE INDEX IF NOT EXISTS alert_history_daily_unique
  ON alert_history (user_id, sembol, signal_type, (sent_at::date));

-- RLS
ALTER TABLE alert_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_history       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_prefs"
  ON alert_subscriptions FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "users_own_history"
  ON alert_history FOR SELECT
  USING (auth.uid() = user_id);
