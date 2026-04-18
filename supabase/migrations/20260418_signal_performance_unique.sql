-- v3: (sembol, signal_type, entry_time) için unique constraint
-- Scan ve scan-cache route'ları ON CONFLICT bu üçlüyü kullanıyor;
-- migration dosyalarında eşleşen constraint yoktu (muhtemelen dashboard'dan eklenmiş).
-- Bu migration idempotent — varsa no-op, yoksa ekler.

-- 1. Mevcut duplicate kayıtları temizle (varsa)
-- Aynı (sembol, signal_type, entry_time) için birden fazla user_id IS NULL satırı varsa,
-- en eski created_at olanı bırak, diğerlerini sil.
delete from public.signal_performance
where id in (
  select id from (
    select
      id,
      row_number() over (
        partition by sembol, signal_type, entry_time
        order by created_at asc
      ) as rn
    from public.signal_performance
    where user_id is null
  ) t
  where rn > 1
);

-- 2. Partial unique index (sadece global kayıtlar için)
-- user_id IS NULL filtresi — kullanıcı kayıtlarını etkilemez.
-- Supabase upsert onConflict: 'sembol,signal_type,entry_time' bu indexi arbiter olarak
-- kullanabilir çünkü tüm cron insert'leri user_id=null ile geliyor.
create unique index if not exists idx_signal_performance_unique_global
  on public.signal_performance(sembol, signal_type, entry_time)
  where user_id is null;

-- 3. Performans matrisi sorguları için composite index
create index if not exists idx_signal_performance_regime_type
  on public.signal_performance(regime, signal_type, evaluated);
