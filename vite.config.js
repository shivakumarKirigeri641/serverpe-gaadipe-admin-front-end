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
  /* IN DEVELOPMENT THE API IS PROXIED (user, 2026-09-18). The page calls its own
     origin and Vite passes the call to the gateway, so the site works however it
     is opened — localhost, 127.0.0.1, a phone on the same Wi-Fi, a tunnel —
     without the gateway having to name each of those origins for CORS. A built
     site sets VITE_API_BASE and calls the gateway directly; this is dev only. */
  server: {
    port: 5173, strictPort: true, host: true,
    proxy: Object.fromEntries(["/admin/api"].map((p) => [p, { target: process.env.VITE_PROXY_TARGET || 'http://localhost:5007', changeOrigin: false }])),
  },
  preview: { port: 4173, strictPort: true },
  build: { outDir: 'dist', sourcemap: false },
});
