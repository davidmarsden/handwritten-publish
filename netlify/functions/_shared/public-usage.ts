import { getDatabase } from '@netlify/database';
import { json } from './microblog';

export type PublicUsageAction = 'create' | 'update';

const ALERT_TIMEOUT_MS = 1_500;

function env(name: string): string {
  const netlifyEnv = (globalThis as typeof globalThis & {
    Netlify?: { env?: { get?: (key: string) => string | undefined } };
  }).Netlify?.env?.get?.(name);
  return (netlifyEnv ?? process.env[name] ?? '').trim();
}

function monthlyLimit(): number | null {
  const configured = Number.parseInt(env('PUBLIC_MONTHLY_POST_LIMIT'), 10);
  return Number.isFinite(configured) && configured > 0 ? configured : null;
}

function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function publicUsageStatus() {
  const limit = monthlyLimit();
  const { start, end } = monthBounds();
  try {
    const db = getDatabase();
    const [row] = await db.sql`
      SELECT COUNT(*)::int AS used
      FROM public_usage_events
      WHERE created_at >= ${start.toISOString()} AND created_at < ${end.toISOString()}
    ` as Array<{ used: number }>;
    const used = Number(row?.used ?? 0);
    return {
      used,
      limit,
      remaining: limit === null ? null : Math.max(0, limit - used),
      resetAt: end.toISOString(),
      limited: limit !== null,
    };
  } catch (error) {
    console.warn(`[public-usage] counter read failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    throw error;
  }
}

export async function publicUsageLimitResponse(): Promise<Response | null> {
  const limit = monthlyLimit();
  if (limit === null) return null;
  try {
    const status = await publicUsageStatus();
    if (status.used < limit) return null;
    return json({
      error: 'This public Handwritten Publish demo has reached its monthly publishing limit. You can still use the local document tools or run your own copy.',
      ...status,
    }, 429);
  } catch {
    return json({
      error: 'Public demo usage could not be checked safely, so browser publishing is temporarily unavailable.',
    }, 503);
  }
}

export function publicPublishingDisabledResponse(): Response | null {
  const configured = env('PUBLIC_PUBLISHING_ENABLED').toLowerCase();
  if (configured !== 'false' && configured !== '0' && configured !== 'off') return null;
  return json({
    error: 'Public Micro.blog publishing is temporarily disabled on this Handwritten Publish instance.',
  }, 503);
}

export async function recordPublicUsage(action: PublicUsageAction): Promise<void> {
  const timestamp = new Date().toISOString();
  console.info(`[public-usage] ${action} ${timestamp}`);

  try {
    const db = getDatabase();
    await db.sql`INSERT INTO public_usage_events (action, created_at) VALUES (${action}, ${timestamp})`;
  } catch (error) {
    // The Micro.blog mutation has already succeeded. Counter failures must never turn that into an apparent publish failure.
    console.warn(`[public-usage] counter write failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }

  const apiKey = env('PUBLIC_USAGE_RESEND_API_KEY');
  const from = env('PUBLIC_USAGE_ALERT_FROM');
  const to = env('PUBLIC_USAGE_ALERT_TO');
  if (!apiKey || !from || !to) return;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Handwritten Publish public ${action}`,
        text: `A public browser user successfully completed a Micro.blog ${action} through Handwritten Publish at ${timestamp}.\n\nNo Micro.blog token, post title, post content, destination URL or visitor identity was recorded in this alert.`,
      }),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[public-usage] alert failed with HTTP ${response.status}`);
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    console.warn(`[public-usage] alert ${timedOut ? 'timed out' : 'failed'}: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}
