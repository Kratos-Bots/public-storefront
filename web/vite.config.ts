import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { templatesCatalog } from './vite-plugins/templates-catalog.ts';
import { builderIsolation } from './vite-plugins/builder-isolation.ts';

export default defineConfig({
  plugins: [react(), templatesCatalog(), builderIsolation()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8787', changeOrigin: true },
      '/media': { target: 'http://localhost:8787', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
