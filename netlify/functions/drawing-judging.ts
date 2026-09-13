import { getDatabase } from '@netlify/database';
import { DRAWING_GRADES, suggestedDrawingGrade } from '../../src/drawingGrades';
import { drawingAdminAuthorized } from './_shared/drawing-hand';

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

const validGrades = new Set(DRAWING_GRADES.map(({ label }) => label));

export default async (request: Request) => {
  if (!drawingAdminAuthorized(request)) return json({ error: 'Not authorised.' }, 401);
  const db = getDatabase();

  if (request.method === 'GET') {
    const rows = await db.sql`
      SELECT
        s.id,
        s.display_name,
        s.submitted_at,
        s.result_token,
        s.moderation_status,
        s.score,
        s.grade,
        s.judge_comment,
        s.judged_at,
        c.id AS challenge_id,
        c.title AS challenge_title
      FROM drawing_submissions s
      JOIN drawing_challenges c ON c.id = s.challenge_id
      ORDER BY (s.judged_at IS NULL) DESC, s.submitted_at ASC
    ` as Array<{
      id: string;
      display_name: string;
      submitted_at: string;
      result_token: string;
      moderation_status: string;
      score: string | number | null;
      grade: string | null;
      judge_comment: string | null;
      judged_at: string | null;
      challenge_id: string;
      challenge_title: string;
    }>;

    return json({
      submissions: rows.map(row => ({
        id: row.id,
        displayName: row.display_name,
        submittedAt: row.submitted_at,
        moderationStatus: row.moderation_status,
        score: row.score === null ? null : Number(row.score),
        grade: row.grade,
        comment: row.judge_comment,
        judgedAt: row.judged_at,
        challenge: {
          id: row.challenge_id,
          title: row.challenge_title,
          imageUrl: `/api/drawing-image?challenge=${encodeURIComponent(row.challenge_id)}`,
        },
        imageUrl: `/api/drawing-image?submissionToken=${encodeURIComponent(row.result_token)}`,
        resultUrl: `/drawing/result/?token=${encodeURIComponent(row.result_token)}`,
      })),
      grades: DRAWING_GRADES,
    });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const body = await request.json().catch(() => null) as {
    submissionId?: unknown;
    score?: unknown;
    grade?: unknown;
    comment?: unknown;
    showInGallery?: unknown;
  } | null;

  const submissionId = typeof body?.submissionId === 'string' ? body.submissionId.trim() : '';
  const rawScore = body?.score;
  const score = typeof rawScore === 'number'
    ? rawScore
    : (typeof rawScore === 'string' && rawScore.trim() ? Number(rawScore) : Number.NaN);
  const grade = typeof body?.grade === 'string' ? body.grade.trim() : '';
  const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, 280) : '';
  const showInGallery = body?.showInGallery === true;

  if (!submissionId) return json({ error: 'Choose a drawing to judge.' }, 400);
  if (!Number.isFinite(score) || score < 0 || score > 10) return json({ error: 'Score must be between 0 and 10.' }, 400);
  if (!validGrades.has(grade)) return json({ error: 'Choose one of Elijah’s 25 grades.' }, 400);

  const [updated] = await db.sql`
    UPDATE drawing_submissions
    SET
      score = ${score},
      grade = ${grade},
      judge_comment = ${comment || null},
      judged_at = NOW(),
      moderation_status = ${showInGallery ? 'approved' : 'hidden'}
    WHERE id = ${submissionId}
    RETURNING id, score, grade, judge_comment, judged_at, moderation_status
  ` as Array<{
    id: string;
    score: string | number;
    grade: string;
    judge_comment: string | null;
    judged_at: string;
    moderation_status: string;
  }>;

  if (!updated) return json({ error: 'That drawing could not be found.' }, 404);

  return json({
    judgement: {
      id: updated.id,
      score: Number(updated.score),
      grade: updated.grade,
      comment: updated.judge_comment,
      judgedAt: updated.judged_at,
      moderationStatus: updated.moderation_status,
      suggestedGrade: suggestedDrawingGrade(Number(updated.score)),
    },
  });
};

export const config = {
  path: '/api/drawing-judging',
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
