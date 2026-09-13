CREATE UNIQUE INDEX IF NOT EXISTS drawing_challenges_single_open_idx
  ON drawing_challenges ((status))
  WHERE status = 'open';
