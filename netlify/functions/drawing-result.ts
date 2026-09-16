import { getDatabase } from '@netlify/database';

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store, max-age=0' },
  });
}

export default async (request: Request) => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  const token = new URL(request.url).searchParams.get('token')?.trim() ?? '';
  if (!token) return json({ error: 'Result not found.' }, 404);

  const db = getDatabase();
  const [row] = await db.sql`
    SELECT
      s.display_name,
      s.result_token,
      s.score,
      s.grade,
      s.judge_comment,
      s.judged_at,
      c.id AS challenge_id,
      c.title AS challenge_title,
      c.elijah_score,
      c.elijah_grade
    FROM drawing_submissions s
    JOIN drawing_challenges c ON c.id = s.challenge_id
    WHERE s.result_token = ${token}
    LIMIT 1
  ` as Array<{
    display_name: string;
    result_token: string;
    score: string | number | null;
    grade: string | null;
    judge_comment: string | null;
    judged_at: string | null;
    challenge_id: string;
    challenge_title: string;
    elijah_score: string | number | null;
    elijah_grade: string | null;
  }>;

  if (!row) return json({ error: 'Result not found.' }, 404);

  return json({
    result: {
      displayName: row.display_name,
      status: row.judged_at ? 'judged' : 'waiting-for-elijah',
      score: row.score === null ? null : Number(row.score),
      grade: row.grade,
      comment: row.judge_comment,
      judgedAt: row.judged_at,
      challenge: {
        id: row.challenge_id,
        title: row.challenge_title,
        imageUrl: `/api/drawing-image?challenge=${encodeURIComponent(row.challenge_id)}`,
        elijahScore: row.elijah_score === null ? null : Number(row.elijah_score),
        elijahGrade: row.elijah_grade,
      },
      imageUrl: `/api/drawing-image?submissionToken=${encodeURIComponent(row.result_token)}`,
    },
  });
};

export const config = {
  path: '/api/drawing-result',
  rateLimit: {
    windowLimit: 90,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
