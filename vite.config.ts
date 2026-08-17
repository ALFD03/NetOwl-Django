import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: './frontend',
  base: '/static/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend/src'),
    },
  },
  build: {
    outDir: '../staticfiles/dist',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: './frontend/src/main.tsx',
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    cors: true,
  },
});