import { getDatabase } from '@netlify/database';
import {
  cleanDifficulty,
  cleanTitle,
  drawingAdminAuthorized,
  drawingStore,
  randomId,
  validDrawingImage,
} from './_shared/drawing-hand';

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export default async (request: Request) => {
  const db = getDatabase();

  if (request.method === 'GET') {
    const rows = await db.sql`
      SELECT id, title, difficulty, status, created_at
      FROM drawing_challenges
      WHERE status = 'open'
      ORDER BY created_at DESC
      LIMIT 1
    ` as Array<{ id: string; title: string; difficulty: string | null; status: string; created_at: string }>;

    const challenge = rows[0];
    if (!challenge) return json({ challenge: null });
    return json({
      challenge: {
        ...challenge,
        imageUrl: `/api/drawing-image?challenge=${encodeURIComponent(challenge.id)}`,
      },
    });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!drawingAdminAuthorized(request)) return json({ error: 'Not authorised.' }, 401);

  const form = await request.formData();
  const title = cleanTitle(form.get('title'));
  const difficulty = cleanDifficulty(form.get('difficulty'));
  const image = form.get('image');
  if (!title) return json({ error: 'Give the challenge a title.' }, 400);
  if (!validDrawingImage(image)) {
    return json({ error: 'Choose a JPEG, PNG or WebP image up to 4 MB.' }, 400);
  }

  const id = randomId('challenge');
  const imageKey = `challenges/${id}`;
  const store = drawingStore();
  await store.set(imageKey, await image.arrayBuffer());

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Serialize challenge publishing even when two admin requests overlap.
    // The partial unique index is the database-level backstop, while this
    // transaction ensures retiring the old challenge and opening the new one
    // either both happen or neither happens.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('drawing-hand-open-challenge'))");
    await client.query(
      "UPDATE drawing_challenges SET status = 'judging' WHERE status = 'open'",
    );

    const result = await client.query<{
      id: string;
      title: string;
      difficulty: string | null;
      status: string;
      created_at: string;
    }>(
      `INSERT INTO drawing_challenges (id, title, difficulty, image_key, image_type, status)
       VALUES ($1, $2, $3, $4, $5, 'open')
       RETURNING id, title, difficulty, status, created_at`,
      [id, title, difficulty, imageKey, image.type],
    );

    await client.query('COMMIT');
    const challenge = result.rows[0];

    return json({
      challenge: {
        ...challenge,
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
