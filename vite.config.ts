// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: './web',
  base: '/static/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './web/src'),
    },
  },
  build: {
    // Compilar dentro de web/static/dist para que collectstatic lo encuentre
    outDir: './static/dist',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: './web/src/app/main.tsx',
      output: {
        entryFileNames: 'assets/main.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/main.[ext]',
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    cors: true,
  },
});
