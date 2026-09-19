/**
 * api.js — every call the panel makes.
 *
 * The token is the session: kept so a reload does not sign somebody out
 * mid-task, sent on every request, and cleared the moment the gateway says the
 * session has ended — once, centrally, so no screen has to handle it.
 *
 * Grows one function at a time, beside the screen that uses it.
 */

import { available as secureAvailable, secureCall } from './secure';

const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const P = `${BASE}/admin/api`;
const KEY = 'gaadipe.admin.token';

export const getToken = () => { try { return localStorage.getItem(KEY) || null; } catch { return null; } };
export const setToken = (t) => {
  try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private mode */ }
};

const listeners = new Set();
export const onSignedOut = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const signedOut = () => { setToken(null); listeners.forEach((fn) => fn()); };

/*
 * HOW MANY QUESTIONS ARE STILL UNANSWERED.
 *
 * Counted here rather than screen by screen, so the thread across the top is
 * telling the truth about the whole panel. Screens that already have content on
 * them are the reason it exists: a table redrawing with new figures looks
 * identical to a table that has stopped working.
 *
 * The live screen's own polling passes `quiet`, or the bar would flicker every
 * few seconds all day and stop meaning anything.
 */
let busy = 0;
let background = 0;
/** Run fn with every call it makes kept off the loading bar (auto-refresh). */
export async function quietly(fn) {
  background += 1;
  try { return await fn(); } finally { background -= 1; }
}
const busyWatchers = new Set();
export const onBusyChange = (fn) => { busyWatchers.add(fn); fn(busy); return () => busyWatchers.delete(fn); };
const setBusy = (d) => { busy = Math.max(0, busy + d); busyWatchers.forEach((fn) => fn(busy)); };

export class ApiError extends Error {
  constructor(message, { code = 'error', status = 0, body = null } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.body = body;
    this.offline = code === 'offline';
  }
}

async function call(path, { method = 'GET', body, auth = true, timeoutMs = 25000, quiet = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  let res; let data;
  const silent = quiet || background > 0;
  // Background refreshes say so, and the server does not audit them again.
  if (background > 0) headers['X-Refresh'] = '1';
  if (!silent) setBusy(1);
  try {
    /* Encrypted end to end (lib/secure.js): the Network tab shows ciphertext only. */
    if (secureAvailable()) {
      const outer = {};
      if (headers.Authorization) outer.Authorization = headers.Authorization;
      if (headers['X-Refresh']) outer['X-Refresh'] = headers['X-Refresh'];
      const out = await secureCall(P, { method, path, body, headers: outer, timeoutMs });
      res = { status: out.status, ok: out.ok };
      data = out.data || {};
    } else {
      res = await fetch(`${P}${path}`, {
        method, headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    }
  } catch (e) {
    throw new ApiError(
      e.name === 'TimeoutError' ? 'The server is taking too long to answer.' : 'Cannot reach the server.',
      { code: 'offline' });
  } finally {
    if (!silent) setBusy(-1);
  }

  if (data === undefined) data = await res.json().catch(() => ({}));

  if (res.status === 401 && auth) {
    signedOut();
    throw new ApiError(data.message || 'Your session has ended. Please sign in again.',
      { code: 'signed_out', status: 401 });
  }
  if (!res.ok) {
    throw new ApiError(data.message || 'Something went wrong.',
      { code: data.error || 'error', status: res.status, body: data });
  }
  return data;
}

/**
 * A PDF from the API, fetched with the session token rather than opened as a
 * plain link — a link cannot carry the Authorization header, and a token in a
 * URL would be left in browser history and server logs.
 */
async function pdf(path) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${P}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new ApiError('Cannot reach the server.', { code: 'offline' });
  }
  if (res.status === 401) {
    signedOut();
    throw new ApiError('Your session has ended. Please sign in again.', { code: 'signed_out', status: 401 });
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.message || 'That file is not available.', { status: res.status });
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const filename = (/filename="([^"]+)"/.exec(disposition) || [])[1] || 'document.pdf';
  return { blob: await res.blob(), filename };
}

const qs = (params = {}) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();
  return s ? `?${s}` : '';
};

export const api = {
  /* Sign-in is by a code sent to the admin's own number. The answer to "send me
     a code" is the same whether or not the number belongs to an admin. */
  requestCode: (mobile) => call('/session/otp', { method: 'POST', auth: false, body: { mobile } }),
  // A wrong passcode, or too many, is an answer to show, not a failure.
  signInWithPasscode: (passcode) =>
    call('/session/passcode', { method: 'POST', auth: false, body: { passcode } })
      .catch((e) => { if (e.body && (e.status === 401 || e.status === 429)) return e.body; throw e; }),
  verifyCode: (mobile, code) =>
    call('/session/verify', { method: 'POST', auth: false, body: { mobile, code } })
      .catch((e) => {
        /* A wrong code is an answer the screen shows, not a failure it has to
           apologise for. */
        if (e.body && e.status === 401) return e.body;
        throw e;
      }),
  session: () => call('/session'),
  signOut: () => call('/session', { method: 'DELETE' }),

  dashboard: () => call('/dashboard'),
  health: () => call('/health'),
  series: (params) => call(`/series${qs(params)}`),
  funnel: (params) => call(`/funnel${qs(params)}`),
  compare: () => call('/insights/compare'),
  fleet: () => call('/insights/fleet', { timeoutMs: 60000 }),
  heatmap: (params) => call(`/insights/heatmap${qs(params)}`),
  finance: (params) => call(`/finance${qs(params)}`),

  customers: (params) => call(`/customers${qs(params)}`),
  customer: (id) => call(`/customers/${id}`),
  pauseCustomer: (id, paused) => call(`/customers/${id}/pause`, { method: 'POST', body: { paused } }),

  conversations: (params) => call(`/live/conversations${qs(params)}`),
  thread: (mobile) => call(`/live/thread/${mobile}`),
  pulse: (since) => call(`/live/pulse${qs({ since })}`, { quiet: true }),
  activity: (params) => call(`/live/activity${qs(params)}`),

  vehicles: (params) => call(`/vehicles${qs(params)}`),
  vehicle: (regNo) => call(`/vehicles/${encodeURIComponent(regNo)}`),
  check: (regNo, params) => call(`/check/${encodeURIComponent(regNo)}${qs(params)}`, { timeoutMs: 60000 }),

  blocks: (params) => call(`/blocks${qs(params)}`),
  block: (kind, value, reason) => call('/blocks', { method: 'POST', body: { kind, value, reason } }),
  release: (id) => call(`/blocks/${id}/release`, { method: 'POST' }),

  reports: (params) => call(`/reports${qs(params)}`),
  invoices: (params) => call(`/invoices${qs(params)}`),
  reportPdf: (id, download) => pdf(`/reports/${id}/file${download ? '?download=1' : ''}`),
  invoicePdf: (id, download) => pdf(`/invoices/${id}/file${download ? '?download=1' : ''}`),

  settings: () => call('/settings'),
  saveSettings: (settings) => call('/settings', { method: 'PUT', body: { settings } }),
  savePlan: (code, plan) => call(`/plans/${code}`, { method: 'PUT', body: plan }),

  policy: (slug) => call(`/policies/${slug}`),
  savePolicy: (slug, id, clause) => call(`/policies/${slug}/${id}`, { method: 'PUT', body: clause }),
  addPolicy: (slug, clause) => call(`/policies/${slug}`, { method: 'POST', body: clause }),

  feedback: (params) => call(`/feedback${qs(params)}`),
  audit: (params) => call(`/audit${qs(params)}`),
  signIns: (params) => call(`/sign-ins${qs(params)}`),
  sessions: (params) => call(`/sessions${qs(params)}`),
  securityEvents: (params) => call(`/security-events${qs(params)}`),
  contactMessages: (params) => call(`/contact-messages${qs(params)}`),
  setContactStatus: (id, status) => call(`/contact-messages/${id}`, { method: 'PUT', body: { status } }),
  notifications: (params) => call(`/notifications${qs(params)}`),
  cleanPreview: () => call('/maintenance/preview'),
  cleanDb: () => call('/maintenance/clean', { method: 'POST', body: { confirm: 'CLEAN' }, timeoutMs: 60000 }),
  /* A file, fetched like the PDFs: outside the encrypted envelope, with the session token. */
  backupDb: () => pdf('/maintenance/backup?confirm=DOWNLOAD'),
  admins: () => call('/admins'),
  addAdmin: (body) => call('/admins', { method: 'POST', body }),
  setAdminActive: (id, active) => call(`/admins/${id}/active`, { method: 'POST', body: { active } }),
};
