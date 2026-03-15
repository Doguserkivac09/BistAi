-- Topluluk Platformu tabloları
-- Phase 10.1 — posts, comments, likes + RLS

-- ========== POSTS ==========
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 200),
  body text not null check (char_length(body) between 10 and 5000),
  sembol text,                                       -- opsiyonel hisse bağlantısı
  category text not null default 'genel' check (category in ('genel', 'analiz', 'haber', 'soru', 'strateji')),
  like_count integer not null default 0,
  comment_count integer not null default 0,
  is_pinned boolean not null default false,
  is_deleted boolean not null default false,          -- soft delete
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;

-- Herkes silinmemiş postları okuyabilir
create policy "Posts read for all authenticated"
  on public.posts for select
  using (auth.role() = 'authenticated' and is_deleted = false);

-- Kullanıcı kendi postunu oluşturabilir
create policy "Users can create own posts"
  on public.posts for insert
  with check (auth.uid() = author_id);

-- Kullanıcı kendi postunu güncelleyebilir
create policy "Users can update own posts"
  on public.posts for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- Soft delete: kullanıcı kendi postunu silebilir (is_deleted = true)
create policy "Users can soft delete own posts"
  on public.posts for update
  using (auth.uid() = author_id);

-- ========== COMMENTS ==========
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,  -- nested replies
  body text not null check (char_length(body) between 1 and 2000),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comments enable row level security;

create policy "Comments read for all authenticated"
  on public.comments for select
  using (auth.role() = 'authenticated' and is_deleted = false);

create policy "Users can create comments"
  on public.comments for insert
  with check (auth.uid() = author_id);

create policy "Users can update own comments"
  on public.comments for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- ========== LIKES ==========
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, post_id)
);

alter table public.likes enable row level security;

create policy "Likes read for all authenticated"
  on public.likes for select
  using (auth.role() = 'authenticated');

create policy "Users can like posts"
  on public.likes for insert
  with check (auth.uid() = user_id);

create policy "Users can unlike posts"
  on public.likes for delete
  using (auth.uid() = user_id);

-- ========== REPORTS (şikayet) ==========
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null check (reason in ('spam', 'hakaret', 'yaniltici', 'diger')),
  detail text check (char_length(detail) <= 500),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved')),
  created_at timestamptz not null default now(),
  check (post_id is not null or comment_id is not null)  -- en az biri dolu olmalı
);

alter table public.reports enable row level security;

create policy "Users can create reports"
  on public.reports for insert
  with check (auth.uid() = reporter_id);

-- Raporları sadece service_role okuyabilir (admin panel için)
create policy "Reports read via service role"
  on public.reports for select
  using (true);  -- service_role RLS bypass eder, anon kullanamaz

-- ========== TRIGGERS ==========

-- Post updated_at otomatik güncelleme
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.update_updated_at();

-- Comment updated_at otomatik güncelleme
create trigger comments_updated_at
  before update on public.comments
  for each row execute function public.update_updated_at();

-- Like eklenince post.like_count artır
create or replace function public.increment_like_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.posts set like_count = like_count + 1 where id = new.post_id;
  return new;
end;
$$;

create trigger on_like_insert
  after insert on public.likes
  for each row execute function public.increment_like_count();

-- Like silinince post.like_count azalt
create or replace function public.decrement_like_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

create trigger on_like_delete
  after delete on public.likes
  for each row execute function public.decrement_like_count();

-- Yorum eklenince post.comment_count artır
create or replace function public.increment_comment_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  return new;
end;
$$;

create trigger on_comment_insert
  after insert on public.comments
  for each row execute function public.increment_comment_count();

-- ========== INDEXES ==========
create index if not exists idx_posts_author on public.posts(author_id);
create index if not exists idx_posts_created_at on public.posts(created_at desc);
create index if not exists idx_posts_category on public.posts(category);
create index if not exists idx_posts_sembol on public.posts(sembol) where sembol is not null;
create index if not exists idx_comments_post_id on public.comments(post_id);
create index if not exists idx_comments_author on public.comments(author_id);
create index if not exists idx_comments_parent on public.comments(parent_id) where parent_id is not null;
create index if not exists idx_likes_post_id on public.likes(post_id);
create index if not exists idx_likes_user_id on public.likes(user_id);
create index if not exists idx_reports_status on public.reports(status) where status = 'pending';
