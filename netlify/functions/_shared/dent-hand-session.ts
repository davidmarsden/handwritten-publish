import { getDatabase } from '@netlify/database';

const SESSION_COOKIE = 'dent_hand_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function env(name: string): string {
  const netlifyEnv = (globalThis as typeof globalThis & {
    Netlify?: { env?: { get?: (key: string) => string | undefined } };
  }).Netlify?.env?.get?.(name);
  return (netlifyEnv ?? process.env[name] ?? '').trim();
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get('cookie') || '';
  for (const part of cookie.split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=');
    if (rawName === name) return decodeURIComponent(rawValue.join('='));
  }
  return null;
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

async function encryptionKey(): Promise<CryptoKey> {
  const secret = env('DENT_HAND_SESSION_SECRET');
  if (secret.length < 32) throw new Error('DENT_HAND_SESSION_SECRET must be at least 32 characters.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptToken(token: string): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  return { ciphertext: base64Url(new Uint8Array(encrypted)), iv: base64Url(iv) };
}

async function decryptToken(ciphertext: string, iv: string): Promise<string> {
  const key = await encryptionKey();
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(iv) }, key, fromBase64Url(ciphertext));
  return new TextDecoder().decode(decrypted);
}

async function ensureTable(): Promise<void> {
  const db = getDatabase();
  await db.sql`
    CREATE TABLE IF NOT EXISTS dent_hand_sessions (
      session_id TEXT PRIMARY KEY,
      token_ciphertext TEXT NOT NULL,
      token_iv TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL
    )
  `;
}

function randomId(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function sessionCookie(sessionId: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(request: Request): string {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function createDentHandSession(token: string): Promise<string> {
  await ensureTable();
  const sessionId = randomId();
  const encrypted = await encryptToken(token);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_SECONDS * 1000);
  const db = getDatabase();
  await db.sql`DELETE FROM dent_hand_sessions WHERE expires_at <= ${createdAt.toISOString()}`;
  await db.sql`
    INSERT INTO dent_hand_sessions (session_id, token_ciphertext, token_iv, created_at, expires_at)
    VALUES (${sessionId}, ${encrypted.ciphertext}, ${encrypted.iv}, ${createdAt.toISOString()}, ${expiresAt.toISOString()})
  `;
  return sessionId;
}

export async function dentHandSessionToken(request: Request): Promise<string | null> {
  const sessionId = cookieValue(request, SESSION_COOKIE);
  if (!sessionId || !/^[A-Za-z0-9_-]{32,128}$/.test(sessionId)) return null;
  await ensureTable();
  const db = getDatabase();
  const [row] = await db.sql`
    SELECT token_ciphertext, token_iv
    FROM dent_hand_sessions
    WHERE session_id = ${sessionId} AND expires_at > ${new Date().toISOString()}
  ` as Array<{ token_ciphertext: string; token_iv: string }>;
  if (!row) return null;
  try {
    return await decryptToken(row.token_ciphertext, row.token_iv);
  } catch {
    return null;
  }
}

export async function deleteDentHandSession(request: Request): Promise<void> {
  const sessionId = cookieValue(request, SESSION_COOKIE);
  if (!sessionId || !/^[A-Za-z0-9_-]{32,128}$/.test(sessionId)) return;
  await ensureTable();
  const db = getDatabase();
  await db.sql`DELETE FROM dent_hand_sessions WHERE session_id = ${sessionId}`;
}
