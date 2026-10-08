import { cp, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';

// Ship the entire ESM trees: the FFmpeg worker imports sibling modules.
// Never load executable FFmpeg code from third-party CDNs at runtime.
const packages = [
  ['@ffmpeg/ffmpeg', 'ffmpeg', 'dist/esm'],
  ['@ffmpeg/util', 'util', 'dist/esm'],
  ['@ffmpeg/core', 'core', 'dist/esm'],
];
const target = 'public/bum/vendor';
await mkdir(target, { recursive: true });
for (const [name, destination, subdir] of packages) {
  const source = join('node_modules', name, subdir);
  await access(source);
  await cp(source, join(target, destination), { recursive: true, force: true });
  console.log('Staged ' + name + ' for same-origin BUM audio processing');
}
