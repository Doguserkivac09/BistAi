-- BistAI Supabase schema
-- users are handled by Supabase Auth (auth.users)

-- Profiles: kullanıcı profil bilgileri (auth.users ile 1:1)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text check (char_length(bio) <= 500),
  tier text not null default 'free' check (tier in ('free', 'pro', 'premium')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  tier_expires_at timestamptz,
  subscription_status text default 'none' check (subscription_status in ('none', 'active', 'past_due', 'canceled', 'trialing')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Profiles insert via service role or self" on public.profiles for insert with check (auth.uid() = id);

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

-- Macro data: FRED ve Yahoo'dan gelen makro gösterge zaman serisi (Berk)
create table if not exists public.macro_data (
  id uuid primary key default gen_random_uuid(),
  indicator_key text not null,
  value numeric not null,
  observation_date date not null,
  source text not null default 'fred',
  fetched_at timestamptz not null default now(),
  unique(indicator_key, observation_date)
);

alter table public.macro_data enable row level security;
create policy "Macro data read for all" on public.macro_data for select using (true);
create policy "Macro data insert via service role" on public.macro_data for insert with check (true);
create policy "Macro data update via service role" on public.macro_data for update using (true);

-- Risk snapshots: günlük risk skoru geçmişi
create table if not exists public.risk_snapshots (
  id uuid primary key default gen_random_uuid(),
  score integer not null,
  status text not null check (status in ('risk-off', 'neutral', 'risk-on')),
  components jsonb not null default '{}',
  inputs jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.risk_snapshots enable row level security;
create policy "Risk snapshots read for all" on public.risk_snapshots for select using (true);
create policy "Risk snapshots insert via service role" on public.risk_snapshots for insert with check (true);

-- AI Cache: Claude API yanıtlarını 24 saat cache'ler (maliyet tasarrufu)
create table if not exists public.ai_cache (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null unique,
  explanation text not null,
  version smallint not null default 1,
  hit_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

alter table public.ai_cache enable row level security;
create policy "AI cache read for all" on public.ai_cache for select using (true);
create policy "AI cache insert via service role" on public.ai_cache for insert with check (true);
create policy "AI cache update via service role" on public.ai_cache for update using (true);
create policy "AI cache delete via service role" on public.ai_cache for delete using (true);

-- ========== COMMUNITY / TOPLULUK ==========

-- Posts: kullanıcı paylaşımları
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 200),
  body text not null check (char_length(body) between 10 and 5000),
  sembol text,
  category text not null default 'genel' check (category in ('genel', 'analiz', 'haber', 'soru', 'strateji')),
  like_count integer not null default 0,
  comment_count integer not null default 0,
  is_pinned boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;
create policy "Posts read for all authenticated" on public.posts for select using (auth.role() = 'authenticated' and is_deleted = false);
create policy "Users can create own posts" on public.posts for insert with check (auth.uid() = author_id);
create policy "Users can update own posts" on public.posts for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- Comments: yorum ve yanıtlar
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comments enable row level security;
create policy "Comments read for all authenticated" on public.comments for select using (auth.role() = 'authenticated' and is_deleted = false);
create policy "Users can create comments" on public.comments for insert with check (auth.uid() = author_id);
create policy "Users can update own comments" on public.comments for update using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- Likes: beğeni
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, post_id)
);

alter table public.likes enable row level security;
create policy "Likes read for all authenticated" on public.likes for select using (auth.role() = 'authenticated');
create policy "Users can like posts" on public.likes for insert with check (auth.uid() = user_id);
create policy "Users can unlike posts" on public.likes for delete using (auth.uid() = user_id);

-- Reports: şikayet
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null check (reason in ('spam', 'hakaret', 'yaniltici', 'diger')),
  detail text check (char_length(detail) <= 500),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved')),
  created_at timestamptz not null default now(),
  check (post_id is not null or comment_id is not null)
);

alter table public.reports enable row level security;
create policy "Users can create reports" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "Reports read via service role" on public.reports for select using (true);

-- Indexes
create index if not exists idx_ai_cache_key on public.ai_cache(cache_key);
create index if not exists idx_ai_cache_expires on public.ai_cache(expires_at);
create index if not exists idx_watchlist_user_id on public.watchlist(user_id);
create index if not exists idx_saved_signals_user_id on public.saved_signals(user_id);
create index if not exists idx_saved_signals_created_at on public.saved_signals(created_at desc);
create index if not exists idx_signal_perf_sembol on public.signal_performance(sembol);
create index if not exists idx_signal_perf_evaluated on public.signal_performance(evaluated);
create index if not exists idx_signal_perf_entry_time on public.signal_performance(entry_time desc);
create index if not exists idx_macro_snapshots_date on public.macro_snapshots(snapshot_date desc);
create index if not exists idx_macro_data_key_date on public.macro_data(indicator_key, observation_date desc);
create index if not exists idx_risk_snapshots_date on public.risk_snapshots(created_at desc);
create index if not exists idx_posts_author on public.posts(author_id);
create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_posts_category on public.posts(category);
create index if not exists idx_posts_sembol on public.posts(sembol) where sembol is not null;
create index if not exists idx_comments_post_id on public.comments(post_id);
create index if not exists idx_comments_author on public.comments(author_id);
create index if not exists idx_likes_post_id on public.likes(post_id);
create index if not exists idx_likes_user_id on public.likes(user_id);
create index if not exists idx_reports_status on public.reports(status) where status = 'pending';
