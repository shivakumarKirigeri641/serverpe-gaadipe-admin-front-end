import { Link } from 'react-router-dom';
import { useLive } from './Live.jsx';
import { Hint } from './ui.jsx';
import { ago } from '../lib/format';

/**
 * THE SERVICES WATCHER (user, 2026-10-01): one slim strip under the header
 * with a light for each outside service GaadiPe depends on — read from the
 * real calls the server made, not from a ping. Green answering, amber recent
 * failures, red three or more failures in a row, grey nothing called in a day.
 * Hover a light for when it last worked and what the last error said; a tap
 * opens the API monitor.
 */
const LOOK = {
  ok: ['bg-good-500', 'text-good-700', 'Working'],
  degraded: ['bg-watch-500 m-dot-warning', 'text-watch-700', 'Some failures'],
  down: ['bg-wrong-500 m-dot-critical', 'text-wrong-700', 'Not responding'],
  idle: ['bg-muted/50', 'text-muted', 'No calls today'],
};

function note(p) {
  const lines = [`${p.label}: ${LOOK[p.state]?.[2] || p.state}.`];
  if (p.last_ok_at) lines.push(`Last worked ${ago(p.last_ok_at)}${p.last_ms != null ? ` (${p.last_ms} ms)` : ''}.`);
  if (p.recent_total) lines.push(`${p.recent_ok} of the last ${p.recent_total} calls worked.`);
  if (p.consecutive_fails) lines.push(`${p.consecutive_fails} failure${p.consecutive_fails === 1 ? '' : 's'} in a row.`);
  if (p.last_fail_at && p.state !== 'ok') lines.push(`Last failure ${ago(p.last_fail_at)}${p.last_error ? `: ${p.last_error}` : ''}`);
  if (p.key === 'whatsapp' && p.last_inbound_at) lines.push(`Last customer message ${ago(p.last_inbound_at)}.`);
  if (p.state === 'idle') lines.push('Nothing has called it in the last 24 hours, so its state is not known.');
  return lines.join(' ');
}

export default function StatusStrip() {
  const { badges } = useLive();
  const list = badges?.providers;
  if (!Array.isArray(list) || !list.length) return null;
  const bad = list.filter((p) => p.state === 'down' || p.state === 'degraded');
  return (
    <div className={`no-print flex items-center gap-1.5 strip-scroll overflow-x-auto whitespace-nowrap border-b border-line px-4 py-1.5 lg:px-6 ${bad.some((p) => p.state === 'down') ? 'bg-wrong-50' : bad.length ? 'bg-watch-50' : 'bg-white'}`}
      role="status" aria-label="Outside services">
      <span className="mr-1 shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted">Services</span>
      {list.map((p) => {
        const [dot, text] = LOOK[p.state] || LOOK.idle;
        return (
          <Hint key={p.key} note={note(p)}>
            <Link to="/api-monitor"
              className="m-press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-2 py-0.5 hover:border-brand">
              <span className={`m-dot h-2 w-2 ${dot}`} aria-hidden="true" />
              <span className={`text-[11px] font-semibold ${p.state === 'ok' ? 'text-ink' : text}`}>{p.label}</span>
              {p.state !== 'ok' && p.state !== 'idle' && <span className={`text-[10px] ${text}`}>{p.state === 'down' ? 'down' : 'slow'}</span>}
            </Link>
          </Hint>
        );
      })}
      <span className="ml-auto hidden shrink-0 text-[10px] text-muted sm:inline">
        {bad.length ? `${bad.length} need${bad.length === 1 ? 's' : ''} attention` : 'All answering'}
      </span>
    </div>
  );
}
