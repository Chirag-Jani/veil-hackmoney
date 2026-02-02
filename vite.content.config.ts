import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'global': 'globalThis',
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
      process: 'process/browser',
      crypto: 'crypto-browserify',
      stream: 'stream-browserify',
      events: 'events',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false, // Don't wipe the dist folder, as main build runs first
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/scripts/content.ts'),
      },
      output: {
        entryFileNames: 'content.js',
        format: 'iife', // Self-contained for content script
        extend: true,
      },
    },
  },
  publicDir: false, // Don't copy public assets again
});
