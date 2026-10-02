import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useLive } from './Live.jsx';
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

/** The card's lines: [label, value, tone?]. */
function facts(p) {
  const rows = [];
  // The paid RC backup (user, 2026-10-02): switched on or not, and today's spend.
  const b = p.backup;
  if (b) {
    rows.push(['Switch', b.on ? 'On — used only when ULIP’s VAHAN fails' : 'Off (Feature flags → RC backup)', b.on ? null : 'bad']);
    rows.push(['Today', `${b.used ?? 0} of ${b.limit ?? '—'} calls · ₹${(((b.used || 0) * (b.cost_paise || 0)) / 100).toFixed(2)}`]);
  }
  if (p.state === 'idle') return [...rows, ['', b ? 'Not needed in the last 24 hours — ULIP answered.' : 'Nothing has used it in the last 24 hours, so its state is not known yet.']];
  if (p.last_ok_at) rows.push(['Last worked', `${ago(p.last_ok_at)}${p.last_ms != null ? ` · ${p.last_ms} ms` : ''}`]);
  else rows.push(['Last worked', 'not since it was first watched', 'bad']);
  if (p.recent_total) rows.push(['Recent calls', `${p.recent_ok} of the last ${p.recent_total} worked`, p.recent_ok < p.recent_total ? 'bad' : null]);
  if (p.consecutive_fails) rows.push(['Failing', `${p.consecutive_fails} in a row`, 'bad']);
  if (p.last_fail_at && p.state !== 'ok') rows.push(['Last failure', ago(p.last_fail_at), 'bad']);
  if (p.last_error && p.state !== 'ok') rows.push(['Error', p.last_error, 'bad']);
  if (p.key === 'whatsapp' && p.last_inbound_at) rows.push(['Last customer message', ago(p.last_inbound_at)]);
  return rows;
}

/*
 * THE INFO CARD (user, 2026-10-01: "the mouse pointer blocks it, I can't
 * read"). The shared hint opened 6px under the light — right where the
 * pointer sits. This card opens below the whole strip, clear of the pointer.
 */
function Card({ p, at }) {
  const [dot, text, word] = LOOK[p.state] || LOOK.idle;
  const left = Math.max(8, Math.min(at.left, window.innerWidth - 328));
  return createPortal(
    <div role="tooltip" className="pointer-events-none fixed z-[80] w-80 rounded-xl border border-line bg-white p-3 shadow-lg" style={{ top: at.top, left }}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`m-dot h-2.5 w-2.5 ${dot}`} aria-hidden="true" />
        <b className="text-sm text-ink">{p.label}</b>
        <span className={`ml-auto text-2xs font-semibold ${text}`}>{word}</span>
      </div>
      <dl className="space-y-1 text-2xs">
        {facts(p).map(([k, v, tone]) => (
          <div key={k || v} className="flex gap-2">
            {k && <dt className="w-28 shrink-0 text-muted">{k}</dt>}
            <dd className={`min-w-0 break-words ${tone === 'bad' ? 'text-wrong-700' : 'text-ink'}`}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 border-t border-line pt-1.5 text-[10px] text-muted">Click for the API monitor</p>
    </div>,
    document.body,
  );
}

export default function StatusStrip() {
  const { badges } = useLive();
  const strip = useRef(null);
  const [hover, setHover] = useState(null);
  const list = badges?.providers;
  if (!Array.isArray(list) || !list.length) return null;
  const bad = list.filter((p) => p.state === 'down' || p.state === 'degraded');
  const open = (key) => (e) => {
    const chip = e.currentTarget.getBoundingClientRect();
    const bar = strip.current?.getBoundingClientRect();
    setHover({ key, at: { left: chip.left, top: (bar ? bar.bottom : chip.bottom) + 14 } });
  };
  const shown = hover && list.find((p) => p.key === hover.key);
  return (
    <div ref={strip} className={`no-print flex items-center gap-1.5 strip-scroll overflow-x-auto whitespace-nowrap border-b border-line px-4 py-1.5 lg:px-6 ${bad.some((p) => p.state === 'down') ? 'bg-wrong-50' : bad.length ? 'bg-watch-50' : 'bg-white'}`}
      role="status" aria-label="Outside services" onScroll={() => setHover(null)}>
      <span className="mr-1 shrink-0 text-[10px] font-bold uppercase tracking-wider text-muted">Services</span>
      {list.map((p) => {
        const [dot, text] = LOOK[p.state] || LOOK.idle;
        return (
          <Link key={p.key} to="/api-monitor" aria-label={`${p.label}: ${(LOOK[p.state] || LOOK.idle)[2]}`}
            onMouseEnter={open(p.key)} onMouseLeave={() => setHover(null)} onFocus={open(p.key)} onBlur={() => setHover(null)}
            className="m-press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-2 py-0.5 hover:border-brand">
            <span className={`m-dot h-2 w-2 ${dot}`} aria-hidden="true" />
            <span className={`text-[11px] font-semibold ${p.state === 'ok' ? 'text-ink' : text}`}>{p.label}</span>
            {p.state !== 'ok' && p.state !== 'idle' && <span className={`text-[10px] ${text}`}>{p.state === 'down' ? 'down' : 'slow'}</span>}
          </Link>
        );
      })}
      <span className="ml-auto hidden shrink-0 text-[10px] text-muted sm:inline">
        {bad.length ? `${bad.length} need${bad.length === 1 ? 's' : ''} attention` : 'All answering'}
      </span>
      {shown && <Card p={shown} at={hover.at} />}
    </div>
  );
}
