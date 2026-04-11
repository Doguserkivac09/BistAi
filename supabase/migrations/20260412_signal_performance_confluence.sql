-- signal_performance tablosuna confluence_score kolonu ekle
-- Backtest filtrelemesi için: düşük vs yüksek confluence karşılaştırması

alter table public.signal_performance
  add column if not exists confluence_score numeric;

-- İndeks: confluence_score'a göre filtreleme hızlandır
create index if not exists idx_signal_perf_confluence
  on public.signal_performance(confluence_score);
