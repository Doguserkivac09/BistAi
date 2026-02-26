-- BistAI Supabase schema
-- users are handled by Supabase Auth (auth.users)

-- Watchlist: kullanıcının izlediği hisse sembolleri
create table if not exists public.watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sembol text not null,
  created_at timestamptz not null default now(),
  unique(user_id, sembol)
);

-- Saved signals: kullanıcının kaydettiği sinyaller ve AI açıklamaları
create table if not exists public.saved_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sembol text not null,
  signal_type text not null,
  signal_data jsonb not null default '{}',
  ai_explanation text not null,
  created_at timestamptz not null default now()
);

-- RLS: kullanıcı sadece kendi satırlarını görebilir/düzenleyebilir
alter table public.watchlist enable row level security;
alter table public.saved_signals enable row level security;

create policy "Users can manage own watchlist"
  on public.watchlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage own saved_signals"
  on public.saved_signals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Indexes
create index if not exists idx_watchlist_user_id on public.watchlist(user_id);
create index if not exists idx_saved_signals_user_id on public.saved_signals(user_id);
create index if not exists idx_saved_signals_created_at on public.saved_signals(created_at desc);
