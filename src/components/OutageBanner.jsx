import { useState } from 'react';
import { api } from '../lib/api';
import { useLive } from './Live.jsx';
import { ago } from '../lib/format';

/**
 * THE OUTAGE BANNER (user, 2026-10-01): across the top of every screen while
 * the Government vehicle records service is failing, or anyone is waiting for
 * their check. Customers who sent a number meanwhile were told it is saved and
 * will be sent automatically once the service is back — "Who is waiting" lists
 * them, and what happened to each.
 */
export default function OutageBanner() {
  const { badges } = useLive();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const down = Boolean(badges?.records_down);
  const waiting = Number(badges?.waitlist || 0);
  if (!down && !waiting) return null;
  const toggle = async () => {
    if (!open) api.waitlist().then((d) => setRows(d.rows)).catch(() => setRows([]));
    setOpen(!open);
  };
  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${down ? 'border-wrong-500/40 bg-wrong-50' : 'border-watch-500/40 bg-watch-50'}`} role="status">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg" aria-hidden="true">{down ? '⚠️' : '⏳'}</span>
        <span className="font-semibold text-ink">
          {down ? 'Vehicle records (VAHAN) are not responding' : 'Vehicle records look back — sending waiting checks'}
        </span>
        <span className="text-body">
          {waiting ? `· ${waiting} customer${waiting === 1 ? ' is' : 's are'} waiting — each gets their check automatically when it is back.`
            : '· new numbers are saved and sent automatically once it is back.'}
        </span>
        <button type="button" className="btn-quiet ml-auto !py-1 text-2xs" onClick={toggle}>{open ? 'Hide' : 'Who is waiting'}</button>
      </div>
      {open && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-line bg-white">
          {!rows ? <p className="p-3 text-2xs text-muted">Loading…</p> : !rows.length ? <p className="p-3 text-2xs text-muted">Nobody in the last three days.</p> : (
            <table className="w-full text-2xs">
              <thead><tr className="border-b border-line text-left text-muted">
                <th className="px-3 py-1.5">Customer</th><th className="px-3 py-1.5">Vehicle</th><th className="px-3 py-1.5">Since</th><th className="px-3 py-1.5">Status</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 last:border-0">
                    <td className="px-3 py-1.5">{r.name || 'Unknown'} · {r.masked}</td>
                    <td className="px-3 py-1.5 font-mono">{r.reg_no}</td>
                    <td className="px-3 py-1.5 text-muted">{ago(r.created_at)}</td>
                    <td className="px-3 py-1.5">{{ waiting: '⏳ Waiting', delivered: '✅ Sent', expired: '⌛ Window closed', failed: '✕ Not found' }[r.status] || r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
