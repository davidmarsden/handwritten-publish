import { json } from './microblog';

export type PublicUsageAction = 'create' | 'update';

const ALERT_TIMEOUT_MS = 1_500;

function env(name: string): string {
  const netlifyEnv = (globalThis as typeof globalThis & {
    Netlify?: { env?: { get?: (key: string) => string | undefined } };
  }).Netlify?.env?.get?.(name);
  return (netlifyEnv ?? process.env[name] ?? '').trim();
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
