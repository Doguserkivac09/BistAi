-- Future Brightness Score tablosu
-- Her US hissesi için 0-100 skor: revenue growth, analyst upside, insider, news, institutional, balance, partnerships

CREATE TABLE IF NOT EXISTS public.future_scores (
  sembol                text NOT NULL,
  market                text NOT NULL DEFAULT 'US',
  score                 int  NOT NULL,
  revenue_score         int,
  analyst_score         int,
  insider_score         int,
  news_score            int,
  institutional_score   int,
  balance_score         int,
  partnership_score     int,
  ai_summary            text,
  scored_at             timestamptz DEFAULT now(),
  PRIMARY KEY (sembol, market)
);

CREATE INDEX IF NOT EXISTS idx_future_scores_score ON public.future_scores(market, score DESC);
CREATE INDEX IF NOT EXISTS idx_future_scores_scored_at ON public.future_scores(scored_at DESC);

ALTER TABLE public.future_scores ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='future_scores' AND policyname='future_scores_public_read'
  ) THEN
    CREATE POLICY "future_scores_public_read" ON public.future_scores
    FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='future_scores' AND policyname='future_scores_svc_write'
  ) THEN
    CREATE POLICY "future_scores_svc_write" ON public.future_scores
    FOR ALL USING (auth.role()='service_role') WITH CHECK (auth.role()='service_role');
  END IF;
END $$;
