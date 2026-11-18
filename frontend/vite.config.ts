// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  root: '.',
  // En build los chunks viven en /static/dist/: con '/static/' las precargas darían 404.
  base: command === 'build' ? '/static/dist/' : '/static/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Django recolecta frontend/static, así que el bundle va dentro.
    outDir: './static/dist',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: './src/app/main.tsx',
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
    // La plantilla (backend/templates/app.html) apunta a localhost:5173 fijo, asi
    // que si el puerto esta ocupado no sirve de nada arrancar en otro: los
    // assets darian 404 sin decir por que. Mejor fallar aqui y en voz alta.
    strictPort: true,
    cors: true,
  },
}));
