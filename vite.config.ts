/// <reference types="vitest/config" />
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';

const host = process.env.TAURI_DEV_HOST;
const ownClaudeDir = path.join(import.meta.dirname, '.claude').toLowerCase();
const inOwnClaudeDir = (file: string) => {
  const p = path.normalize(file).toLowerCase();
  return p === ownClaudeDir || p.startsWith(ownClaudeDir + path.sep);
};

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ['**/src-tauri/**', inOwnClaudeDir],
    },
  },
  test: {
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
}));
