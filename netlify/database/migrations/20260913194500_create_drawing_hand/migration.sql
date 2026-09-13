CREATE TABLE IF NOT EXISTS drawing_challenges (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  difficulty TEXT,
  image_key TEXT NOT NULL UNIQUE,
  image_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'judging', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drawing_challenges_status_created_at_idx
  ON drawing_challenges (status, created_at DESC);

CREATE TABLE IF NOT EXISTS drawing_submissions (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES drawing_challenges(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  image_key TEXT NOT NULL UNIQUE,
  image_type TEXT NOT NULL,
  result_token TEXT NOT NULL UNIQUE,
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'hidden')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS drawing_submissions_challenge_submitted_at_idx
  ON drawing_submissions (challenge_id, submitted_at DESC);
