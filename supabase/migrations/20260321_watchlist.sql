-- Watchlist tablosu
-- Kullanıcıların takip etmek istediği hisseler (portföyde olmak zorunda değil)

CREATE TABLE IF NOT EXISTS watchlist (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID        REFERENCES auth.users NOT NULL,
  sembol     TEXT        NOT NULL,
  notlar     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, sembol)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_watchlist"
  ON watchlist FOR ALL
  USING (auth.uid() = user_id);
