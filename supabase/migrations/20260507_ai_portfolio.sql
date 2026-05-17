-- AI Portföyü — Sanal Fon Simülasyonu
--
-- 100.000₺ başlangıç sermayesiyle her hafta gerçek kararlar veren
-- yapay zeka portföyü. Kararlar + gerekçe tam şeffaf kayıt altında.

-- ── Mevcut Açık Pozisyonlar ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_portfolio_positions (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  sembol           text        NOT NULL,
  sector_id        text,
  sector_name      text,
  shares           float8      NOT NULL,          -- Hisse adedi
  entry_price      float8      NOT NULL,           -- Alım fiyatı
  entry_time       timestamptz NOT NULL DEFAULT now(),
  entry_week       int         NOT NULL,           -- ISO hafta numarası
  entry_year       int         NOT NULL,
  current_price    float8,                         -- Son güncellenen fiyat
  stop_loss        float8,                         -- Stop-loss seviyesi
  take_profit      float8,                         -- Kâr al seviyesi
  trailing_stop    float8,                         -- Trailing stop (dinamik)
  cost_basis       float8,                         -- Toplam maliyet (shares × entry)
  is_open          boolean     DEFAULT true,
  closed_at        timestamptz,
  close_price      float8,                         -- Çıkış fiyatı
  close_reason     text,                           -- 'stop_loss' | 'take_profit' | 'rebalance' | 'signal_weak'
  realized_pnl     float8,                         -- Gerçekleşen kâr/zarar (TL)
  realized_pnl_pct float8,                         -- Gerçekleşen kâr/zarar (%)
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_portfolio_positions_open
  ON public.ai_portfolio_positions (is_open, entry_year DESC, entry_week DESC);

CREATE INDEX IF NOT EXISTS idx_ai_portfolio_positions_sembol
  ON public.ai_portfolio_positions (sembol, is_open);

-- ── Haftalık Portföy Değer Geçmişi ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_portfolio_history (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  week_number      int         NOT NULL,
  year             int         NOT NULL,
  snapshot_date    timestamptz NOT NULL DEFAULT now(),
  -- Değer bileşenleri
  total_value      float8      NOT NULL,           -- Toplam portföy değeri (TL)
  cash             float8      NOT NULL,           -- Nakit
  positions_value  float8      NOT NULL,           -- Açık pozisyonların değeri
  -- Haftalık performans
  weekly_return    float8,                         -- Bu haftaki getiri (%)
  bist_return      float8,                         -- BIST bu haftaki getiri (%)
  alpha            float8,                         -- Fazla getiri (weekly_return - bist_return)
  -- Kümülatif performans
  total_return     float8,                         -- Başlangıçtan bu yana (%)
  total_bist_return float8,
  -- Risk metrikleri
  max_drawdown     float8,                         -- En büyük düşüş (%)
  sharpe_ratio     float8,                         -- Sharpe Ratio
  win_rate         float8,                         -- Kapatılan işlemlerin kâr oranı
  -- Portföy özeti
  position_count   int         DEFAULT 0,
  closed_this_week int         DEFAULT 0,
  opened_this_week int         DEFAULT 0,
  UNIQUE (week_number, year)
);

-- ── Haftalık Kararlar (Audit Trail) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_portfolio_decisions (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  week_number      int         NOT NULL,
  year             int         NOT NULL,
  sembol           text        NOT NULL,
  action           text        NOT NULL CHECK (action IN ('BUY','SELL','HOLD','PARTIAL_SELL')),
  shares           float8,                         -- İşlem miktarı
  theoretical_price float8,                        -- İşlem anındaki fiyat
  cost_or_proceeds float8,                         -- Maliyet (BUY) veya gelir (SELL)
  -- Karar faktörleri
  dip_score        int,
  investment_score int,
  technical_score  int,
  macro_context    text,
  -- Gerekçe
  reason_short     text        NOT NULL,           -- 1 cümle
  reason_ai        text,                           -- Claude AI detaylı gerekçe
  -- Sonuç (doldurulur kapanınca)
  outcome_return   float8,                         -- Bu karar sonunda ne kazandı/kaybettirdi
  was_correct      boolean,                        -- Doğru karar mıydı?
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_portfolio_decisions_week
  ON public.ai_portfolio_decisions (year DESC, week_number DESC);

-- ── Başlangıç Sermayesi Kaydı ─────────────────────────────────────────
-- İlk haftalık snapshot yoksa oluştur
INSERT INTO public.ai_portfolio_history (week_number, year, total_value, cash, positions_value, total_return, total_bist_return)
SELECT
  EXTRACT(WEEK FROM NOW())::int,
  EXTRACT(YEAR FROM NOW())::int,
  100000,   -- 100.000₺ başlangıç
  100000,   -- Tamamı nakit
  0,
  0,
  0
WHERE NOT EXISTS (SELECT 1 FROM public.ai_portfolio_history LIMIT 1);

-- ── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.ai_portfolio_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_portfolio_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_portfolio_decisions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_portfolio_public_read"  ON public.ai_portfolio_positions FOR SELECT USING (true);
CREATE POLICY "ai_portfolio_public_read2" ON public.ai_portfolio_history   FOR SELECT USING (true);
CREATE POLICY "ai_portfolio_public_read3" ON public.ai_portfolio_decisions  FOR SELECT USING (true);

CREATE POLICY "ai_portfolio_service_write"  ON public.ai_portfolio_positions FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_portfolio_service_write2" ON public.ai_portfolio_history   FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "ai_portfolio_service_write3" ON public.ai_portfolio_decisions  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
