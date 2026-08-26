CREATE TABLE IF NOT EXISTS post_by_email_jobs (
  email_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pages INTEGER,
  url TEXT,
  preview TEXT,
  completed_at TIMESTAMPTZ
);
