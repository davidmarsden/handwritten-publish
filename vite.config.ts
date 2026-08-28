import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        helpingHand: resolve(rootDir, 'index.html'),
        publishHand: resolve(rootDir, 'publish/index.html'),
      },
    },
  },
});
