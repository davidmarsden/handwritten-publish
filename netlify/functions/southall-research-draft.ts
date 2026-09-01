import { json } from './_shared/microblog';

function safeFilename(value: string): string | null {
  const name = value.trim();
  if (!name || name !== name.split('/').pop() || name.includes('\\') || name === '.' || name === '..') return null;
  if (!name.toLowerCase().endsWith('.md')) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,199}\.md$/i.test(name)) return null;
  return name;
}

function utf8Base64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function authorized(provided: string, expected: string): boolean {
  if (!provided || !expected || provided.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < provided.length; index += 1) mismatch |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  return mismatch === 0;
}

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const githubToken = Netlify.env.get('SOUTHALL_RESEARCH_GITHUB_TOKEN')?.trim() || '';
  const expectedWriteKey = Netlify.env.get('SOUTHALL_RESEARCH_WRITE_KEY') || '';
  if (!githubToken || !expectedWriteKey) {
    return json({ error: 'Private draft destination is not configured on this Helping Hand deployment.' }, 503);
  }

  const body = await request.json().catch(() => ({})) as {
    writeKey?: string;
    filename?: string;
    markdown?: string;
  };
  const writeKey = body.writeKey || '';
  const filename = safeFilename(body.filename || '');
  const markdown = body.markdown ?? '';

  if (!authorized(writeKey, expectedWriteKey)) return json({ error: 'Private draft write key is not valid.' }, 401);
  if (!filename) return json({ error: 'Choose a Markdown file with a safe .md filename.' }, 400);
  if (!markdown.trim()) return json({ error: 'Choose a non-empty Markdown file.' }, 400);
  if (Buffer.byteLength(markdown, 'utf8') > 1_000_000) return json({ error: 'Private drafts accept Markdown files up to 1 MB.' }, 413);

  const repository = 'davidmarsden/Southall-Research';
  const path = `drafts/${filename}`;
  const apiUrl = `https://api.github.com/repos/${repository}/contents/${encodeURIComponent('drafts')}/${encodeURIComponent(filename)}`;
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'Helping-Hand-Southall-Research',
  };

  let existingSha: string | undefined;
  try {
    const existingUrl = new URL(apiUrl);
    existingUrl.searchParams.set('ref', 'main');
    const existingResponse = await fetch(existingUrl, { headers });
    if (existingResponse.ok) {
      const existing = await existingResponse.json() as { sha?: string };
      existingSha = existing.sha;
    } else if (existingResponse.status !== 404) {
      return json({ error: `GitHub could not inspect the existing private draft (HTTP ${existingResponse.status}).` }, 502);
    }
  } catch {
    return json({ error: 'Helping Hand could not reach GitHub to inspect the private draft.' }, 502);
  }

  const commitBody = {
    message: existingSha ? `Update draft: ${filename}` : `Add draft: ${filename}`,
    content: utf8Base64(markdown),
    branch: 'main',
    ...(existingSha ? { sha: existingSha } : {}),
  };

  let writeResponse: Response;
  try {
    writeResponse = await fetch(apiUrl, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(commitBody),
    });
  } catch {
    return json({ error: 'Helping Hand could not reach GitHub to save the private draft.' }, 502);
  }

  if (!writeResponse.ok) {
    return json({ error: `GitHub could not save the private draft (HTTP ${writeResponse.status}).` }, writeResponse.status === 409 ? 409 : 502);
  }

  const result = await writeResponse.json().catch(() => null) as {
    content?: { html_url?: string; path?: string; sha?: string };
    commit?: { html_url?: string; sha?: string };
  } | null;

  return json({
    saved: true,
    updated: Boolean(existingSha),
    path: result?.content?.path || path,
    url: result?.content?.html_url || `https://github.com/${repository}/blob/main/${path}`,
    commitUrl: result?.commit?.html_url || null,
    commitSha: result?.commit?.sha || null,
    contentSha: result?.content?.sha || null,
    originalLength: markdown.length,
  });
};

export const config = {
  path: '/api/southall-research/draft',
  rateLimit: {
    windowLimit: 12,
    windowSize: 60,
    aggregateBy: ['ip', 'domain'],
  },
};
