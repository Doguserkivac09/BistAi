-- Macro snapshots: ek emtia/endeks/enflasyon kolonları
-- 2026-04-25: tarihsel grafik tüm makro göstergeler için doldurulacak
-- Idempotent — daha önce uygulansa da güvenli.

alter table public.macro_snapshots
  add column if not exists eem        numeric,
  add column if not exists brent      numeric,
  add column if not exists gold       numeric,
  add column if not exists silver     numeric,
  add column if not exists copper     numeric,
  add column if not exists bist100    numeric,
  add column if not exists inflation  numeric;

comment on column public.macro_snapshots.eem       is 'iShares MSCI EM ETF kapanış';
comment on column public.macro_snapshots.brent     is 'Brent petrol fiyatı (USD)';
comment on column public.macro_snapshots.gold      is 'Altın spot (XAU/USD)';
comment on column public.macro_snapshots.silver    is 'Gümüş spot (XAG/USD)';
comment on column public.macro_snapshots.copper    is 'Bakır futures';
comment on column public.macro_snapshots.bist100   is 'BIST100 kapanış (XU100.IS)';
comment on column public.macro_snapshots.inflation is 'TÜFE yıllık % (TCMB EVDS)';
