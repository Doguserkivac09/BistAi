-- Phase 12: AI Topluluk Botu
-- AI bot yorumlarını desteklemek için şema güncellemeleri

-- 1. comments tablosuna is_ai flag ekle
ALTER TABLE comments ADD COLUMN IF NOT EXISTS is_ai BOOLEAN NOT NULL DEFAULT false;

-- 2. posts tablosuna ai_comment_generated flag ekle (tekrar AI yorum oluşturulmasını önler)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS ai_comment_generated BOOLEAN NOT NULL DEFAULT false;

-- 3. AI bot'un author_id olmadan yorum ekleyebilmesi için NULL izni ver
ALTER TABLE comments ALTER COLUMN author_id DROP NOT NULL;

-- 4. is_ai index (AI yorumları ayrı listelerken kullanılabilir)
CREATE INDEX IF NOT EXISTS idx_comments_is_ai ON comments(is_ai) WHERE is_ai = true;

-- 5. ai_comment_generated index (henüz AI yorumu almamış postları bulmak için)
CREATE INDEX IF NOT EXISTS idx_posts_ai_generated ON posts(ai_comment_generated) WHERE ai_comment_generated = false;
