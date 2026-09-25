import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

/**
 * The header's search, on every screen (user, 2026-09-25): vehicle number,
 * customer name / phone / id, WhatsApp number, payment, order or transaction
 * id, report or invoice number. Results come grouped — vehicles, customers,
 * payments, reports, events; arrows move, Enter opens the highlighted one,
 * or the full results page when nothing is highlighted. "/" focuses it.
 */
const GROUPS = [['vehicles', 'Vehicles'], ['customers', 'Customers'], ['payments', 'Payments'], ['reports', 'Reports'], ['events', 'Events']];

export const describe = (g, x) => ({
  vehicles: [x.display || x.reg_no, [x.maker, x.model].filter(Boolean).join(' · ') || 'Details not returned'],
  customers: [x.mobile || `Customer #${x.id}`, `${x.name || 'No name'} · ${x.paid} paid`],
  payments: [x.payment_id || x.order_id || `#${x.id}`, `${x.status} · ₹${(x.amount_paise / 100).toFixed(2)}${x.reg_no ? ` · ${x.reg_no}` : ''}`],
  reports: [x.report_number, x.reg_no || ''],
  events: [String(x.name).replace(/_/g, ' '), `${x.reg_no || x.mobile || ''} · #${x.id}`],
}[g]);

export default function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(-1);
  const box = useRef(null);

  useEffect(() => {
    const key = (e) => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) { e.preventDefault(); box.current?.focus(); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setD(null); return undefined; }
    let live = true;
    const timer = setTimeout(() => api.search(t).then((r) => { if (live) { setD(r); setAt(-1); } }).catch(() => live && setD(null)), 250);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  const flat = d ? GROUPS.flatMap(([g]) => (d.groups[g] || []).map((x) => ({ g, x }))) : [];
  const go = (to) => { setOpen(false); setQ(''); setD(null); box.current?.blur(); navigate(to); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(flat.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(-1, i - 1)); }
    if (e.key === 'Escape') { setOpen(false); box.current?.blur(); }
    if (e.key === 'Enter' && q.trim()) { e.preventDefault(); go(at >= 0 && flat[at] ? flat[at].x.to : `/search?q=${encodeURIComponent(q.trim())}`); }
  };
  let i = -1;
  return (
    <div className="relative hidden md:block">
      <input ref={box} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey}
        className="input !w-56 !py-1.5 !text-sm lg:!w-72" placeholder="Search vehicle, customer, payment…  /" aria-label="Search" />
      {open && d && (
        <div className="absolute right-0 top-10 z-40 max-h-[70vh] w-[28rem] overflow-y-auto rounded-xl border border-line bg-white shadow-pop">
          {!flat.length ? <div className="px-4 py-3 text-sm text-muted">Nothing found. Enter shows the full results page.</div> : GROUPS.map(([g, label]) => (
            (d.groups[g] || []).length ? (
              <div key={g}>
                <div className="bg-shell/70 px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</div>
                {d.groups[g].map((x) => {
                  i += 1; const me = i; const [t1, t2] = describe(g, x);
                  return (
                    <button key={`${g}${x.id || x.reg_no}`} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(x.to)} onMouseEnter={() => setAt(me)}
                      className={`block w-full px-4 py-1.5 text-left ${me === at ? 'bg-shell' : ''}`}>
                      <div className="truncate font-mono text-sm font-semibold text-ink">{t1}</div>
                      <div className="truncate text-2xs text-muted">{t2}</div>
                    </button>
                  );
                })}
              </div>
            ) : null
          ))}
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(`/search?q=${encodeURIComponent(q.trim())}`)}
            className="block w-full border-t border-line px-4 py-2 text-left text-2xs text-brand hover:bg-shell">All results for “{q.trim()}” →</button>
        </div>
      )}
    </div>
  );
}
