-- Migration: create signal_performance table for forward signal evaluation

create table if not exists public.signal_performance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  sembol text not null,
  signal_type text not null,
  direction text not null,
  entry_price numeric not null,
  entry_time timestamptz not null,
  return_3d numeric,
  return_7d numeric,
  return_14d numeric,
  mfe numeric,
  mae numeric,
  evaluated boolean default false,
  created_at timestamptz default now()
);

alter table public.signal_performance enable row level security;

-- Kullanıcı kendi kayıtları üzerinde tam yetkiye sahip
create policy "Users can manage own signal_performance"
  on public.signal_performance
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- user_id NULL olan (global istatistik) satırları tüm doğrulanmış kullanıcılar okuyabilsin
create policy "Authenticated can read global signal_performance"
  on public.signal_performance
  for select
  using (user_id is null and auth.role() = 'authenticated');

create index if not exists idx_signal_performance_user_id
  on public.signal_performance(user_id);

create index if not exists idx_signal_performance_evaluated_entry_time
  on public.signal_performance(evaluated, entry_time);

