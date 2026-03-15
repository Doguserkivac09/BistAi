-- Abonelik sistemi: profiles tablosuna Stripe alanları ekle
-- Phase 11.2

-- Stripe müşteri ID'si
alter table public.profiles
  add column if not exists stripe_customer_id text unique;

-- Abonelik ID'si (aktif subscription)
alter table public.profiles
  add column if not exists stripe_subscription_id text;

-- Tier bitiş tarihi (null = süresiz/free)
alter table public.profiles
  add column if not exists tier_expires_at timestamptz;

-- Abonelik durumu
alter table public.profiles
  add column if not exists subscription_status text default 'none'
    check (subscription_status in ('none', 'active', 'past_due', 'canceled', 'trialing'));

-- Index
create index if not exists idx_profiles_stripe_customer
  on public.profiles(stripe_customer_id) where stripe_customer_id is not null;

create index if not exists idx_profiles_subscription_status
  on public.profiles(subscription_status) where subscription_status != 'none';
