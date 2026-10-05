import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton } from '../../components/ui.jsx';
import { plate, count } from '../../lib/format';

/**
 * CHECKS PER CUSTOMER (user, 2026-10-05; back end src/admin/checksByCustomer.js).
 * For each customer and day: how many checks, how many different vehicles,
 * how many repeats, and which vehicles (with how many times each). WhatsApp
 * and the website together. Most checks first.
 */
const RANGES = [['1', 'Today'], ['y', 'Yesterday'], ['7', 'Last 7 days'], ['30', 'Last 30 days']];

const istDay = (offset) => new Date(Date.now() + 330 * 60000 - offset * 86400000).toISOString().slice(0, 10);
const time = (v) => new Date(v).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' });
const dayLabel = (d) => (d === istDay(0) ? 'Today' : d === istDay(1) ? 'Yesterday'
  : new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }));

export default function ChecksByCustomer() {
  const [range, setRange] = useState('1');
  const [min, setMin] = useState('1');
  const [q, setQ] = useState('');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.checksByCustomer(range === 'y' ? { day: istDay(1), min } : { days: range, min })
    .then((x) => { setD(x); setError(null); }).catch(setError), [range, min]);
  useEffect(() => { setD(null); load(); }, [load]);
  useAutoRefresh(load);

  const term = q.trim().toLowerCase().replace(/\s/g, '');
  const rows = (d?.rows || []).filter((r) => !term
    || String(r.name || '').toLowerCase().includes(term) || String(r.mobile || '').includes(term)
    || r.list.some((v) => String(v.reg_no || '').toLowerCase().includes(term)));
  const t = d?.totals || {};

  return (
    <Shell title="Checks per customer" subtitle="How many vehicles each customer checked, and how many times — WhatsApp and website, by day">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line p-0.5">
          {RANGES.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setRange(k)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${range === k ? 'bg-brand text-white' : 'text-muted hover:text-ink'}`}>{label}</button>
          ))}
        </div>
        <select className="input !w-auto !py-1.5 text-sm" value={min} onChange={(e) => setMin(e.target.value)}>
          <option value="1">Everyone who checked</option>
          <option value="3">3+ checks in a day</option>
          <option value="5">5+ checks in a day</option>
          <option value="10">10+ checks in a day</option>
        </select>
        <input className="input !w-56 !py-1.5 text-sm" placeholder="Name, number or vehicle" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {d && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Customers', t.customers], ['Checks', t.checks], ['Different vehicles', t.vehicles], ['Days with 10+ checks', t.heavy]].map(([label, n]) => (
            <div key={label} className="card p-3"><div className="text-2xs text-muted">{label}</div><div className="tabular text-xl font-bold text-ink">{count(n || 0)}</div></div>
          ))}
        </div>
      )}

      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={8} /> : !rows.length ? (
        <div className="card p-8 text-center text-sm text-muted">No checks in this period.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-2xs text-muted">
              <th className="px-3 py-2">Day</th><th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2 text-right">Checks</th><th className="px-3 py-2 text-right">Vehicles</th><th className="px-3 py-2 text-right">Repeats</th>
              <th className="px-3 py-2">Which vehicles (times checked)</th><th className="px-3 py-2">Time</th><th className="px-3 py-2" />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.user_id}:${r.day}`} className="border-b border-line/60 align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-2xs text-muted">{dayLabel(r.day)}</td>
                  <td className="px-3 py-2">
                    <div className="font-semibold text-ink">{r.name || 'Unknown'}</div>
                    <div className="tabular text-2xs text-muted">{r.masked}
                      {r.paid > 0 && <span className="ml-1.5 rounded-full bg-good-50 px-1.5 py-0.5 text-[10px] font-semibold text-good-700">Paid ×{r.paid}</span>}
                    </div>
                  </td>
                  <td className={`tabular px-3 py-2 text-right font-bold ${r.checks >= 10 ? 'text-wrong-700' : 'text-ink'}`}>{r.checks}</td>
                  <td className="tabular px-3 py-2 text-right">{r.vehicles}</td>
                  <td className="tabular px-3 py-2 text-right text-muted">{r.repeats || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex max-w-[28rem] flex-wrap gap-1">
                      {r.list.map((v) => (
                        <Link key={v.reg_no} to={`/vehicles/${v.reg_no}`} title={v.found ? 'Open the vehicle' : 'No Government record was found'}
                          className={`rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold ${v.found ? 'bg-shell text-ink hover:bg-brand/10' : 'bg-watch-50 text-watch-700'}`}>
                          {plate(v.reg_no)}{v.n > 1 ? <span className="ml-1 text-brand-deep">×{v.n}</span> : null}
                        </Link>
                      ))}
                    </div>
                    {r.not_found > 0 && <div className="mt-1 text-2xs text-watch-700">{r.not_found} not found</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-2xs text-muted">{r.checks > 1 ? `${time(r.first_at)} – ${time(r.last_at)}` : time(r.last_at)}</td>
                  <td className="px-3 py-2 text-right"><Link className="text-2xs text-brand hover:underline" to={`/journey?mobile=${r.mobile}`}>Journey →</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-2xs text-muted">A repeat is the same vehicle checked again the same day. Amber vehicles had no Government record (mistyped or very new).</p>
    </Shell>
  );
}
