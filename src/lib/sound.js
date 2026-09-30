/**
 * POP-UP SOUNDS (user, 2026-09-30): a chime with each pop-up, drawn by the
 * browser (Web Audio) — no audio files to host or load.
 *
 *   payment    "ta-daaaa" in soft bells — one short, then three ringing together
 *   milestone  a bell fanfare — every hundred customers
 *   recovered  two soft rising notes — "all good again"
 *   alert      two falling notes; a critical one three, a little firmer
 *   hi / check one quiet drop, so a busy hour does not become noise
 *
 * Several pop-ups arriving together play once — the most important of them.
 * Browsers only allow sound after the admin has clicked or typed on the page
 * once; until then it stays silent rather than failing. On/off per browser
 * (Display & motion).
 */

const OFF_KEY = 'gp.sound.off';
export const soundOn = () => { try { return localStorage.getItem(OFF_KEY) !== '1'; } catch { return true; } };
export function setSound(on) { try { localStorage.setItem(OFF_KEY, on ? '0' : '1'); } catch { /* private window */ } }

let ctx = null;
function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// The first click or key press on the page unlocks sound for the session.
if (typeof window !== 'undefined') {
  const unlock = () => { audio(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}

/** One bell-like note: a sine with a quieter octave above, fading out. */
function bell(ac, out, freq, at, { dur = 1.1, gain = 0.22, type = 'sine' } = {}) {
  [[1, 1], [2, 0.28], [3, 0.08]].forEach(([mult, level]) => {
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = type; o.frequency.value = freq * mult;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain * level, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur / mult);
    o.connect(g).connect(out);
    o.start(at); o.stop(at + dur + 0.05);
  });
}

const N = { A4: 440, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, B6: 1975.53, C7: 2093 };

const TUNES = {
  // "Ta-daaaa" in the recovered bells (user, 2026-09-30): one short bell,
  // then three ringing together, a little fuller than recovered's two.
  payment: (ac, out, t) => {
    bell(ac, out, N.G5, t, { dur: 0.5, gain: 0.16 });
    [N.C6, N.E6, N.G6].forEach((f, i) => bell(ac, out, f, t + 0.16 + i * 0.012, { dur: 2, gain: 0.13 }));
  },
  // A customer milestone (user, 2026-09-30): a rising bell run into a full
  // chord that rings, then a second, higher chord — a fanfare, not a ping.
  milestone: (ac, out, t) => {
    [N.G5, N.C6, N.E6, N.G6].forEach((f, i) => bell(ac, out, f, t + i * 0.11, { dur: 0.7, gain: 0.14 }));
    [N.C6, N.E6, N.G6, N.C7].forEach((f, i) => bell(ac, out, f, t + 0.5 + i * 0.015, { dur: 2.4, gain: 0.12 }));
    [N.E6, N.G6, N.C7].forEach((f, i) => bell(ac, out, f * 2, t + 1.2 + i * 0.05, { dur: 1.6, gain: 0.05 }));
  },
  // 4 or 5 stars of feedback (user, 2026-09-30): a quick sparkle, rising.
  star: (ac, out, t) => [N.E6, N.G6, N.B6, N.E6 * 2].forEach((f, i) => bell(ac, out, f, t + i * 0.07, { dur: 0.9, gain: 0.11 })),
  recovered: (ac, out, t) => { bell(ac, out, N.G5, t, { dur: 0.9, gain: 0.16 }); bell(ac, out, N.D6, t + 0.13, { dur: 1.1, gain: 0.16 }); },
  critical: (ac, out, t) => [N.A5, N.E5, N.A4].forEach((f, i) => bell(ac, out, f, t + i * 0.16, { dur: 0.8, gain: 0.2, type: 'triangle' })),
  alert: (ac, out, t) => { bell(ac, out, N.A5, t, { dur: 0.7, gain: 0.15, type: 'triangle' }); bell(ac, out, N.E5, t + 0.16, { dur: 0.9, gain: 0.15, type: 'triangle' }); },
  hi: (ac, out, t) => bell(ac, out, N.E6, t, { dur: 0.5, gain: 0.07 }),
  check: (ac, out, t) => bell(ac, out, N.B6, t, { dur: 0.45, gain: 0.06 }),
};
const RANK = ['milestone', 'payment', 'star', 'critical', 'alert', 'recovered', 'hi', 'check'];

function play(name) {
  const ac = audio();
  if (!ac || ac.state !== 'running' || !TUNES[name]) return;
  const out = ac.createGain(); out.gain.value = 0.9; out.connect(ac.destination);
  TUNES[name](ac, out, ac.currentTime + 0.02);
}

let pending = null; let timer = null;
/** The sound for a pop-up; ones that arrive together play once, the most important. */
export function chime(item, { force = false } = {}) {
  if (!force && !soundOn()) return;
  const name = item.kind === 'alert' ? (item.severity === 'critical' ? 'critical' : 'alert') : item.kind;
  if (!TUNES[name]) return;
  if (force) { play(name); return; }
  if (!pending || RANK.indexOf(name) < RANK.indexOf(pending)) pending = name;
  clearTimeout(timer);
  timer = setTimeout(() => { play(pending); pending = null; }, 150);
}
