-- AI Açıklama Cache tablosu
-- Aynı sinyal tipi + sembol + yön için Claude API tekrar çağrılmaz.
-- TTL: 24 saat (cron ile temizlenebilir veya created_at kontrolü ile).
--
-- Phase 8.3

create table if not exists public.ai_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,          -- hash: sembol:signal_type:direction:severity
  explanation text not null,
  version smallint not null default 1,     -- 1 = v1 (teknik), 2 = v2 (kompozit)
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

-- RLS: herkes okuyabilir, service_role yazar
alter table public.ai_cache enable row level security;

create policy "AI cache read for all" on public.ai_cache
  for select using (true);

create policy "AI cache insert via service role" on public.ai_cache
  for insert with check (true);

create policy "AI cache update via service role" on public.ai_cache
  for update using (true);

create policy "AI cache delete via service role" on public.ai_cache
  for delete using (true);

-- Index: cache_key lookup + TTL temizliği
create index if not exists idx_ai_cache_key on public.ai_cache(cache_key);
create index if not exists idx_ai_cache_expires on public.ai_cache(expires_at);
