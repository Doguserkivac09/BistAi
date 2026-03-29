-- Haftalık bülten aboneliği
-- profiles tablosuna newsletter_enabled kolonu eklenir.
-- Varsayılan: false (opt-in model)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS newsletter_enabled boolean NOT NULL DEFAULT false;
