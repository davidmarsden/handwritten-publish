import { getDatabase } from '@netlify/database';
import { isIP } from 'node:net';
import { resolve4, resolve6 } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';

const SESSION_COOKIE = 'dent_hand_mastodon_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_TTL_SECONDS = 600;

type PinnedAddress = { address: string; family: 4 | 6 };

function env(name: string): string {
  const netlifyEnv = (globalThis as typeof globalThis & {
    Netlify?: { env?: { get?: (key: string) => string | undefined } };
  }).Netlify?.env?.get?.(name);
  return (netlifyEnv ?? process.env[name] ?? '').trim();
}

function base64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function randomId(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = env('DENT_HAND_SESSION_SECRET');
  if (secret.length < 32) throw new Error('DENT_HAND_SESSION_SECRET must be at least 32 characters.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptSecret(value: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(value));
  return { ciphertext: base64Url(new Uint8Array(encrypted)), iv: base64Url(iv) };
}

async function decryptSecret(ciphertext: string, iv: string): Promise<string> {
  const key = await encryptionKey();
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, key, fromBase64Url(ciphertext));
  return new TextDecoder().decode(decrypted);
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

function validSessionId(request: Request): string | null {
  const sessionId = cookieValue(request, SESSION_COOKIE);
  return sessionId && /^[A-Za-z0-9_-]{32,128}$/.test(sessionId) ? sessionId : null;
}

async function ensureTables(): Promise<void> {
  const db = getDatabase();
  await db.sql`
    CREATE TABLE IF NOT EXISTS dent_hand_mastodon_sessions (
      session_id TEXT PRIMARY KEY,
      instance_origin TEXT NOT NULL,
      token_ciphertext TEXT NOT NULL,
      token_iv TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
  // v2 keys app registrations by both remote instance and Dent Hand origin.
  // The same database can serve custom domains, netlify.app and deploy previews,
  // each of which has a distinct registered OAuth redirect URI.
  await db.sql`
    CREATE TABLE IF NOT EXISTS dent_hand_mastodon_apps_v2 (
      instance_origin TEXT NOT NULL,
      redirect_origin TEXT NOT NULL,
      client_id TEXT NOT NULL,
      secret_ciphertext TEXT NOT NULL,
      secret_iv TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (instance_origin, redirect_origin)
    )
  `;
  await db.sql`
    CREATE TABLE IF NOT EXISTS dent_hand_mastodon_oauth_v2 (
      state TEXT PRIMARY KEY,
      instance_origin TEXT NOT NULL,
      redirect_origin TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
}

function ipv4IsPrivate(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224;
}

function ipv6IsPrivate(address: string): boolean {
  const value = address.toLowerCase();
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? ipv4IsPrivate(mapped[1]) : false;
}

export function normalizeMastodonInstance(value: string): string {
  const raw = value.trim();
  if (!raw) throw new Error('Enter your Mastodon or Fediverse server.');
  const candidate = raw.includes('://') ? raw : `https://${raw}`;
  const url = new URL(candidate);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Enter a public HTTPS server name, for example mastodon.social.');
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname || isIP(hostname) || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('That server address is not allowed.');
  }
  return `https://${hostname}`;
}

export async function resolvePublicMastodonInstance(instanceOrigin: string): Promise<PinnedAddress> {
  const hostname = new URL(instanceOrigin).hostname;
  const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const addresses: PinnedAddress[] = [];
  if (results[0].status === 'fulfilled') addresses.push(...results[0].value.map(address => ({ address, family: 4 as const })));
  if (results[1].status === 'fulfilled') addresses.push(...results[1].value.map(address => ({ address, family: 6 as const })));
  if (!addresses.length) throw new Error('Could not resolve that server.');
  if (addresses.some(({ address, family }) => family === 6 ? ipv6IsPrivate(address) : ipv4IsPrivate(address))) {
    throw new Error('That server resolves to a private or reserved network address.');
  }
  return addresses[0];
}

function pinnedHttpsFetch(url: URL, pinned: PinnedAddress, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const headers = new Headers(init.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (!headers.has('Host')) headers.set('Host', url.host);

    const req = httpsRequest({
      protocol: 'https:',
      // Connect directly to the address that passed validation. This avoids a
      // second DNS lookup entirely, while servername + Host preserve TLS SNI
      // and virtual-host routing for the original Mastodon hostname.
      hostname: pinned.address,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: init.method || 'GET',
      headers: Object.fromEntries(headers.entries()),
      servername: url.hostname,
    }, response => {
      const chunks: Uint8Array[] = [];
      response.on('data', chunk => chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk));
      response.on('end', () => {
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

    req.setTimeout(12000, () => req.destroy(new Error('Mastodon request timed out.')));
    req.on('error', reject);

    const body = init.body;
    if (body !== undefined && body !== null) {
      if (typeof body === 'string') req.write(body);
      else if (body instanceof URLSearchParams) req.write(body.toString());
      else if (body instanceof ArrayBuffer) req.write(Buffer.from(body));
      else if (ArrayBuffer.isView(body)) req.write(Buffer.from(body.buffer, body.byteOffset, body.byteLength));
      else {
        req.destroy();
        reject(new Error('Unsupported Mastodon request body.'));
        return;
      }
    }
    req.end();
  });
}

export async function mastodonFetch(instanceOrigin: string, path: string, init: RequestInit = {}): Promise<Response> {
  const pinned = await resolvePublicMastodonInstance(instanceOrigin);
  const url = new URL(path, instanceOrigin);
  if (url.origin !== instanceOrigin) throw new Error('Invalid Mastodon API path.');

  // Pin the connection to the address that passed our public-network validation.
  // Keeping the original Host header and TLS servername preserves virtual hosting
  // while preventing DNS rebinding between validation and the outbound request.
  const response = await pinnedHttpsFetch(url, pinned, init);
  if (response.status >= 300 && response.status < 400) throw new Error('Mastodon API redirects are not followed.');
  return response;
}

export function mastodonSessionCookie(sessionId: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearMastodonSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function createMastodonSession(instanceOrigin: string, token: string): Promise<string> {
  await ensureTables();
  const sessionId = randomId();
  const encrypted = await encryptSecret(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_SECONDS * 1000);
  const db = getDatabase();
  await db.sql`DELETE FROM dent_hand_mastodon_sessions WHERE expires_at <= ${createdAt.toISOString()}`;
  await db.sql`
    INSERT INTO dent_hand_mastodon_sessions (session_id, instance_origin, token_ciphertext, token_iv, created_at, expires_at)
    VALUES (${sessionId}, ${instanceOrigin}, ${encrypted.ciphertext}, ${encrypted.iv}, ${createdAt.toISOString()}, ${expiresAt.toISOString()})
  `;
  return sessionId;
}

export async function mastodonSession(request: Request): Promise<{ instanceOrigin: string; token: string } | null> {
  const sessionId = validSessionId(request);
  if (!sessionId) return null;
  await ensureTables();
  const db = getDatabase();
  const [row] = await db.sql`
    SELECT instance_origin, token_ciphertext, token_iv
    FROM dent_hand_mastodon_sessions
    WHERE session_id = ${sessionId} AND expires_at > ${new Date().toISOString()}
  ` as Array<{ instance_origin: string; token_ciphertext: string; token_iv: string }>;
  if (!row) return null;
  try {
    return { instanceOrigin: row.instance_origin, token: await decryptSecret(row.token_ciphertext, row.token_iv) };
  } catch {
    return null;
  }
}

export async function deleteMastodonSession(request: Request): Promise<void> {
  const sessionId = validSessionId(request);
  if (!sessionId) return;
  await ensureTables();
  const db = getDatabase();
  await db.sql`DELETE FROM dent_hand_mastodon_sessions WHERE session_id = ${sessionId}`;
}

export async function mastodonApp(instanceOrigin: string, redirectOrigin: string): Promise<{ clientId: string; clientSecret: string } | null> {
  await ensureTables();
  const db = getDatabase();
  const [row] = await db.sql`
    SELECT client_id, secret_ciphertext, secret_iv
    FROM dent_hand_mastodon_apps_v2
    WHERE instance_origin = ${instanceOrigin} AND redirect_origin = ${redirectOrigin}
  ` as Array<{ client_id: string; secret_ciphertext: string; secret_iv: string }>;
  if (!row) return null;
  try {
    return { clientId: row.client_id, clientSecret: await decryptSecret(row.secret_ciphertext, row.secret_iv) };
  } catch {
    return null;
  }
}

export async function saveMastodonApp(instanceOrigin: string, redirectOrigin: string, clientId: string, clientSecret: string): Promise<void> {
  await ensureTables();
  const encrypted = await encryptSecret(clientSecret);
  const db = getDatabase();
  await db.sql`
    INSERT INTO dent_hand_mastodon_apps_v2 (instance_origin, redirect_origin, client_id, secret_ciphertext, secret_iv, created_at)
    VALUES (${instanceOrigin}, ${redirectOrigin}, ${clientId}, ${encrypted.ciphertext}, ${encrypted.iv}, ${new Date().toISOString()})
    ON CONFLICT (instance_origin, redirect_origin) DO UPDATE SET
      client_id = EXCLUDED.client_id,
      secret_ciphertext = EXCLUDED.secret_ciphertext,
      secret_iv = EXCLUDED.secret_iv,
      created_at = EXCLUDED.created_at
  `;
}

export async function createMastodonOAuthState(instanceOrigin: string, redirectOrigin: string): Promise<string> {
  await ensureTables();
  const state = randomId();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + OAUTH_TTL_SECONDS * 1000);
  const db = getDatabase();
  await db.sql`DELETE FROM dent_hand_mastodon_oauth_v2 WHERE expires_at <= ${createdAt.toISOString()}`;
  await db.sql`
    INSERT INTO dent_hand_mastodon_oauth_v2 (state, instance_origin, redirect_origin, created_at, expires_at)
    VALUES (${state}, ${instanceOrigin}, ${redirectOrigin}, ${createdAt.toISOString()}, ${expiresAt.toISOString()})
  `;
  return state;
}

export async function consumeMastodonOAuthState(state: string): Promise<{ instanceOrigin: string; redirectOrigin: string } | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) return null;
  await ensureTables();
  const db = getDatabase();
  const [row] = await db.sql`
    SELECT instance_origin, redirect_origin FROM dent_hand_mastodon_oauth_v2
    WHERE state = ${state} AND expires_at > ${new Date().toISOString()}
  ` as Array<{ instance_origin: string; redirect_origin: string }>;
  await db.sql`DELETE FROM dent_hand_mastodon_oauth_v2 WHERE state = ${state}`;
  return row ? { instanceOrigin: row.instance_origin, redirectOrigin: row.redirect_origin } : null;
}
