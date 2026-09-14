import { getDatabase } from '@netlify/database';
import {
  cleanDisplayName,
  drawingStore,
  randomId,
  randomResultToken,
  validDrawingImage,
} from './_shared/drawing-hand';
import { sendOperatorAlert } from './_shared/public-usage';

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const form = await request.formData();
  const challengeId = typeof form.get('challengeId') === 'string' ? String(form.get('challengeId')).trim() : '';
  const displayName = cleanDisplayName(form.get('displayName'));
  const image = form.get('image');

  if (!challengeId) return json({ error: 'That challenge could not be found.' }, 400);
  if (!displayName) return json({ error: 'Add a first name or display name.' }, 400);
  if (!validDrawingImage(image)) {
    return json({ error: 'Choose a JPEG, PNG or WebP image up to 4 MB.' }, 400);
  }

  const db = getDatabase();
  const [challenge] = await db.sql`
    SELECT id, title
    FROM drawing_challenges
    WHERE id = ${challengeId} AND status = 'open'
    LIMIT 1
  ` as Array<{ id: string; title: string }>;
  if (!challenge) return json({ error: 'This challenge is not accepting entries.' }, 409);

  const id = randomId('submission');
  const imageKey = `submissions/${id}`;
  const resultToken = randomResultToken();
  const store = drawingStore();
  await store.set(imageKey, await image.arrayBuffer());

  try {
    await db.sql`
      INSERT INTO drawing_submissions (
        id, challenge_id, display_name, image_key, image_type, result_token, moderation_status
      ) VALUES (
        ${id}, ${challengeId}, ${displayName}, ${imageKey}, ${image.type}, ${resultToken}, 'pending'
      )
    `;
  } catch (error) {
    await store.delete(imageKey).catch(() => undefined);
    throw error;
  }

  await sendOperatorAlert(
    'Drawing Hand: new submission',
    [
      `Entrant: ${displayName}`,
      `Challenge: ${challenge.title}`,
      '',
      'Open the Judging Desk: https://hand.davidmarsden.info/drawing/judge/',
    ].join('\n'),
  ).catch(error => {
    console.warn(`[drawing-hand] submission alert failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  });

  return json({
    submission: {
      id,
      displayName,
      resultToken,
      resultUrl: `/drawing/result/?token=${encodeURIComponent(resultToken)}`,
      status: 'waiting-for-elijah',
    },
  }, 201);
};

export const config = {
  path: '/api/drawing-submissions',
  rateLimit: {
    windowLimit: 12,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
