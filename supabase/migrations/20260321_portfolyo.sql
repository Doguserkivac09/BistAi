-- Portföy pozisyonları: kullanıcıların elindeki hisse pozisyonları
create table if not exists public.portfolyo_pozisyonlar (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  sembol       text        not null,
  miktar       numeric     not null check (miktar > 0),
  alis_fiyati  numeric     not null check (alis_fiyati > 0),
  alis_tarihi  date        not null,
  notlar       text,
  created_at   timestamptz not null default now()
);

alter table public.portfolyo_pozisyonlar enable row level security;

create policy "Users can manage own portfolio"
  on public.portfolyo_pozisyonlar for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index portfolyo_user_idx on public.portfolyo_pozisyonlar(user_id);
