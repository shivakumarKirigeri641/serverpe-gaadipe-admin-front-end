import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'vite-plugin-javascript-obfuscator';

/*
 * THE PRODUCTION BUILD IS OBFUSCATED (user, 2026-09-18). Our own code — not
 * React or the libraries — is turned into something very hard to read, so
 * following the page's decryption step in the browser's debugger takes hours
 * rather than minutes. Build only: development stays readable. No source maps
 * are published. Settings chosen to keep the site fast: no control-flow
 * flattening or dead-code injection, which slow a phone down for little gain.
 */
const obfuscate = obfuscator({
  apply: 'build',
  include: [/src\/.*\.(js|jsx)$/],
  exclude: [/node_modules/],
  options: {
    compact: true,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    stringArrayRotate: true,
    stringArrayShuffle: true,
    splitStrings: false,
    transformObjectKeys: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    selfDefending: false,
    debugProtection: false,
    unicodeEscapeSequence: false,
    sourceMap: false,
  },
});

/*
 * The panel is served as static files and talks to the gateway over its own
 * origin (VITE_API_BASE), so there is no proxy here: development and production
 * then differ by one environment variable rather than by a code path that only
 * exists on a laptop.
 */
export default defineConfig({
  plugins: [react(), obfuscate],
  /* IN DEVELOPMENT THE API IS PROXIED (user, 2026-09-18). The page calls its own
     origin and Vite passes the call to the gateway, so the site works however it
     is opened — localhost, 127.0.0.1, a phone on the same Wi-Fi, a tunnel —
     without the gateway having to name each of those origins for CORS. A built
     site sets VITE_API_BASE and calls the gateway directly; this is dev only. */
  server: {
    port: 5173, strictPort: true, host: true,
    proxy: Object.fromEntries(["/admin/api"].map((p) => [p, { target: process.env.VITE_PROXY_TARGET || 'http://localhost:5007', changeOrigin: false, xfwd: true }])),
  },
  preview: { port: 4173, strictPort: true },
  build: { outDir: 'dist', sourcemap: false },
});
