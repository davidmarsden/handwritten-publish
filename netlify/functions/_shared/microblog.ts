export const MICROPUB_ENDPOINT = 'https://micro.blog/micropub';

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export async function upstreamError(response: Response, fallback: string): Promise<Response> {
  let message = fallback;
  try {
    const payload = await response.json() as { error?: string; error_description?: string };
    message = payload.error_description || payload.error || fallback;
  } catch {
    // Keep the sanitized fallback; never reflect upstream HTML or credentials.
  }
  return json({ error: message }, response.status >= 400 && response.status < 600 ? response.status : 502);
}
