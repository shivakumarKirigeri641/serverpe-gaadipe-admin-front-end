import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getToken } from '../lib/api';
import { chime } from '../lib/sound';

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

const state = { badges: null, toasts: [], party: 0, milestone: null };

/* Milestones already celebrated in this browser, so each one plays once
   (user, 2026-09-30). The server keeps returning a recent one for three days. */
const SEEN_KEY = 'gp.milestones.seen';
const seenMilestones = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; } };
const markSeen = (id) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seenMilestones(), id].slice(-50))); } catch { /* private window */ } };

/** The whole-page celebration — from a milestone, or the preview button. */
export function celebrate(customers) {
  state.milestone = { customers, big: customers % 1000 === 0, at: Date.now() };
  chime({ kind: 'milestone' });
  emit();
}
export function endCelebration() { state.milestone = null; emit(); }

/* "Said hi" and "vehicle checked" pop-ups (user, 2026-09-29) can be muted from
   the pop-up itself; payments and alerts always show. Per browser. */
const QUIET_KEY = 'gp.pop.activity.off';
const activityOn = () => { try { return localStorage.getItem(QUIET_KEY) !== '1'; } catch { return true; } };
export function setActivityPopups(on) { try { localStorage.setItem(QUIET_KEY, on ? '0' : '1'); } catch { /* private window */ } }
const listeners = new Set();
const emit = () => listeners.forEach((f) => f({ ...state }));
let started = false;

function dismiss(id) {
  state.toasts = state.toasts.filter((t) => t.id !== id);
  emit();
}

function push(item) {
  if (item.kind === 'milestone') {
    if (seenMilestones().includes(item.id)) return;
    markSeen(item.id);
    celebrate(item.customers);
    return;
  }
  if (state.toasts.some((t) => t.id === item.id)) return;
  if ((item.kind === 'hi' || item.kind === 'check') && !activityOn()) return;
  state.toasts = [...state.toasts, item].slice(-5);
  // A payment gets a celebration, once per payment (user, 2026-09-29).
  if (item.kind === 'payment') state.party = Date.now();
  chime(item);
  emit();
  // Critical alerts stay longer; they are the ones that matter. A plain
  // confirmation goes in four seconds; an error, or one with an action, in eight.
  // Shorter (user, 2026-09-29): hi and checks go in three, payments and
  // alerts in five; a critical alert still waits ten, to be seen.
  const ms = item.severity === 'critical' ? 10000
    : item.kind === 'hi' || item.kind === 'check' ? 3000
    : item.kind === 'snack' ? (item.tone === 'wrong' || item.action ? 6000 : 3000) : 5000;
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
      if (out.items.some((i) => i.kind !== 'payment' && i.kind !== 'milestone')) badges();
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

/*
 * THE CELEBRATION (user, 2026-09-29): a short confetti burst over the page when
 * a payment arrives. Pure CSS, gone in two seconds, clicks pass through it.
 * Skipped when the admin's Motion preference is reduced or minimal, or the
 * device asks for reduced motion — the payment pop-up still shows.
 */
const COLORS = ['#0f766e', '#14918a', '#12a150', '#e08700', '#f5c542', '#d92d20', '#3b82f6'];
function Confetti({ at }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!at) return undefined;
    const m = document.documentElement.getAttribute('data-motion');
    const reduced = m === 'reduced' || m === 'minimal' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return undefined;
    setShow(true);
    const t = setTimeout(() => setShow(false), 2600);
    return () => clearTimeout(t);
  }, [at]);
  if (!show) return null;
  const bits = Array.from({ length: 70 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.5, dur: 1.6 + Math.random() * 0.9,
    size: 6 + Math.random() * 6, color: COLORS[i % COLORS.length], spin: Math.random() * 720 - 360,
    drift: Math.random() * 160 - 80, round: i % 3 === 0,
  }));
  return (
    <div className="no-print pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      <style>{`@keyframes gp-fall { 0% { transform: translate3d(0,-10vh,0) rotate(0); opacity: 1; }
        100% { transform: translate3d(var(--drift),105vh,0) rotate(var(--spin)); opacity: .9; } }`}</style>
      {bits.map((b, i) => (
        <span key={i} style={{
          position: 'absolute', top: 0, left: `${b.left}%`, width: b.size, height: b.round ? b.size : b.size * 0.45,
          background: b.color, borderRadius: b.round ? '50%' : 2,
          animation: `gp-fall ${b.dur}s cubic-bezier(.2,.6,.4,1) ${b.delay}s forwards`,
          '--drift': `${b.drift}px`, '--spin': `${b.spin}deg`,
        }} />
      ))}
    </div>
  );
}

/*
 * THE MILESTONE CELEBRATION (user, 2026-09-30): the whole page — a dimmed
 * backdrop, fireworks, a shower of confetti and the number, big. Every hundred
 * customers; every thousand gets gold, more fireworks and a longer show. A tap
 * anywhere closes it; it closes itself after 9 s (14 s for a thousand). With
 * reduced motion, the card alone, without the fireworks.
 */
function Celebration({ m }) {
  useEffect(() => {
    const t = setTimeout(endCelebration, m.big ? 14000 : 9000);
    const esc = (e) => { if (e.key === 'Escape') endCelebration(); };
    window.addEventListener('keydown', esc);
    return () => { clearTimeout(t); window.removeEventListener('keydown', esc); };
  }, [m.at, m.big]);
  const motion = document.documentElement.getAttribute('data-motion');
  const still = motion === 'minimal' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const palette = m.big ? ['#f5c542', '#ffd966', '#e08700', '#fff3c4', '#d4a017'] : COLORS;
  const bursts = still ? [] : Array.from({ length: m.big ? 12 : 7 }, (_, i) => ({
    x: 8 + Math.random() * 84, y: 10 + Math.random() * 50, delay: (i * (m.big ? 0.55 : 0.7)) % (m.big ? 6 : 4.2),
    color: palette[i % palette.length], size: m.big ? 150 + Math.random() * 90 : 110 + Math.random() * 70,
  }));
  const rain = still ? [] : Array.from({ length: m.big ? 160 : 100 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * (m.big ? 5 : 3), dur: 2.4 + Math.random() * 1.8,
    size: 6 + Math.random() * 7, color: palette[i % palette.length], spin: Math.random() * 900 - 450,
    drift: Math.random() * 200 - 100, round: i % 3 === 0,
  }));
  return (
    <div className="no-print fixed inset-0 z-[70] cursor-pointer overflow-hidden" role="dialog" aria-modal="true"
      aria-label={`${m.customers} customers milestone`} onClick={endCelebration}
      style={{ background: m.big ? 'radial-gradient(circle at 50% 40%, rgba(80,55,0,.55), rgba(10,10,20,.82))' : 'radial-gradient(circle at 50% 40%, rgba(15,118,110,.45), rgba(10,15,25,.8))', animation: still ? 'none' : 'gp-fade .4s ease-out' }}>
      <style>{`
        @keyframes gp-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes gp-pop { 0% { transform: scale(.4); opacity: 0 } 60% { transform: scale(1.08); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes gp-glow { 0%,100% { text-shadow: 0 0 24px var(--glow) } 50% { text-shadow: 0 0 56px var(--glow) } }
        @keyframes gp-burst { 0% { transform: rotate(var(--a)) translateX(0) scale(1); opacity: 1 }
          80% { opacity: .9 } 100% { transform: rotate(var(--a)) translateX(var(--r)) scale(.3); opacity: 0 } }
        @keyframes gp-rain { 0% { transform: translate3d(0,-10vh,0) rotate(0) } 100% { transform: translate3d(var(--drift),110vh,0) rotate(var(--spin)) } }
      `}</style>
      {bursts.map((b, i) => (
        <div key={i} className="absolute" style={{ left: `${b.x}%`, top: `${b.y}%` }} aria-hidden="true">
          {Array.from({ length: 18 }, (_, k) => (
            <span key={k} className="absolute left-0 top-0 block rounded-full" style={{
              width: 6, height: 6, background: b.color, boxShadow: `0 0 8px ${b.color}`,
              '--a': `${k * 20}deg`, '--r': `${b.size}px`, opacity: 0,
              animation: `gp-burst 1.3s cubic-bezier(.1,.7,.3,1) ${b.delay}s infinite`,
            }} />
          ))}
        </div>
      ))}
      {rain.map((c, i) => (
        <span key={i} aria-hidden="true" className="absolute top-0 block" style={{
          left: `${c.left}%`, width: c.size, height: c.round ? c.size : c.size * 0.45, background: c.color,
          borderRadius: c.round ? '50%' : 2, '--drift': `${c.drift}px`, '--spin': `${c.spin}deg`,
          animation: `gp-rain ${c.dur}s linear ${c.delay}s infinite`, transform: 'translate3d(0,-10vh,0)',
        }} />
      ))}
      <div className="absolute inset-0 grid place-items-center p-6">
        <div className="text-center" style={{ animation: still ? 'none' : 'gp-pop .8s cubic-bezier(.2,.9,.3,1.2)' }}>
          <div className="text-6xl sm:text-7xl" aria-hidden="true">{m.big ? '🏆' : '🎉'}</div>
          <div className="mt-3 font-extrabold tabular leading-none text-white"
            style={{ fontSize: 'clamp(4rem, 14vw, 10rem)', '--glow': m.big ? '#f5c542' : '#14b8a6', animation: still ? 'none' : 'gp-glow 2s ease-in-out infinite' }}>
            {m.customers.toLocaleString('en-IN')}
          </div>
          <div className="mt-2 text-2xl font-bold text-white sm:text-3xl">customers on GaadiPe!</div>
          <div className="mt-2 text-sm text-white/80">{m.big ? 'A thousand-mark milestone. Take a moment — this is big. 🥳' : 'Another hundred people trust GaadiPe. Well done! 🙌'}</div>
          <div className="mt-6 text-2xs text-white/60">Tap anywhere to close</div>
        </div>
      </div>
    </div>
  );
}

/** The pop-ups, bottom right. A tap opens what it is about. */
export function Toasts() {
  const { toasts, party, milestone } = useLive();
  const navigate = useNavigate();
  const where = (t) => (t.kind === 'payment' ? (t.mobile ? `/journey?mobile=${t.mobile}` : '/payments')
    : t.kind === 'hi' ? (t.mobile ? `/journey?mobile=${t.mobile}` : '/live')
    : t.kind === 'check' ? (t.reg_no ? `/vehicles/${t.reg_no}` : '/vehicles')
    : '/alerts');
  return (
    <>
    <Confetti at={party} />
    {milestone && <Celebration m={milestone} />}
    {toasts.length > 0 && (
    <div className="no-print fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role={t.tone === 'wrong' ? 'alert' : undefined}
          className={`m-toast cursor-pointer rounded-lg border shadow-lg ${t.kind === 'hi' || t.kind === 'check' ? 'p-2.5' : 'p-3'} ${
            t.kind === 'payment' ? 'border-good-500 bg-good-50 ring-2 ring-good-500/30' : TONE[t.tone] || TONE.info}`}
          onClick={() => { dismiss(t.id); if (t.kind === 'snack') return; navigate(where(t)); }}>
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[t.tone] || DOT.info}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{t.kind === 'payment' ? `🎉 ${t.title}` : t.title}</span>
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
              {(t.kind === 'hi' || t.kind === 'check') && (
                <button className="mt-1 text-[10px] text-muted underline-offset-2 hover:text-ink hover:underline"
                  title="Payments and alerts still pop up. Turn back on in Preferences."
                  onClick={(e) => { e.stopPropagation(); setActivityPopups(false); state.toasts = state.toasts.filter((x) => x.kind !== 'hi' && x.kind !== 'check'); emit(); }}>
                  Mute hi &amp; check pop-ups
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
    )}
    </>
  );
}
