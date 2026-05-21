-- ============================================================
-- DocuLens AI: Real Document Risk Analysis Storage
-- Apply once in the Supabase SQL Editor before using risk analysis.
-- Non-destructive: creates one new table + indexes + RLS policy.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL UNIQUE REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'insufficient_evidence')),
  risk_level TEXT CHECK (risk_level IN ('Low', 'Medium', 'High')),
  risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
  summary TEXT,
  -- Array of { category, severity, evidence, explanation, recommendation }
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- { truncated, chunkCount, analyzedCharacters, totalCharacters }
  coverage JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  model TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_analysis_user_id
  ON public.document_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_document_analysis_level
  ON public.document_analysis(risk_level);
CREATE INDEX IF NOT EXISTS idx_document_analysis_status
  ON public.document_analysis(status);

-- Keep updated_at fresh (also used to detect stale "processing" runs)
CREATE OR REPLACE FUNCTION public.touch_document_analysis_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_document_analysis_updated_at ON public.document_analysis;
CREATE TRIGGER trg_document_analysis_updated_at
  BEFORE UPDATE ON public.document_analysis
  FOR EACH ROW EXECUTE FUNCTION public.touch_document_analysis_updated_at();

-- Owners can read their analysis; writes are performed only by the
-- backend using the service-role key (which bypasses RLS).
ALTER TABLE public.document_analysis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own analysis" ON public.document_analysis;
CREATE POLICY "Users can view own analysis" ON public.document_analysis
  FOR SELECT USING (auth.uid() = user_id);
