import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        helpingHand: resolve(__dirname, 'index.html'),
        publishHand: resolve(__dirname, 'publish/index.html'),
      },
    },
  },
});
