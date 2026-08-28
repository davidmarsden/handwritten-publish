import { getDatabase } from '@netlify/database';
import { json } from './microblog';

export type PublicUsageAction = 'create' | 'update';

const ALERT_TIMEOUT_MS = 1_500;
const WARNING_FRACTION = 0.8;

function env(name: string): string {
  const netlifyEnv = (globalThis as typeof globalThis & {
    Netlify?: { env?: { get?: (key: string) => string | undefined } };
  }).Netlify?.env?.get?.(name);
  return (netlifyEnv ?? process.env[name] ?? '').trim();
}

function monthlyLimit(): number | null {
  const raw = env('PUBLIC_MONTHLY_POST_LIMIT');
  if (!/^\d+$/.test(raw)) return null;
  const configured = Number(raw);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : null;
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

function killSwitchInstructions(): string {
  return [
    'Emergency kill switch:',
    '1. In Netlify, set PUBLIC_PUBLISHING_ENABLED=false for production.',
    '2. Trigger a fresh production deploy so the Functions receive the new value.',
    '3. Verify a browser Micro.blog bridge request returns HTTP 503 before treating the switch as active.',
    '',
    'Local browser editing/export and the separate reMarkable post-by-email workflow remain available.',
    'To re-enable browser publishing, remove the variable or set it to true, redeploy, and verify again.',
  ].join('\n');
}

async function sendOperatorAlert(subject: string, text: string): Promise<boolean> {
  const apiKey = env('PUBLIC_USAGE_RESEND_API_KEY');
  const from = env('PUBLIC_USAGE_ALERT_FROM');
  const to = env('PUBLIC_USAGE_ALERT_TO');
  if (!apiKey || !from || !to) return false;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text }),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.warn(`[public-usage] alert failed with HTTP ${response.status}`);
      return false;
    }
    return true;
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    console.warn(`[public-usage] alert ${timedOut ? 'timed out' : 'failed'}: ${error instanceof Error ? error.message : 'unknown error'}`);
    return false;
  }
}

async function maybeSendUsageAlert(status: Awaited<ReturnType<typeof publicUsageStatus>>): Promise<void> {
  if (status.limit === null) return;

  const warningAt = Math.max(1, Math.ceil(status.limit * WARNING_FRACTION));
  const severity = status.used >= status.limit ? 'limit' : status.used >= warningAt ? 'warning' : null;
  if (!severity) return;

  const monthKey = new Date().toISOString().slice(0, 7);
  const alertKey = `${monthKey}:${severity}`;
  const db = getDatabase();
  const reserved = await db.sql`
    INSERT INTO public_usage_alerts (alert_key)
    VALUES (${alertKey})
    ON CONFLICT DO NOTHING
    RETURNING alert_key
  ` as Array<{ alert_key: string }>;
  if (!reserved.length) return;

  const subject = severity === 'limit'
    ? 'Handwritten Publish demo limit reached'
    : 'Handwritten Publish demo usage warning';
  const text = [
    severity === 'limit'
      ? `The public demo has reached ${status.used} of ${status.limit} allowed publishes this month. Browser publishing is now blocked by the monthly limit.`
      : `The public demo has reached ${status.used} of ${status.limit} allowed publishes this month (${Math.round((status.used / status.limit) * 100)}%).`,
    `The allowance resets at ${status.resetAt}.`,
    '',
    killSwitchInstructions(),
  ].join('\n');

  const sent = await sendOperatorAlert(subject, text);
  if (!sent) {
    await db.sql`DELETE FROM public_usage_alerts WHERE alert_key = ${alertKey}`;
  }
}

export async function publicUsageLimitResponse(): Promise<Response | null> {
  const limit = monthlyLimit();
  if (limit === null) return null;
  try {
    const status = await publicUsageStatus();
    if (status.used < limit) return null;
    await maybeSendUsageAlert(status).catch(error => {
      console.warn(`[public-usage] threshold alert failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    });
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
    const status = await publicUsageStatus();
    await maybeSendUsageAlert(status);
  } catch (error) {
    // The Micro.blog mutation has already succeeded. Monitoring failures must never turn that into an apparent publish failure.
    console.warn(`[public-usage] monitoring failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}
