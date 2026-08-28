CREATE TABLE IF NOT EXISTS public_usage_events (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('create', 'update')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS public_usage_events_created_at_idx
  ON public_usage_events (created_at);
