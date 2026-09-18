/*
 * secure.js — every API call from this page, encrypted (user, 2026-09-18).
 *
 * The Network tab shows a handshake (two public keys) and then only
 * `POST …/_x` with ciphertext both ways. The real method, path, query and body
 * are inside the envelope; so is every answer.
 *
 * The key is agreed per visit (ECDH P-256 → HKDF-SHA-256 → AES-256-GCM) and
 * never sent. It lives in memory only: a reload agrees a new one. The server's
 * side is src/security/tunnel.js in the back end; the two must match exactly.
 *
 * Web Crypto only exists on HTTPS or localhost. Where it is missing (a phone on
 * plain http in development) `available()` is false and the caller sends plain
 * JSON — the server accepts that only when encryption is not required.
 */
const enc = new TextEncoder();
const dec = new TextDecoder();
const INFO = enc.encode('gaadipe/tunnel/v1');

const b64 = (bytes) => { let s = ''; const a = new Uint8Array(bytes); for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const concat = (a, b) => { const out = new Uint8Array(a.length + b.length); out.set(a); out.set(b, a.length); return out; };
const nonce = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, '0')).join('');

/* A random id this browser keeps: the server binds each key to it (and to the
   user agent), so a key copied elsewhere is refused. */
let memId = null;
function deviceKey() {
  try {
    let id = localStorage.getItem('gaadipe.dev');
    if (!id) { id = nonce() + nonce(); localStorage.setItem('gaadipe.dev', id); }
    return id;
  } catch { memId = memId || nonce() + nonce(); return memId; }
}

export const available = () => Boolean(globalThis.crypto && globalThis.crypto.subtle && window.isSecureContext);

const sessions = new Map();     // base -> Promise<{ k, key, offset }>

async function handshake(base) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const res = await fetch(`${base}/_hs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-GP-D': deviceKey() }, body: JSON.stringify({ pub: b64(pub) }),
  });
  if (!res.ok) throw new Error(`handshake ${res.status}`);
  const { k, pub: serverB64, now, ttl } = await res.json();
  const serverRaw = unb64(serverB64);
  const serverPub = await crypto.subtle.importKey('raw', serverRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: serverPub }, pair.privateKey, 256);
  const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: concat(pub, serverRaw), info: INFO },
    hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  // Renewed a minute before the server would refuse it.
  return { k, key, offset: Number(now) ? Number(now) - Date.now() : 0, renewAt: Date.now() + Math.max(60000, (Number(ttl) || 1800000) - 60000), auth: undefined };
}

function session(base, fresh = false) {
  if (fresh || !sessions.has(base)) {
    const p = handshake(base);
    p.catch(() => sessions.delete(base));
    sessions.set(base, p);
  }
  return sessions.get(base);
}

async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  return b64(concat(iv, ct));
}
async function open(key, text) {
  const raw = unb64(text);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, key, raw.slice(12));
  return JSON.parse(dec.decode(plain));
}

/**
 * One call through the tunnel. Returns { status, data } like a fetch you have
 * already read, so the caller keeps its own status handling.
 */
export async function secureCall(base, { method = 'GET', path, body, headers = {}, timeoutMs = 45000 }) {
  const [p, qs] = String(path).split('?');
  const query = qs ? Object.fromEntries(new URLSearchParams(qs)) : undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    let s = await session(base, attempt > 0);
    /* A key serves one signed-in session: signing in or out agrees a new one,
       and a key near its end of life is renewed before it is refused. */
    const auth = headers.Authorization || null;
    if (Date.now() > s.renewAt || (s.auth !== undefined && s.auth !== auth)) s = await session(base, true);
    s.auth = auth;
    const d = await seal(s.key, { m: method, p, q: query, b: body, t: Date.now() + s.offset, n: nonce() });
    const res = await fetch(`${base}/_x`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Accept: 'application/json', 'X-GP-K': s.k, 'X-GP-D': deviceKey() },
      body: JSON.stringify({ d }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const raw = await res.json().catch(() => ({}));
    if (raw && typeof raw.d === 'string') return { status: res.status, ok: res.ok, data: await open(s.key, raw.d) };
    // A plain answer from the tunnel itself: the key expired or the server
    // restarted — agree a new one and try once more.
    if (raw?.error === 'rekey' && attempt === 0) continue;
    return { status: res.status, ok: res.ok, data: raw };
  }
  return { status: 400, ok: false, data: { error: 'rekey', message: 'Please reload the page.' } };
}
