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

/*
 * THE PETROL-PUMP READING (user, 2026-09-30): every animated number in the
 * panel rolls on mechanical drums, like a 1980s fuel pump meter. Each digit is
 * a drum of 0–9 that only ever turns forward; the units drum spins two extra
 * turns and the tens one, so the right-hand digits whirl while the left ones
 * click over, and all of them stop together. Drums are keyed from the right,
 * so 99 → 100 adds a drum on the left instead of reshuffling the rest.
 * Anything that is not a digit (₹ , . % k) stands still. Motion reduced: the
 * text, as it is.
 */
const DRUM_H = 1.15; // em — the window each digit shows through
const DRUM = Array.from({ length: 60 }, (_, i) => i % 10);
function Drum({ digit, place, go, ms }) {
  const [pos, setPos] = useState(10 + (go ? 0 : digit));
  const [moving, setMoving] = useState(false);
  const last = useRef(go ? 0 : digit);
  useEffect(() => {
    const from = last.current; last.current = digit;
    if (motionLevel() !== 'full') { setMoving(false); setPos(10 + digit); return undefined; }
    const extra = place === 1 ? 2 : place === 2 ? 1 : 0;
    const steps = ((digit - from + 10) % 10) + 10 * extra;
    if (!steps) return undefined;
    let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => { setMoving(true); setPos(10 + from + steps); }); });
    const settle = setTimeout(() => { setMoving(false); setPos(10 + digit); }, ms + 60);
    return () => { cancelAnimationFrame(raf); clearTimeout(settle); };
  }, [digit]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span aria-hidden="true" className="relative inline-block overflow-hidden" style={{ height: `${DRUM_H}em`,
      WebkitMaskImage: 'linear-gradient(transparent, #000 22%, #000 78%, transparent)', maskImage: 'linear-gradient(transparent, #000 22%, #000 78%, transparent)' }}>
      <span className="block" style={{ transform: `translateY(-${pos * DRUM_H}em)`,
        transition: moving ? `transform ${ms}ms cubic-bezier(.3,.1,.2,1)` : 'none' }}>
        {DRUM.map((d, i) => <span key={i} className="block text-center" style={{ height: `${DRUM_H}em`, lineHeight: `${DRUM_H}em` }}>{d}</span>)}
      </span>
    </span>
  );
}

/** Any text with digits, rolled like a petrol-pump meter whenever it changes. */
export function Rolling({ text, countUp = true, ms = 1100, className = '' }) {
  const s = String(text ?? '');
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; }, []);
  if (motionLevel() !== 'full') return <span className={`tabular ${className}`}>{s}</span>;
  const chars = [...s];
  let place = 0;
  const places = chars.map((c) => (/\d/.test(c) ? 0 : null));
  for (let i = chars.length - 1; i >= 0; i--) if (places[i] === 0) places[i] = ++place;
  return (
    <span className={`tabular inline-flex overflow-hidden align-bottom ${className}`} style={{ height: `${DRUM_H}em`, lineHeight: `${DRUM_H}em` }}
      aria-label={s} role="text">
      {chars.map((c, i) => (places[i]
        ? <Drum key={`d${chars.length - i}`} digit={Number(c)} place={places[i]} go={countUp && !mounted.current} ms={ms} />
        : <span key={`s${chars.length - i}-${c}`} aria-hidden="true" className="whitespace-pre">{c}</span>))}
    </span>
  );
}

/**
 * A number that moves from where it was to where it is — never back to zero
 * on an update. Counts up from 0 only the first time it appears. `format`
 * turns the number into text (rupees, %, …). A rise tints green, a fall
 * amber, briefly; `worseUp` flips that for costs.
 */
export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString('en-IN'), duration = DURATION.complex, worseUp = false, countUp = true, className = '' }) {
  // Rolled like a petrol-pump meter (user, 2026-09-30) — see Rolling.
  const target = Number(value);
  const prev = useRef(null);
  const [tint, setTint] = useState('');
  useEffect(() => {
    if (!Number.isFinite(target)) return undefined;
    const from = prev.current; prev.current = target;
    if (from == null || from === target) return undefined;
    setTint((target > from) !== worseUp ? 'm-up' : 'm-down');
    const clear = setTimeout(() => setTint(''), Math.max(duration, 1100) + 100);
    return () => clearTimeout(clear);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  if (value == null || !Number.isFinite(target)) return <span className={className}>—</span>;
  return <Rolling text={format(target)} countUp={countUp} className={`${tint} ${className}`} />;
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
    const step = (now) => { const k = Math.max(0, Math.min(1, (now - t0) / duration)); setV(from + (target - from) * ease(k)); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

export const TONE_COLOR = { good: '#12a150', watch: '#e08700', wrong: '#d92d20', info: '#0f766e', muted: '#c9d6d3' };

/*
 * THE NEEDLE (user, 2026-09-30): moves like a real one — past its mark and
 * back (ease-out-back). The first time a dial appears it does the 1990s
 * dashboard self-test: sweeps to full scale and drops back to its reading.
 * With motion reduced, it simply points.
 */
const backOut = (k) => { const c1 = 1.4; const c3 = c1 + 1; return 1 + c3 * (k - 1) ** 3 + c1 * (k - 1) ** 2; };
function useNeedle(frac) {
  const full = motionLevel() === 'full';
  const [f, setF] = useState(full ? 0 : frac);
  const prev = useRef(full ? 0 : frac);
  const tested = useRef(!full);
  useEffect(() => {
    if (!full) { setF(frac); prev.current = frac; return undefined; }
    let raf; let stop = false;
    const run = (from, to, ms, easing) => new Promise((done) => {
      const t0 = performance.now();
      const step = (now) => {
        if (stop) return;
        // A frame's timestamp can fall just before t0; never let that read below zero.
        const k = Math.max(0, Math.min(1, (now - t0) / ms));
        setF(from + (to - from) * easing(k));
        if (k < 1) raf = requestAnimationFrame(step); else done();
      };
      raf = requestAnimationFrame(step);
    });
    (async () => {
      if (!tested.current) { tested.current = true; await run(0, 1, 700, ease); if (stop) return; await run(1, frac, 1100, backOut); }
      else await run(prev.current, frac, 900, backOut);
      prev.current = frac;
    })();
    return () => { stop = true; cancelAnimationFrame(raf); };
  }, [frac]); // eslint-disable-line react-hooks/exhaustive-deps
  return f;
}

const short = (n) => (n >= 1000 ? `${Math.round(n / 100) / 10}k`.replace('.0k', 'k') : String(Math.round(n)));

/**
 * A workshop pressure gauge (user, 2026-10-03, chosen from six old-instrument
 * styles: "D"). A brass bezel, a white face with green, yellow and red bands,
 * bold black ticks and numbers, a black arrow needle drawn last, and the exact
 * figure printed under the hub. It replaces the 1990s amber dial, whose thin
 * orange needle was hard to see and vanished altogether with no data.
 *
 *   danger  'high' (default) red at the top end — memory, latency, STOP rate;
 *           'low' red at the bottom end — anything named "success", or set it.
 *   bands   [warn, bad] as fractions of max where the yellow and red bands
 *           start, from the real thresholds; thirds-ish when not given.
 *   tone    from the same thresholds; the readout says the status in words
 *           under the label, so colour is never the only signal.
 *
 * With no figure the needle still shows, parked at zero and faded, and the
 * readout says NO DATA.
 */
export function AnimatedGauge({ value, max = 100, label, text, tone = 'info', caption, size = 150, danger, bands }) {
  const has = value != null && Number.isFinite(Number(value)) && max > 0;
  const frac = has ? Math.max(0, Math.min(1, Number(value) / max)) : 0;
  const f = useNeedle(frac);
  const low = danger ? danger === 'low' : /success/i.test(String(label || ''));
  const [warn, bad] = bands || (low ? [0.85, 0.6] : [0.6, 0.85]);
  const W = 300; const cx = 150; const cy = 150;
  const A0 = -135; const SPAN = 270;
  const ang = (x) => (A0 + SPAN * x) * (Math.PI / 180);
  const pt = (x, r) => [cx + r * Math.sin(ang(x)), cy - r * Math.cos(ang(x))];
  const arc = (a, b, r) => {
    const [x1, y1] = pt(a, r); const [x2, y2] = pt(b, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${(b - a) * SPAN > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const zones = low
    ? [[0, bad, '#d6342a'], [bad, warn, '#f2b705'], [warn, 1, '#1e9e4a']]
    : [[0, warn, '#1e9e4a'], [warn, bad, '#f2b705'], [bad, 1, '#d6342a']];
  const word = { good: 'OK', watch: 'Watch', wrong: 'Alert', muted: '', info: '' }[tone] ?? '';
  const wordColour = { good: 'text-good-700', watch: 'text-watch-700', wrong: 'text-wrong-700' }[tone] || 'text-muted';
  /*
   * A LIVE READOUT (user, 2026-09-30): while the needle moves, the readout
   * counts with it, then settles on the exact figure. `text` gives the shape
   * ("97%", "3200 ms", "₹1.2k"): its prefix, suffix and decimals are kept.
   */
  const shape = String(text ?? '').match(/^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/);
  const moving = has && Math.abs(f - frac) > 0.0005;
  const live = !moving ? text ?? Math.round(Number(value))
    : shape
      ? `${shape[1]}${(f * max).toLocaleString('en-IN', { minimumFractionDigits: (shape[2].split('.')[1] || '').length, maximumFractionDigits: (shape[2].split('.')[1] || '').length, useGrouping: shape[2].includes(',') })}${shape[3]}`
      : Math.round(f * max);
  const rot = A0 + SPAN * f;
  return (
    <div className="flex flex-col items-center" role="img" aria-label={`${label}: ${text ?? value ?? 'no data'}${word ? `, ${word}` : ''}${caption ? `, ${caption}` : ''}`}>
      <svg width={size} height={size} viewBox={`0 0 ${W} ${W}`} aria-hidden="true">
        <circle cx={cx} cy={cy} r={146} fill="#b8862d" />
        <circle cx={cx} cy={cy} r={139} fill="#e3c27a" />
        <circle cx={cx} cy={cy} r={130} fill="#fbfbf8" stroke="#333" strokeWidth="1.5" />
        {zones.map(([a, b, c]) => (b > a ? <path key={c} d={arc(a, b, 110)} fill="none" stroke={c} strokeWidth="16" /> : null))}
        {Array.from({ length: 51 }, (_, i) => {
          const x = i / 50; const major = i % 5 === 0;
          const [x1, y1] = pt(x, 121); const [x2, y2] = pt(x, 121 - (major ? 16 : 8));
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1d1d1d" strokeWidth={major ? 3.2 : 1.4} strokeLinecap="round" />;
        })}
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((x) => {
          const [lx, ly] = pt(x, 84);
          return <text key={x} x={lx} y={ly + 6} textAnchor="middle" fontSize="18" fontWeight="700" fill="#1d1d1d" fontFamily="ui-sans-serif, system-ui">{short(max * x)}</text>;
        })}
        {/* the readout, under the hub */}
        <text x={cx} y={cy + 80} textAnchor="middle" fontSize={has ? 26 : 16} fontWeight="700" fill={has ? '#111' : '#8a8a8a'}
          fontFamily="ui-monospace, 'Courier New', monospace">{has ? live : 'NO DATA'}</text>
        {/* the needle, drawn last so nothing ever covers it */}
        <g transform={`rotate(${rot} ${cx} ${cy})`} opacity={has ? 1 : 0.3}>
          <path d={`M${cx - 4.5} ${cy + 28} L${cx - 4.5} ${cy - 90} L${cx - 11} ${cy - 90} L${cx} ${cy - 122} L${cx + 11} ${cy - 90} L${cx + 4.5} ${cy - 90} L${cx + 4.5} ${cy + 28} Z`}
            fill="#111" stroke="#fbfbf8" strokeWidth="1.2" strokeLinejoin="round" />
        </g>
        <circle cx={cx} cy={cy} r={13} fill="#111" />
        <circle cx={cx} cy={cy} r={4.5} fill="#e3c27a" />
      </svg>
      <div className="mt-1 text-center">
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</div>
        {word && has && <div className={`text-[10px] font-semibold ${wordColour}`}>{word}</div>}
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
