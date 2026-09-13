import { getDatabase } from '@netlify/database';
import { isIP } from 'node:net';
import { resolve4, resolve6 } from 'node:dns/promises';

const SESSION_COOKIE = 'dent_hand_mastodon_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const OAUTH_TTL_SECONDS = 600;

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
  await db.sql`
    CREATE TABLE IF NOT EXISTS dent_hand_mastodon_apps (
      instance_origin TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      secret_ciphertext TEXT NOT NULL,
      secret_iv TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL
    )
  `;
  await db.sql`
    CREATE TABLE IF NOT EXISTS dent_hand_mastodon_oauth (
      state TEXT PRIMARY KEY,
      instance_origin TEXT NOT NULL,
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

export async function assertPublicMastodonInstance(instanceOrigin: string): Promise<void> {
  const hostname = new URL(instanceOrigin).hostname;
  const results = await Promise.allSettled([resolve4(hostname), resolve6(hostname)]);
  const addresses = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!addresses.length) throw new Error('Could not resolve that server.');
  if (addresses.some(address => address.includes(':') ? ipv6IsPrivate(address) : ipv4IsPrivate(address))) {
    throw new Error('That server resolves to a private or reserved network address.');
  }
}

export async function mastodonFetch(instanceOrigin: string, path: string, init: RequestInit = {}): Promise<Response> {
  await assertPublicMastodonInstance(instanceOrigin);
  const url = new URL(path, instanceOrigin);
  if (url.origin !== instanceOrigin) throw new Error('Invalid Mastodon API path.');
  const response = await fetch(url, {
    ...init,
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
    headers: { Accept: 'application/json', ...(init.headers || {}) },
  });
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

export async function mastodonApp(instanceOrigin: string): Promise<{ clientId: string; clientSecret: string } | null> {
  await ensureTables();
  const db = getDatabase();
  const [row] = await db.sql`
    SELECT client_id, secret_ciphertext, secret_iv FROM dent_hand_mastodon_apps WHERE instance_origin = ${instanceOrigin}
  ` as Array<{ client_id: string; secret_ciphertext: string; secret_iv: string }>;
  if (!row) return null;
  try {
    return { clientId: row.client_id, clientSecret: await decryptSecret(row.secret_ciphertext, row.secret_iv) };
  } catch {
    return null;
  }
}

export async function saveMastodonApp(instanceOrigin: string, clientId: string, clientSecret: string): Promise<void> {
  await ensureTables();
  const encrypted = await encryptSecret(clientSecret);
  const db = getDatabase();
  await db.sql`
    INSERT INTO dent_hand_mastodon_apps (instance_origin, client_id, secret_ciphertext, secret_iv, created_at)
    VALUES (${instanceOrigin}, ${clientId}, ${encrypted.ciphertext}, ${encrypted.iv}, ${new Date().toISOString()})
    ON CONFLICT (instance_origin) DO UPDATE SET
      client_id = EXCLUDED.client_id,
      secret_ciphertext = EXCLUDED.secret_ciphertext,
      secret_iv = EXCLUDED.secret_iv,
      created_at = EXCLUDED.created_at
  `;
}

export async function createMastodonOAuthState(instanceOrigin: string): Promise<string> {
  await ensureTables();
  const state = randomId();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + OAUTH_TTL_SECONDS * 1000);
  const db = getDatabase();
  await db.sql`DELETE FROM dent_hand_mastodon_oauth WHERE expires_at <= ${createdAt.toISOString()}`;
  await db.sql`
    INSERT INTO dent_hand_mastodon_oauth (state, instance_origin, created_at, expires_at)
    VALUES (${state}, ${instanceOrigin}, ${createdAt.toISOString()}, ${expiresAt.toISOString()})
  `;
  return state;
}

export async function consumeMastodonOAuthState(state: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state)) return null;
  await ensureTables();
  const db = getDatabase();
  const [row] = await db.sql`
    SELECT instance_origin FROM dent_hand_mastodon_oauth
    WHERE state = ${state} AND expires_at > ${new Date().toISOString()}
  ` as Array<{ instance_origin: string }>;
  await db.sql`DELETE FROM dent_hand_mastodon_oauth WHERE state = ${state}`;
  return row?.instance_origin || null;
}
