-- Macro snapshots: Türkiye 10Y devlet tahvili gösterge faizi
-- 2026-04-26: TCMB politika faizi vs piyasa beklentisi karşılaştırması için
-- Idempotent — daha önce uygulansa da güvenli.

alter table public.macro_snapshots
  add column if not exists tr_10y numeric;

comment on column public.macro_snapshots.tr_10y
  is 'Türkiye 10 yıllık devlet tahvili gösterge faizi (%) — TCMB EVDS TP.ADHGTGS.AGTGS10Y';
