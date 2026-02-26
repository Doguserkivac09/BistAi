-- Add regime column to signal_performance (market regime at signal entry)

alter table public.signal_performance
  add column if not exists regime text;

comment on column public.signal_performance.regime is 'Market regime at entry: bull_trend, bear_trend, sideways';
