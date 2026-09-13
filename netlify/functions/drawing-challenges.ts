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

  try {
    await db.sql`
      UPDATE drawing_challenges SET status = 'judging' WHERE status = 'open';
    `;
    const [challenge] = await db.sql`
      INSERT INTO drawing_challenges (id, title, difficulty, image_key, image_type, status)
      VALUES (${id}, ${title}, ${difficulty}, ${imageKey}, ${image.type}, 'open')
      RETURNING id, title, difficulty, status, created_at
    ` as Array<{ id: string; title: string; difficulty: string | null; status: string; created_at: string }>;

    return json({
      challenge: {
        ...challenge,
        imageUrl: `/api/drawing-image?challenge=${encodeURIComponent(id)}`,
      },
    }, 201);
  } catch (error) {
    await store.delete(imageKey).catch(() => undefined);
    throw error;
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
