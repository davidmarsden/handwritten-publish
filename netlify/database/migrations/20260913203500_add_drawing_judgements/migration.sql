ALTER TABLE drawing_submissions
  ADD COLUMN IF NOT EXISTS score NUMERIC(5,3),
  ADD COLUMN IF NOT EXISTS grade TEXT,
  ADD COLUMN IF NOT EXISTS judge_comment TEXT,
  ADD COLUMN IF NOT EXISTS judged_at TIMESTAMPTZ;

ALTER TABLE drawing_submissions
  DROP CONSTRAINT IF EXISTS drawing_submissions_score_check;

ALTER TABLE drawing_submissions
  ADD CONSTRAINT drawing_submissions_score_check
  CHECK (score IS NULL OR (score >= 0 AND score <= 10));

CREATE INDEX IF NOT EXISTS drawing_submissions_judged_at_idx
  ON drawing_submissions (judged_at, submitted_at DESC);
