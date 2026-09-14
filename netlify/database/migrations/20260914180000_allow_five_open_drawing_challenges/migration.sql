DROP INDEX IF EXISTS drawing_challenges_single_open_idx;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at DESC, id DESC) AS position
  FROM drawing_challenges
  WHERE status IN ('open', 'judging')
)
UPDATE drawing_challenges AS challenge
SET status = CASE WHEN ranked.position <= 5 THEN 'open' ELSE 'judging' END
FROM ranked
WHERE challenge.id = ranked.id;
