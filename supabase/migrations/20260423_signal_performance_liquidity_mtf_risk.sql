-- signal_performance tablosuna likidite, MTF hizalama ve risk seviyesi kolonları
-- P0-3 (ADV filtresi), P1-1 (MTF uyum), P2-1 (R/R gösterimi + filtresi)
--
-- Bu kolonlar signals.ts içinde zaten hesaplanıyor ama DB'ye yazılmıyordu.
-- Scan cron route'u 2026-04-23'ten itibaren bu alanları da upsert edecek.
-- Eski kayıtlar null olarak kalır; yeni kayıtlar dolu gelir.

-- 1. Likidite: son 20 günün ortalama günlük TL işlem hacmi
alter table public.signal_performance
  add column if not exists avg_daily_volume_tl numeric;

-- 2. Multi-timeframe hizalama: haftalık trendin sinyal yönü ile uyumu
alter table public.signal_performance
  add column if not exists weekly_aligned boolean;

-- 3. Risk yönetimi: ATR bazlı stop + hedef + R/R oranı
alter table public.signal_performance
  add column if not exists stop_loss numeric;

alter table public.signal_performance
  add column if not exists target_price numeric;

alter table public.signal_performance
  add column if not exists risk_reward_ratio numeric;

alter table public.signal_performance
  add column if not exists atr numeric;

-- İndeksler
-- ADV: likidite filtresi için (>10M TL sinyaller)
create index if not exists idx_signal_perf_adv
  on public.signal_performance(avg_daily_volume_tl)
  where avg_daily_volume_tl is not null;

-- R/R: minimum R/R filtresi için
create index if not exists idx_signal_perf_rr
  on public.signal_performance(risk_reward_ratio)
  where risk_reward_ratio is not null;

-- MTF: weekly_aligned=true filtresi için
create index if not exists idx_signal_perf_weekly
  on public.signal_performance(weekly_aligned)
  where weekly_aligned is not null;
