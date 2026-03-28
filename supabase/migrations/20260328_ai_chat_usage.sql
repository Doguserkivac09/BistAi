-- AI Sohbet kullanım takibi (günlük limit kontrolü için)

create table if not exists public.ai_chat_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.ai_chat_usage enable row level security;

-- Kullanıcı sadece kendi kayıtlarını görebilir
create policy "Users can read own chat usage"
  on public.ai_chat_usage for select
  using (auth.uid() = user_id);

-- Service role insert yapar (API route)
create index if not exists idx_ai_chat_usage_user_date
  on public.ai_chat_usage(user_id, created_at);
