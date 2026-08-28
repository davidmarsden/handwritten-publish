import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as ts from 'typescript';

const sourcePath = new URL('../packages/publishing-core/microblog-client.ts', import.meta.url);
const targetDir = new URL('../public/shared/', import.meta.url);
const targetPath = new URL('../public/shared/microblog-client.js', import.meta.url);

const source = await readFile(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});

await mkdir(targetDir, { recursive: true });
await writeFile(targetPath, `// Generated from packages/publishing-core/microblog-client.ts. Do not edit directly.\n${outputText}`, 'utf8');
