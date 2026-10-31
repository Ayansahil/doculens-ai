-- ============================================================
-- DocuLens AI: AI usage audit + quota observability
-- Apply once in the Supabase SQL Editor (or via supabase db push).
--
-- Non-destructive: creates one new table + indexes + RLS policy.
-- If this migration is not applied, the backend records a bounded
-- in-memory usage audit instead and keeps working.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('chat', 'risk', 'embedding')),
  model TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count >= 1),
  prompt_tokens INTEGER CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  completion_tokens INTEGER CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  total_tokens INTEGER CHECK (total_tokens IS NULL OR total_tokens >= 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dashboard/usage lookups are always "one user, today, newest first".
CREATE INDEX IF NOT EXISTS ai_usage_events_user_created_idx
  ON public.ai_usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_usage_events_user_kind_created_idx
  ON public.ai_usage_events (user_id, kind, created_at DESC);

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- The backend uses the service-role key (bypasses RLS). This policy only
-- allows a signed-in user to read their own rows if a client ever queries
-- the table directly.
DROP POLICY IF EXISTS "Users can read own AI usage" ON public.ai_usage_events;
CREATE POLICY "Users can read own AI usage"
  ON public.ai_usage_events
  FOR SELECT
  USING (auth.uid() = user_id);

COMMENT ON TABLE public.ai_usage_events IS
  'Metadata-only AI usage audit. Never stores prompts, document text, API keys or provider secrets.';
