-- Macro snapshots: günlük makro gösterge kayıtları ve skor geçmişi
-- Phase 4.5

create table if not exists public.macro_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  macro_score integer not null,
  wind text not null check (wind in ('strong_positive', 'positive', 'neutral', 'negative', 'strong_negative')),
  vix numeric,
  dxy numeric,
  us10y numeric,
  usdtry numeric,
  cds_5y numeric,
  policy_rate numeric,
  fed_funds_rate numeric,
  components jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique(snapshot_date)
);

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

create index if not exists idx_macro_snapshots_date on public.macro_snapshots(snapshot_date desc);
