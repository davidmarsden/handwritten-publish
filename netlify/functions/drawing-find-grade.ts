import { getDatabase } from '@netlify/database';
import { cleanDisplayName } from './_shared/drawing-hand';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store, max-age=0' },
  });
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const body = await request.json().catch(() => null) as {
    displayName?: unknown;
    challengeId?: unknown;
  } | null;
  const displayName = cleanDisplayName(typeof body?.displayName === 'string' ? body.displayName : null);
  const challengeId = typeof body?.challengeId === 'string' ? body.challengeId.trim() : '';
  if (!displayName || !challengeId) return json({ error: 'Enter the name you used and choose the challenge.' }, 400);

  const db = getDatabase();
  const rows = await db.sql`
    SELECT s.result_token, s.judged_at
    FROM drawing_submissions s
    WHERE s.challenge_id = ${challengeId}
      AND LOWER(TRIM(s.display_name)) = LOWER(${displayName})
    ORDER BY s.submitted_at DESC
    LIMIT 2
  ` as Array<{ result_token: string; judged_at: string | null }>;

  // Keep the response deliberately vague unless there is one unambiguous match.
  if (rows.length !== 1) {
    return json({
      found: false,
      ambiguous: rows.length > 1,
      message: rows.length > 1
        ? 'We found more than one drawing with that name for this challenge. Ask Elijah for your private result link.'
        : 'We could not find one drawing matching that name and challenge. Check the name you used, or ask Elijah for help.',
    });
  }

  const row = rows[0];
  return json({
    found: true,
    status: row.judged_at ? 'judged' : 'waiting-for-elijah',
    resultToken: row.result_token,
    resultUrl: `/drawing/result/?token=${encodeURIComponent(row.result_token)}`,
  });
};

export const config = {
  path: '/api/drawing-find-grade',
  rateLimit: {
    windowLimit: 12,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
