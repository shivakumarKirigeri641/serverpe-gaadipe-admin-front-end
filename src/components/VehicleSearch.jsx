import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { ago } from '../lib/format';

/**
 * The header's vehicle search (user, 2026-09-25) — from any screen. Type a
 * number in any form (KA-01 ab 1234) and the matches appear with who last
 * searched them and whether a report was paid for; Enter opens the first.
 * "/" focuses it.
 */
const PAY = { paid: ['Paid', 'text-good-700'], pending: ['Pending', 'text-watch-700'], failed: ['Failed', 'text-wrong-700'], none: ['Unpaid', 'text-muted'] };

export default function VehicleSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
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
    if (t.length < 2) { setRows(null); return undefined; }
    let live = true;
    const timer = setTimeout(() => api.vehicleQuick(t).then((r) => { if (live) { setRows(r.rows); setAt(0); } }).catch(() => live && setRows([])), 220);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  const go = (reg) => { setOpen(false); setQ(''); setRows(null); box.current?.blur(); navigate(`/vehicles/${reg}`); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min((rows?.length || 1) - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    if (e.key === 'Escape') { setOpen(false); box.current?.blur(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const clean = q.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (rows?.[at]) go(rows[at].reg_no);
      else if (clean.length >= 5) go(clean);
    }
  };

  return (
    <div className="relative hidden md:block">
      <input ref={box} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey}
        className="input !w-56 !py-1.5 !text-sm lg:!w-64" placeholder="Find a vehicle…  /" aria-label="Find a vehicle" />
      {open && rows && (
        <div className="absolute right-0 top-10 z-40 w-[26rem] overflow-hidden rounded-xl border border-line bg-white shadow-pop">
          {!rows.length ? <div className="px-4 py-3 text-sm text-muted">No vehicle matches. Enter opens the number anyway.</div> : rows.map((r, i) => (
            <button key={r.reg_no} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => go(r.reg_no)} onMouseEnter={() => setAt(i)}
              className={`block w-full px-4 py-2 text-left ${i === at ? 'bg-shell' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-ink">{r.display}</span>
                <span className={`text-2xs font-semibold ${PAY[r.payment_status]?.[1]}`}>{PAY[r.payment_status]?.[0]}</span>
              </div>
              <div className="truncate text-2xs text-muted">
                {[r.maker, r.model].filter(Boolean).join(' · ') || 'Details not returned'} · {r.customer || 'no customer'} ·
                {' '}last searched {r.last_seen ? ago(r.last_seen) : '—'} · {r.reports} report{r.reports === 1 ? '' : 's'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
