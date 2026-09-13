ALTER TABLE drawing_challenges
  ADD COLUMN elijah_score NUMERIC(4,2),
  ADD COLUMN elijah_grade TEXT;

ALTER TABLE drawing_challenges
  ADD CONSTRAINT drawing_challenges_elijah_score_range
  CHECK (elijah_score IS NULL OR (elijah_score >= 0 AND elijah_score <= 10));
