import { useEffect, useRef, useState } from 'react';
import { api } from './api';

/**
 * THE MOTION SYSTEM'S JAVASCRIPT HALF (user, 2026-09-25). The CSS half —
 * tokens, keyframes, levels — is at the end of index.css.
 *
 * Preferences, per admin (saved on the server, cached in this browser so the
 * first paint already obeys them):
 *   motion    full | reduced | minimal   (the OS "reduce motion" is at least reduced)
 *   realtime  live | 30s | 60s | manual  (how often screens refresh themselves)
 *   charts    true | false               (charts draw in, or appear at once)
 *
 * Everything that animates in JS asks motionLevel() first, so a number never
 * counts up for someone who asked for no motion.
 */

export const DURATION = { instant: 100, fast: 150, normal: 220, emphasis: 350, complex: 500 };
const DEFAULTS = { motion: 'full', realtime: 'live', charts: true };
const KEY = 'gp.ui.prefs';
const PREF = 'ui.preferences';

const osReduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
let prefs = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; } })();
const watchers = new Set();
function apply() {
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = motionLevel();
  watchers.forEach((f) => f({ ...prefs }));
}
apply();

/** full | reduced | minimal — what the screen may do right now. */
export function motionLevel() {
  if (prefs.motion === 'minimal') return 'minimal';
  if (prefs.motion === 'reduced' || osReduced()) return 'reduced';
  return 'full';
}
export const getPrefs = () => ({ ...prefs });

/** Load this admin's saved preferences (once, after sign-in). */
export async function loadPrefs() {
  try {
    const { value } = await api.pref(PREF);
    if (value && typeof value === 'object') {
      prefs = { ...DEFAULTS, ...value };
      try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private window */ }
      apply();
    }
  } catch { /* keep the cached ones */ }
}

export async function savePrefs(patch) {
  prefs = { ...prefs, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private window */ }
  apply();
  await api.setPref(PREF, prefs);
}

export function usePrefs() {
  const [p, setP] = useState(getPrefs);
  useEffect(() => { watchers.add(setP); return () => watchers.delete(setP); }, []);
  return p;
}

/** How often a screen refreshes itself under the Realtime preference; null = only by hand. */
export function refreshEvery(baseMs) {
  switch (prefs.realtime) {
    case 'manual': return null;
    case '30s': return Math.max(baseMs, 30000);
    case '60s': return Math.max(baseMs, 60000);
    default: return baseMs;
  }
}

/* ─────────────────────────────── refresh ─────────────────────────────── */

/** The header's Refresh: every screen listening reloads at once. */
export const refreshAll = () => window.dispatchEvent(new CustomEvent('gp:refresh'));
export function useRefreshSignal(fn) {
  const latest = useRef(fn); latest.current = fn;
  useEffect(() => {
    const h = () => { Promise.resolve(latest.current()).catch(() => {}); };
    window.addEventListener('gp:refresh', h);
    return () => window.removeEventListener('gp:refresh', h);
  }, []);
}

/* ─────────────────────────────── charts ─────────────────────────────── */

/**
 * Props for a recharts series: it draws in when the chart first appears, and
 * never replays the whole animation when a filter changes — later updates
 * move without the draw. Off with Chart animation off or Minimal motion.
 */
export function useChartAnim() {
  const p = usePrefs();
  const first = useRef(true);
  const [done, setDone] = useState(false);
  useEffect(() => { const t = setTimeout(() => { first.current = false; setDone(true); }, 900); return () => clearTimeout(t); }, []);
  const on = p.charts && motionLevel() === 'full' && !done;
  return { isAnimationActive: on, animationDuration: 600, animationEasing: 'ease-out' };
}

/** Legend clicks fade a series out and back (opacity, never removal). */
export function useSeriesToggle() {
  const [hidden, setHidden] = useState(new Set());
  const toggle = (o) => {
    const k = o?.dataKey ?? o?.value;
    setHidden((h) => { const n = new Set(h); n.has(k) ? n.delete(k) : n.add(k); return n; });
  };
  const style = (k) => ({ strokeOpacity: hidden.has(k) ? 0.08 : 1, fillOpacity: hidden.has(k) ? 0.05 : 1, transition: `opacity ${DURATION.normal}ms ease` });
  const legend = { onClick: toggle, wrapperStyle: { fontSize: 12, cursor: 'pointer' },
    formatter: (v, e) => <span style={{ opacity: hidden.has(e?.dataKey ?? v) ? 0.4 : 1, transition: 'opacity .2s' }}>{v}</span> };
  return { hidden, style, legend };
}

/* ─────────────────────────────── numbers ─────────────────────────────── */

const ease = (t) => 1 - (1 - t) ** 3;

/**
 * A number that moves from where it was to where it is — never back to zero
 * on an update. Counts up from 0 only the first time it appears. `format`
 * turns the number into text (rupees, %, …). A rise tints green, a fall
 * amber, briefly; `worseUp` flips that for costs.
 */
export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString('en-IN'), duration = DURATION.complex, worseUp = false, countUp = true, className = '' }) {
  const target = Number(value);
  const [shown, setShown] = useState(() => (countUp && motionLevel() === 'full' ? 0 : target));
  const prev = useRef(countUp && motionLevel() === 'full' ? 0 : target);
  const [tint, setTint] = useState('');
  useEffect(() => {
    if (!Number.isFinite(target)) { setShown(target); return undefined; }
    const from = prev.current; prev.current = target;
    if (from === target) { setShown(target); return undefined; }
    if (from !== 0 || !countUp) setTint((target > from) !== worseUp ? 'm-up' : 'm-down');
    if (motionLevel() !== 'full') { setShown(target); return undefined; }
    let raf; const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / duration);
      setShown(from + (target - from) * ease(k));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const clear = setTimeout(() => setTint(''), duration + 100);
    return () => { cancelAnimationFrame(raf); clearTimeout(clear); };
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  if (value == null || !Number.isFinite(target)) return <span className={className}>—</span>;
  return <span className={`tabular ${tint} ${className}`}>{format(shown)}</span>;
}

/* ─────────────────────────────── gauges ─────────────────────────────── */

/* A value between 0 and max, moved to smoothly (rAF), for gauges and rings. */
function useTween(value, duration = DURATION.complex) {
  const [v, setV] = useState(motionLevel() === 'full' ? 0 : value ?? 0);
  const prev = useRef(motionLevel() === 'full' ? 0 : value ?? 0);
  useEffect(() => {
    const target = Number(value ?? 0); const from = prev.current; prev.current = target;
    if (motionLevel() !== 'full' || from === target) { setV(target); return undefined; }
    let raf; const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / duration); setV(from + (target - from) * ease(k)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export const TONE_COLOR = { good: '#12a150', watch: '#e08700', wrong: '#d92d20', info: '#0f766e', muted: '#c9d6d3' };

/**
 * A half-circle dial for a bounded figure (a success rate, CPU, latency
 * against its threshold). The arc moves from its last value to the new one;
 * `tone` (from real thresholds) colours it, and the label always says the
 * status in words too — colour is never the only signal.
 */
export function AnimatedGauge({ value, max = 100, label, text, tone = 'info', caption, size = 132 }) {
  const v = useTween(value == null ? 0 : Math.max(0, Math.min(max, value)));
  const r = size / 2 - 10; const cx = size / 2; const cy = size / 2;
  const len = Math.PI * r;
  const frac = max ? v / max : 0;
  return (
    <div className="flex flex-col items-center" role="img" aria-label={`${label}: ${text ?? value ?? 'no data'}${caption ? `, ${caption}` : ''}`}>
      <svg width={size} height={size / 2 + 12} viewBox={`0 0 ${size} ${size / 2 + 12}`}>
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#e3ecea" strokeWidth="10" strokeLinecap="round" />
        {value != null && (
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={TONE_COLOR[tone]} strokeWidth="10" strokeLinecap="round"
            strokeDasharray={len} strokeDashoffset={len * (1 - frac)} style={{ transition: 'stroke var(--m-emph) ease' }} />
        )}
      </svg>
      <div className="-mt-7 text-center">
        <div className="tabular text-lg font-semibold text-ink">{value == null ? '—' : text ?? Math.round(v)}</div>
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</div>
        {caption && <div className="text-[10px] text-muted">{caption}</div>}
      </div>
    </div>
  );
}

/** A full ring for a percentage (CPU, memory, disk). */
export function AnimatedProgressRing({ value, label, tone = 'info', size = 72, stroke = 7 }) {
  const v = useTween(value == null ? 0 : Math.max(0, Math.min(100, value)));
  const r = size / 2 - stroke; const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3" role="img" aria-label={`${label}: ${value == null ? 'not available' : `${Math.round(value)}%`}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e3ecea" strokeWidth={stroke} />
        {value != null && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TONE_COLOR[tone]} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} style={{ transition: 'stroke var(--m-emph) ease' }} />}
      </svg>
      <div><div className="tabular text-lg font-semibold text-ink">{value == null ? '—' : `${Math.round(v)}%`}</div><div className="text-2xs text-muted">{label}</div></div>
    </div>
  );
}

/* ─────────────────────────────── status ─────────────────────────────── */

const STATUS = {
  operational: ['bg-good-500', 'm-dot-healthy', 'Operational'], ok: ['bg-good-500', 'm-dot-healthy', 'Healthy'],
  warning: ['bg-watch-500', 'm-dot-warning', 'Warning'], degraded: ['bg-watch-500', 'm-dot-warning', 'Degraded'],
  critical: ['bg-wrong-500', 'm-dot-critical', 'Critical'], down: ['bg-wrong-500', '', 'Down'], unknown: ['bg-muted', '', 'Unknown'],
};
/** A status dot with its word beside it: calm, slower amber, controlled red, a DOWN dot that does not move. */
export function AnimatedStatus({ level = 'unknown', label, size = 10, showLabel = true }) {
  const [bg, anim, word] = STATUS[level] || STATUS.unknown;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`m-dot ${bg} ${anim}`} style={{ width: size, height: size }} aria-hidden="true" />
      {showLabel && <span className="text-2xs font-semibold text-body">{label || word}</span>}
      {level === 'down' && <span aria-hidden="true" className="text-2xs font-bold text-wrong-700">!</span>}
    </span>
  );
}

/** A small check that draws itself — success, after real confirmation only. */
export function Check({ size = 14, className = 'text-good-700' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="m-draw" style={{ '--len': 16 }} />
    </svg>
  );
}

/** Remember the last value of something, to tell when it changed. */
export function usePrevious(v) { const r = useRef(); useEffect(() => { r.current = v; }); return r.current; }

/**
 * Rows that arrived or changed since the last load — for a brief highlight.
 * key(row) identifies a row, sig(row) says what counts as a change.
 */
export function useRowChanges(rows, key = (r) => r.id, sig = (r) => JSON.stringify(r)) {
  const seen = useRef(null);
  const [marks, setMarks] = useState({});
  useEffect(() => {
    if (!rows) return undefined;
    const now = new Map(rows.map((r) => [key(r), sig(r)]));
    if (seen.current) {
      const m = {};
      for (const [k, s] of now) { if (!seen.current.has(k)) m[k] = 'm-row-new'; else if (seen.current.get(k) !== s) m[k] = 'm-row-changed'; }
      if (Object.keys(m).length) { setMarks(m); const t = setTimeout(() => setMarks({}), 1300); seen.current = now; return () => clearTimeout(t); }
    }
    seen.current = now;
    return undefined;
  }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  return (row) => marks[key(row)] || '';
}

/**
 * The same as useChartAnim, for places a hook cannot go (inside a map, a
 * helper): series draw in only with Chart animation on and Full motion.
 * Recharts moves later updates from the old values, not from zero.
 */
export function chartAnim() {
  return { isAnimationActive: Boolean(prefs.charts) && motionLevel() === 'full', animationDuration: 600, animationEasing: 'ease-out' };
}

/**
 * Click a legend item: its series fades out (opacity, never removed) and the
 * legend item dims; click again and both come back. Works on any recharts
 * chart — series are drawn in legend order.
 */
export function legendToggle() {
  return {
    onClick: (_o, i, e) => {
      const li = e?.currentTarget; const chart = li?.closest('.recharts-wrapper');
      if (!chart) return;
      const series = chart.querySelectorAll('.recharts-line, .recharts-bar, .recharts-area, .recharts-pie, .recharts-scatter');
      const s = series[i]; if (!s) return;
      const off = s.dataset.off !== '1';
      s.dataset.off = off ? '1' : '0';
      s.style.transition = `opacity ${DURATION.normal}ms ease`;
      s.style.opacity = off ? '0.08' : '1';
      li.style.transition = `opacity ${DURATION.fast}ms ease`;
      li.style.opacity = off ? '0.4' : '1';
    },
    cursor: 'pointer',
  };
}
