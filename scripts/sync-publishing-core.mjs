import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = new URL('../', import.meta.url);
const targetDir = new URL('../public/shared/', import.meta.url);
const tscPath = new URL('../node_modules/typescript/bin/tsc', import.meta.url);

await mkdir(targetDir, { recursive: true });

const result = spawnSync(process.execPath, [
  fileURLToPath(tscPath),
  'packages/publishing-core/microblog-client.ts',
  '--target', 'ES2022',
  '--module', 'ESNext',
  '--moduleResolution', 'Bundler',
  '--lib', 'ES2022,DOM',
  '--skipLibCheck',
  '--rootDir', 'packages/publishing-core',
  '--outDir', 'public/shared',
  '--declaration', 'false',
  '--sourceMap', 'false',
  '--pretty', 'false',
], {
  cwd: fileURLToPath(rootDir),
  stdio: 'inherit',
});

if (result.error) throw result.error;
if (result.status !== 0) {
  throw new Error(`publishing-core TypeScript sync failed with exit code ${result.status ?? 'unknown'}`);
}
