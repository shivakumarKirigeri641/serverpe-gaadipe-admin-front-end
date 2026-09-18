import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * The panel is served as static files and talks to the gateway over its own
 * origin (VITE_API_BASE), so there is no proxy here: development and production
 * then differ by one environment variable rather than by a code path that only
 * exists on a laptop.
 */
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { outDir: 'dist', sourcemap: false },
});
