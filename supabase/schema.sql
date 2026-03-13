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

-- Signal performance: sinyal sonuçları ve istatistiksel edge verisi
create table if not exists public.signal_performance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  sembol text not null,
  signal_type text not null,
  direction text not null check (direction in ('yukari', 'asagi', 'nötr')),
  entry_price numeric not null,
  entry_time timestamptz not null,
  return_3d numeric,
  return_7d numeric,
  return_14d numeric,
  mfe numeric,
  mae numeric,
  evaluated boolean not null default false,
  regime text,
  created_at timestamptz not null default now(),
  unique(sembol, signal_type, entry_time)
);

-- signal_performance RLS: service_role ile yazılır, herkes okuyabilir
alter table public.signal_performance enable row level security;

create policy "Signal performance read for all authenticated"
  on public.signal_performance for select
  using (auth.role() = 'authenticated');

create policy "Signal performance insert via service role"
  on public.signal_performance for insert
  with check (true);

create policy "Signal performance update via service role"
  on public.signal_performance for update
  using (true);

-- Macro snapshots: günlük makro gösterge kayıtları ve skor geçmişi
create table if not exists public.macro_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  macro_score integer not null,                    -- -100 ↔ +100
  wind text not null check (wind in ('strong_positive', 'positive', 'neutral', 'negative', 'strong_negative')),
  -- Bireysel gösterge değerleri
  vix numeric,
  dxy numeric,
  us10y numeric,
  usdtry numeric,
  cds_5y numeric,
  policy_rate numeric,
  fed_funds_rate numeric,
  -- Bileşen detayları (JSON)
  components jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique(snapshot_date)
);

-- macro_snapshots RLS: herkes okuyabilir, service_role yazar
alter table public.macro_snapshots enable row level security;

create policy "Macro snapshots read for all authenticated"
  on public.macro_snapshots for select
  using (auth.role() = 'authenticated');

create policy "Macro snapshots insert via service role"
  on public.macro_snapshots for insert
  with check (true);

create policy "Macro snapshots update via service role"
  on public.macro_snapshots for update
  using (true);

-- Indexes
create index if not exists idx_watchlist_user_id on public.watchlist(user_id);
create index if not exists idx_saved_signals_user_id on public.saved_signals(user_id);
create index if not exists idx_saved_signals_created_at on public.saved_signals(created_at desc);
create index if not exists idx_signal_perf_sembol on public.signal_performance(sembol);
create index if not exists idx_signal_perf_evaluated on public.signal_performance(evaluated);
create index if not exists idx_signal_perf_entry_time on public.signal_performance(entry_time desc);
create index if not exists idx_macro_snapshots_date on public.macro_snapshots(snapshot_date desc);
