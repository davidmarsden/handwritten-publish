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
        drawingHand: resolve(rootDir, 'drawing/index.html'),
        drawingHandResult: resolve(rootDir, 'drawing/result/index.html'),
        social: resolve(rootDir, 'social/index.html'),
        socialMyPosts: resolve(rootDir, 'social/my-posts/index.html'),
      },
    },
  },
});
