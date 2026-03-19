-- Kullanıcı profil tablosu
-- auth.users ile 1:1 ilişki, otomatik oluşturulur.
--
-- Phase 9.1

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text check (char_length(bio) <= 500),
  tier text not null default 'free' check (tier in ('free', 'pro', 'premium')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS: kullanıcı kendi profilini okuyabilir/düzenleyebilir, herkes profilini görebilir
alter table public.profiles enable row level security;

-- Herkes profilleri okuyabilir (topluluk özelliği için)
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

-- Kullanıcı sadece kendi profilini güncelleyebilir
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Service role insert yapabilir (trigger için)
create policy "Profiles insert via service role or self"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Yeni kullanıcı kaydolunca otomatik profil oluştur
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger: auth.users'a yeni satır eklenince profil oluştur
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at otomatik güncelleme
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at();

-- Index
create index if not exists idx_profiles_tier on public.profiles(tier);
