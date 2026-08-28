CREATE TABLE IF NOT EXISTS public_usage_alerts (
  alert_key TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
