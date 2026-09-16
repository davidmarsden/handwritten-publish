import { getDatabase } from '@netlify/database';
import {
  cleanDifficulty,
  cleanTitle,
  drawingAdminAuthorized,
  drawingStore,
  randomId,
  validDrawingImage,
} from './_shared/drawing-hand';
import { DRAWING_GRADES, suggestedDrawingGrade } from '../../src/drawingGrades';

const MAX_VISIBLE_CHALLENGES = 5;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export default async (request: Request) => {
  const db = getDatabase();

  if (request.method === 'GET') {
    const rows = await db.sql`
      SELECT id, title, difficulty, status, created_at, elijah_score, elijah_grade
      FROM drawing_challenges
      WHERE status = 'open'
      ORDER BY created_at DESC, id DESC
      LIMIT ${MAX_VISIBLE_CHALLENGES}
    ` as Array<{ id: string; title: string; difficulty: string | null; status: string; created_at: string; elijah_score: string | number | null; elijah_grade: string | null }>;

    const recoveryRows = await db.sql`
      SELECT id, title, created_at
      FROM drawing_challenges
      ORDER BY created_at DESC, id DESC
    ` as Array<{ id: string; title: string; created_at: string }>;

    const challenges = rows.map(challenge => ({
      ...challenge,
      elijahScore: challenge.elijah_score === null ? null : Number(challenge.elijah_score),
      elijahGrade: challenge.elijah_grade,
      elijah_score: undefined,
      elijah_grade: undefined,
      imageUrl: `/api/drawing-image?challenge=${encodeURIComponent(challenge.id)}`,
    }));

    return json({
      challenges,
      challenge: challenges[0] ?? null,
      recoveryChallenges: recoveryRows.map(({ id, title }) => ({ id, title })),
    });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!drawingAdminAuthorized(request)) return json({ error: 'Not authorised.' }, 401);

  const form = await request.formData();
  const title = cleanTitle(form.get('title'));
  const difficulty = cleanDifficulty(form.get('difficulty'));
  const image = form.get('image');
  const rawScore = String(form.get('elijahScore') ?? '').trim();
  const elijahScore = rawScore === '' ? null : Number(rawScore);
  const rawGrade = String(form.get('elijahGrade') ?? '').trim();
  if (!title) return json({ error: 'Give the challenge a title.' }, 400);
  if (!validDrawingImage(image)) {
    return json({ error: 'Choose a JPEG, PNG or WebP image up to 4 MB.' }, 400);
  }
  if (elijahScore !== null && (!Number.isFinite(elijahScore) || elijahScore < 0 || elijahScore > 10)) {
    return json({ error: "Elijah's score must be between 0 and 10." }, 400);
  }
  if (rawGrade && !DRAWING_GRADES.some(({ label }) => label === rawGrade)) {
    return json({ error: "Choose one of Elijah's grades." }, 400);
  }
  const elijahGrade = rawGrade || (elijahScore === null ? null : suggestedDrawingGrade(elijahScore));

  const id = randomId('challenge');
  const imageKey = `challenges/${id}`;
  const store = drawingStore();
  await store.set(imageKey, await image.arrayBuffer());

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('drawing-hand-open-challenge'))");

    const result = await client.query<{
      id: string;
      title: string;
      difficulty: string | null;
      status: string;
      created_at: string;
      elijah_score: string | number | null;
      elijah_grade: string | null;
    }>(
      `INSERT INTO drawing_challenges (id, title, difficulty, image_key, image_type, status, elijah_score, elijah_grade)
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7)
       RETURNING id, title, difficulty, status, created_at, elijah_score, elijah_grade`,
      [id, title, difficulty, imageKey, image.type, elijahScore, elijahGrade],
    );

    await client.query(
      `UPDATE drawing_challenges
       SET status = 'judging'
       WHERE id IN (
         SELECT id
         FROM drawing_challenges
         WHERE status = 'open'
         ORDER BY created_at DESC, id DESC
         OFFSET $1
       )`,
      [MAX_VISIBLE_CHALLENGES],
    );

    await client.query('COMMIT');
    const challenge = result.rows[0];

    return json({
      challenge: {
        id: challenge.id,
        title: challenge.title,
        difficulty: challenge.difficulty,
        status: challenge.status,
        created_at: challenge.created_at,
        elijahScore: challenge.elijah_score === null ? null : Number(challenge.elijah_score),
        elijahGrade: challenge.elijah_grade,
        imageUrl: `/api/drawing-image?challenge=${encodeURIComponent(id)}`,
      },
    }, 201);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    await store.delete(imageKey).catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

export const config = {
  path: '/api/drawing-challenges',
  rateLimit: {
    windowLimit: 30,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
