import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken } from '../lib/api';

/**
 * WHAT THE PANEL HEARS WHILE IT IS OPEN (user, 2026-09-25, command center
 * phase 6): the menu badges — people on WhatsApp now, open alerts, payments
 * in progress — and a pop-up for each payment received, each alert raised,
 * and each recovery.
 *
 * One poller for the whole panel, living in this module rather than in a page:
 * every screen draws its own Shell, and a poller inside it would start again
 * on every click. Pop-ups continue from where the tab last looked, so a
 * refresh does not replay them.
 */

const BADGE_MS = 30 * 1000;
const FEED_MS = 10 * 1000;
const SINCE_KEY = 'gp.feed.since';

const state = { badges: null, toasts: [] };
const listeners = new Set();
const emit = () => listeners.forEach((f) => f({ ...state }));
let started = false;

function dismiss(id) {
  state.toasts = state.toasts.filter((t) => t.id !== id);
  emit();
}

function push(item) {
  if (state.toasts.some((t) => t.id === item.id)) return;
  state.toasts = [...state.toasts, item].slice(-5);
  emit();
  // Critical alerts stay longer; they are the ones that matter. A plain
  // confirmation goes in four seconds; an error, or one with an action, in eight.
  const ms = item.severity === 'critical' ? 20000 : item.kind === 'snack' ? (item.tone === 'wrong' || item.action ? 8000 : 4000) : 9000;
  setTimeout(() => dismiss(item.id), ms);
}

function start() {
  if (started) return;
  started = true;
  const since = () => { try { return sessionStorage.getItem(SINCE_KEY); } catch { return null; } };
  const keep = (v) => { try { sessionStorage.setItem(SINCE_KEY, v); } catch { /* private window */ } };
  if (!since()) keep(new Date().toISOString());

  const badges = async () => {
    if (!getToken() || document.hidden) return;
    try { state.badges = await api.badges(); emit(); } catch { /* next time */ }
  };
  const feed = async () => {
    if (!getToken() || document.hidden) return;
    try {
      const out = await api.feed(since());
      out.items.forEach(push);
      keep(out.at);
      if (out.items.some((i) => i.kind !== 'payment')) badges();
    } catch { /* next time */ }
  };
  badges(); feed();
  setInterval(badges, BADGE_MS);
  setInterval(feed, FEED_MS);
}

/**
 * A short confirmation — "Tag added", "Link copied" — in the same corner as
 * the pop-ups (Vehicles module). It goes by itself and a tap only dismisses it.
 */
export function snack(text, tone = 'good', { action } = {}) {
  push({ id: `snack-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind: 'snack', title: text, tone, action });
}

/** The badges and pop-ups, kept current. */
export function useLive() {
  const [s, setS] = useState({ ...state });
  useEffect(() => {
    start();
    listeners.add(setS);
    return () => listeners.delete(setS);
  }, []);
  return s;
}

const inr = (p) => `₹${(Number(p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const TONE = {
  good: 'border-good-500/40 bg-white', wrong: 'border-wrong-500/50 bg-wrong-50', watch: 'border-watch-500/50 bg-watch-50', info: 'border-brand/30 bg-white',
};
const DOT = { good: 'bg-good-500', wrong: 'bg-wrong-500', watch: 'bg-watch-500', info: 'bg-brand' };

/** The pop-ups, bottom right. A tap opens what it is about. */
export function Toasts() {
  const { toasts } = useLive();
  const navigate = useNavigate();
  if (!toasts.length) return null;
  return (
    <div className="no-print fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role={t.tone === 'wrong' ? 'alert' : undefined} className={`m-toast cursor-pointer rounded-lg border p-3 shadow-lg ${TONE[t.tone] || TONE.info}`}
          onClick={() => { dismiss(t.id); if (t.kind === 'snack') return; navigate(t.kind === 'payment' ? (t.mobile ? `/journey?mobile=${t.mobile}` : '/payments') : '/alerts'); }}>
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[t.tone] || DOT.info}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{t.title}</span>
                <button className="text-2xs text-muted hover:text-ink" aria-label="Dismiss"
                  onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}>✕</button>
              </div>
              {t.kind === 'payment' ? (
                <div className="mt-0.5 text-2xs text-body">
                  <span className="text-base font-bold text-ink">{inr(t.amount_paise)}</span>
                  {t.reg_no ? ` · ${t.reg_no}` : ''}{t.person ? ` · ${t.person}` : ''}
                  {t.source ? <div className="text-muted">Source: {String(t.source).replace(/_/g, ' ')}{t.method ? ` · ${t.method}` : ''}</div> : null}
                </div>
              ) : t.text ? <div className="mt-0.5 line-clamp-3 text-2xs text-body">{t.text}</div> : null}
              {t.action && (
                <button className="btn-quiet mt-1.5 !px-2.5 !py-1 text-2xs" onClick={(e) => { e.stopPropagation(); dismiss(t.id); t.action.fn(); }}>{t.action.label}</button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
