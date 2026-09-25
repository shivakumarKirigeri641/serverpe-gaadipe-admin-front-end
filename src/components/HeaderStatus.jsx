import { useEffect, useRef, useState } from 'react';
import { onConnChange, onBusyChange, errorsSeen } from '../lib/api';
import { refreshAll, usePrefs, Check } from '../lib/motion.jsx';
import { snack } from './Live.jsx';
import { Hint } from './ui.jsx';

/**
 * The header's two honest indicators (motion system, 2026-09-25).
 *
 * ConnectionStatus says LIVE only while the server is answering (api.js counts
 * every request): RECONNECTING after a failure, CONNECTION LOST after three,
 * and "Connection restored" once when it comes back. With Realtime set to
 * Manual it says so — the panel is not refreshing itself.
 *
 * RefreshButton reloads every screen. It spins only while those requests are
 * running, then shows a check — or stops and says it failed.
 */
export function ConnectionStatus() {
  const { realtime } = usePrefs();
  const [c, setC] = useState({ state: 'live' });
  useEffect(() => onConnChange((x) => {
    setC(x);
    if (x.restored) snack('Connection restored');
  }), []);
  const manual = realtime === 'manual';
  const view = c.state === 'lost' ? ['CONNECTION LOST', 'bg-wrong-500', 'text-wrong-700', 'The server has not answered three requests in a row. The panel keeps trying.']
    : c.state === 'reconnecting' ? ['RECONNECTING…', 'bg-watch-500 m-dot-warning', 'text-watch-700', 'A request to the server failed; trying again.']
      : manual ? ['MANUAL', 'bg-muted', 'text-muted', 'Realtime is set to Manual — screens refresh only when you press Refresh.']
        : ['LIVE', 'bg-good-500 m-dot-live', 'text-good-700', `The server is answering. Screens refresh ${realtime === 'live' ? 'every few seconds' : realtime === '30s' ? 'every 30 seconds' : 'every minute'}.`];
  return (
    <Hint note={view[3]} right>
      <span className="hidden items-center gap-1.5 rounded-full border border-line px-2 py-1 sm:inline-flex" role="status" aria-live="polite">
        <span className={`m-dot h-2 w-2 ${view[1]}`} aria-hidden="true" />
        <span className={`text-[10px] font-bold tracking-wider ${view[2]}`}>{view[0]}</span>
      </span>
    </Hint>
  );
}

export function RefreshButton() {
  const [st, setSt] = useState('idle');
  const since = useRef({ errors: 0, started: 0 });
  const busyRef = useRef(0);
  useEffect(() => onBusyChange((b) => {
    busyRef.current = b;
    // Finished: every request the refresh started has answered.
    if (b === 0 && since.current.started && Date.now() - since.current.started > 150) {
      since.current.started = 0;
      setSt(errorsSeen() > since.current.errors ? 'failed' : 'done');
      setTimeout(() => setSt('idle'), 1500);
    }
  }), []);
  const go = () => {
    if (st === 'running') return;
    since.current = { errors: errorsSeen(), started: Date.now() };
    setSt('running');
    refreshAll();
    // Nothing on this screen reloads: say done rather than spin.
    setTimeout(() => { if (busyRef.current === 0 && since.current.started) { since.current.started = 0; setSt('done'); setTimeout(() => setSt('idle'), 1200); } }, 400);
    // Never spin for ever.
    setTimeout(() => { if (since.current.started) { since.current.started = 0; setSt('failed'); setTimeout(() => setSt('idle'), 1500); } }, 30000);
  };
  const note = { idle: 'Refresh this screen now', running: 'Refreshing…', done: 'Up to date', failed: 'Refresh failed — see the screen for details' }[st];
  return (
    <Hint note={note} right>
      <button type="button" onClick={go} aria-label={note} className="m-press grid h-8 w-8 place-items-center rounded-lg text-body hover:bg-shell">
        {st === 'done' ? <Check size={16} /> : st === 'failed' ? <span className="text-sm font-bold text-wrong-700">!</span> : (
          <svg viewBox="0 0 24 24" className={`h-4 w-4 ${st === 'running' ? 'm-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" />
          </svg>
        )}
      </button>
    </Hint>
  );
}
