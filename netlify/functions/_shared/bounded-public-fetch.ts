import { request as httpsRequest } from 'node:https';
import { resolvePublicMastodonInstance } from './mastodon-session';

type BoundedFetchOptions = {
  maxBytes: number;
  totalTimeoutMs: number;
};

export async function boundedPublicFetch(
  instanceOrigin: string,
  path: string,
  init: RequestInit = {},
  options: BoundedFetchOptions,
): Promise<Response> {
  const pinned = await resolvePublicMastodonInstance(instanceOrigin);
  const url = new URL(path, instanceOrigin);
  if (url.origin !== instanceOrigin) throw new Error('Invalid public Fediverse path.');

  return new Promise((resolve, reject) => {
    const headers = new Headers(init.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', '*/*');
    if (!headers.has('Host')) headers.set('Host', url.host);

    let settled = false;
    let overallTimer: ReturnType<typeof setTimeout> | undefined;
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      if (overallTimer) clearTimeout(overallTimer);
      reject(error);
    };

    const req = httpsRequest({
      protocol: 'https:',
      hostname: pinned.address,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: init.method || 'GET',
      headers: Object.fromEntries(headers.entries()),
      servername: url.hostname,
    }, response => {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      response.on('data', chunk => {
        const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        totalBytes += bytes.byteLength;
        if (totalBytes > options.maxBytes) {
          response.destroy(new Error('Public Fediverse response exceeded the allowed size.'));
          return;
        }
        chunks.push(bytes);
      });

      response.on('error', error => finishReject(error instanceof Error ? error : new Error(String(error))));
      response.on('end', () => {
        if (settled) return;
        settled = true;
        if (overallTimer) clearTimeout(overallTimer);
        const responseHeaders = new Headers();
        for (let index = 0; index < response.rawHeaders.length; index += 2) {
          responseHeaders.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
        }
        resolve(new Response(Buffer.concat(chunks), {
          status: response.statusCode || 502,
          statusText: response.statusMessage || '',
          headers: responseHeaders,
        }));
      });
    });

    req.setTimeout(Math.min(options.totalTimeoutMs, 12000), () => req.destroy(new Error('Public Fediverse request timed out.')));
    req.on('error', error => finishReject(error instanceof Error ? error : new Error(String(error))));

    overallTimer = setTimeout(() => {
      req.destroy(new Error('Public Fediverse request exceeded the overall time limit.'));
    }, options.totalTimeoutMs);

    req.end();
  });
}
