import { getDatabase } from '@netlify/database';
import { drawingStore } from './_shared/drawing-hand';

export default async (request: Request) => {
  if (request.method !== 'GET') return new Response('Method not allowed.', { status: 405 });
  const url = new URL(request.url);
  const challengeId = url.searchParams.get('challenge')?.trim();
  const submissionToken = url.searchParams.get('submissionToken')?.trim();
  const db = getDatabase();

  let row: { image_key: string; image_type: string } | undefined;
  let cacheControl = 'private, max-age=300';

  if (challengeId) {
    [row] = await db.sql`
      SELECT image_key, image_type
      FROM drawing_challenges
      WHERE id = ${challengeId} AND status IN ('open', 'judging', 'closed')
      LIMIT 1
    ` as Array<{ image_key: string; image_type: string }>;
    cacheControl = 'public, max-age=300';
  } else if (submissionToken) {
    [row] = await db.sql`
      SELECT image_key, image_type
      FROM drawing_submissions
      WHERE result_token = ${submissionToken}
      LIMIT 1
    ` as Array<{ image_key: string; image_type: string }>;
  }

  if (!row) return new Response('Not found.', { status: 404 });

  const blob = await drawingStore().get(row.image_key, { type: 'blob' });
  if (!blob) return new Response('Not found.', { status: 404 });

  return new Response(blob, {
    headers: {
      'content-type': row.image_type,
      'cache-control': cacheControl,
      'x-content-type-options': 'nosniff',
    },
  });
};

export const config = {
  path: '/api/drawing-image',
  rateLimit: {
    windowLimit: 180,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
