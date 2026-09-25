import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Chip } from '../../components/ui.jsx';

/*
 * Pieces shared by the Vehicles module's screens (user, 2026-09-25): how a
 * document's state is said and coloured, money, "Not available", the
 * collapsible section every profile block sits in, and the module's metadata
 * (admins, tags, lists, export fields) fetched once per visit.
 */

export const NA = <span className="text-muted">Not available</span>;
export const show = (v) => (v == null || v === '' ? NA : v);
export const inr = (p, d = 2) => (p == null ? NA : `₹${(Number(p) / 100).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const ms = (v) => (v == null ? '—' : v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`);

/** 2026-10-26 -> 26 Oct 2026, as the calendar day it is (no time zone games). */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const day = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}` : (v || '—');
};

export const DOC_STATE = {
  valid: ['Valid', 'good'], soon: ['Expiring soon', 'watch'], expired: ['Expired', 'wrong'],
  na: ['Not available', 'info'], unknown: ['Unknown', 'info'],
};
export const DOC_NOTE = {
  na: 'The records API returned no date for this document.',
  unknown: 'GaadiPe has not looked this vehicle up with the records API yet.',
};

/** "Expired 37 days ago" / "Expires in 12 days" / "Valid until 26 Oct 2026". */
export function docWords(d) {
  if (!d || d.state === 'na' || d.state === 'unknown' || d.days == null) return DOC_STATE[d?.state || 'unknown'][0];
  if (d.days < 0) return `Expired ${-d.days} day${d.days === -1 ? '' : 's'} ago`;
  if (d.days === 0) return 'Expires today';
  if (d.state === 'soon') return `Expires in ${d.days} day${d.days === 1 ? '' : 's'}`;
  return `Valid until ${day(d.upto)}`;
}

export function DocChip({ label, state, upto }) {
  const [word, tone] = DOC_STATE[state] || DOC_STATE.unknown;
  return <Chip tone={tone} note={`${label}: ${word}${upto ? ` — until ${day(upto)}` : ''}${DOC_NOTE[state] ? `. ${DOC_NOTE[state]}` : ''}`}>{label}</Chip>;
}

export const PAY_TONE = { paid: 'good', pending: 'watch', created: 'watch', failed: 'wrong', refunded: 'watch', none: 'info' };
export const PAY_WORD = { paid: 'Paid', pending: 'Pending', created: 'Pending', failed: 'Failed', refunded: 'Refunded', none: 'Unpaid' };

export const CHANNEL = { whatsapp: 'WhatsApp', web: 'Website', system: 'System' };

export const TAG_WORD = (t) => String(t).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/**
 * One block of the vehicle profile: a heading that folds the block away,
 * and a count or status beside it so a folded block still says something.
 */
export function Section({ id, title, badge, children, open: initial = true, right }) {
  const [open, setOpen] = useState(initial);
  useEffect(() => {
    // Opened by a deep link (#payments) even if it starts folded.
    if (window.location.hash === `#${id}`) setOpen(true);
  }, [id]);
  return (
    <section id={id} className="card scroll-mt-20 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className={`text-muted transition ${open ? 'rotate-90' : ''}`}>›</span>
          <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
          {badge != null && <span className="text-2xs text-muted">{badge}</span>}
        </button>
        {right}
      </div>
      {open && <div className="fade">{children}</div>}
    </section>
  );
}

/* Admins, tags, lists and export fields — asked once, shared by every screen. */
let metaCache = null;
export function useVehicleMeta() {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    let live = true;
    api.vehicleMeta().then((m) => { metaCache = m; if (live) setMeta(m); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return [meta, () => api.vehicleMeta().then((m) => { metaCache = m; setMeta(m); })];
}

/** Copy text; say so. */
export async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
/* The panel's own address for a vehicle. It opens only for a signed-in admin. */
export const linkTo = (reg) => `${window.location.origin}/vehicles/${reg}`;
