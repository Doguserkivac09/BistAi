-- scanner_signals
-- Amaç: TradingView VIOP tarayıcı alarmlarının HER SEMBOLÜNÜ tek satır olarak
-- saklar. Amaç backtest: hangi sinyal (ve hangi sinyal KOMBİNASYONU) gerçekten
-- işe yarıyor, sayıyla görmek.
--
-- Akış:  TradingView alarm (JSON) → /api/tradingview-alert → bu tablo + Telegram
--        sonra → /api/cron/scanner-evaluate → sonuç kolonlarını doldurur
--        sonra → /api/scanner-stats → sinyal/kombinasyon bazlı sıralama

CREATE TABLE IF NOT EXISTS scanner_signals (
  id             BIGSERIAL PRIMARY KEY,

  -- ── Sinyal kimliği ────────────────────────────────────────────────────────
  fired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- alarmın bize ulaştığı an
  bar_time       TIMESTAMPTZ,                          -- sinyal barının kapanış zamanı
  scan_tf        TEXT        NOT NULL,                 -- "15" | "60" | "D"
  source         TEXT        NOT NULL,                 -- "B1" | "B2" | ...
  symbol         TEXT        NOT NULL,                 -- "ASELS"
  direction      SMALLINT    NOT NULL,                 -- 1 = yukarı, -1 = aşağı

  -- ── Sinyal bileşimi ───────────────────────────────────────────────────────
  -- Bit maskesi: 1=yutan 2=VIkes 4=VIyakn 8=DIkes 16=kirilim 32=FVG 64=iFVG
  signal_mask    INTEGER     NOT NULL,
  signal_text    TEXT,                                 -- "Yutan FVG" (okunabilirlik)
  signal_count   SMALLINT,                             -- kaç sinyal aynı anda

  -- ── Bağlam (filtre değerleri — hangisi ayırt ediyor onu ölçeceğiz) ────────
  score          REAL,
  adx            REAL,
  rvol           REAL,                                 -- saat-bazlı bağıl hacim
  tl_mn          REAL,                                 -- bar TL cirosu (mn TL)
  cmf            REAL,
  vwap_side      SMALLINT,                             -- 1 = VWAP üstü, -1 = altı
  index_regime   SMALLINT,                             -- 1 / 0 / -1
  killzone       TEXT,                                 -- "ACILIS" | "OGLE" | ... | ""
  rel_strength   REAL,                                 -- hisse % − endeks % (göreli güç)
  level_dist_atr REAL,                                 -- en yakın seviyeye ATR cinsinden uzaklık
  follow_through SMALLINT,                             -- 1 = sonraki bar teyit etti, 0 = etmedi

  -- ── Fiyat / risk referansı ───────────────────────────────────────────────
  price          REAL        NOT NULL,                 -- sinyal anındaki kapanış
  atr            REAL,                                 -- o andaki ATR (hedef/stop ölçeği)

  -- ── Sonuç (evaluate cron doldurur) ───────────────────────────────────────
  evaluated      BOOLEAN     NOT NULL DEFAULT FALSE,
  evaluated_at   TIMESTAMPTZ,
  outcome        TEXT,                                 -- "hedef" | "stop" | "sonucsuz"
  bars_to_result SMALLINT,
  mfe_atr        REAL,                                 -- lehte en uzak hareket (ATR)
  mae_atr        REAL,                                 -- aleyhte en uzak hareket (ATR)
  return_pct     REAL,                                 -- ufuk sonundaki yön-düzeltmeli getiri

  -- Aynı sembol + aynı bar + aynı kaynak iki kez yazılmasın (alarm tekrarı)
  CONSTRAINT scanner_signals_uniq UNIQUE (source, scan_tf, symbol, bar_time)
);

CREATE INDEX IF NOT EXISTS scanner_signals_pending_idx
  ON scanner_signals (evaluated, bar_time)
  WHERE evaluated = FALSE;

CREATE INDEX IF NOT EXISTS scanner_signals_mask_idx
  ON scanner_signals (scan_tf, signal_mask, direction);

CREATE INDEX IF NOT EXISTS scanner_signals_symbol_idx
  ON scanner_signals (symbol, fired_at DESC);

-- RLS: yalnızca service role (webhook + cron). Anon/authenticated erişemez.
ALTER TABLE scanner_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_only" ON scanner_signals
  USING (false)
  WITH CHECK (false);
