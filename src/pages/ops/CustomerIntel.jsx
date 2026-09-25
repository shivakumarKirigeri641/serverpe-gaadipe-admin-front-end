import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { Chip, Failed, Skeleton, Empty, Table, Pager } from '../../components/ui.jsx';
import { dateTime, ago } from '../../lib/format';
import { rs, num } from './common.jsx';

/**
 * CUSTOMER INTELLIGENCE (user, 2026-09-25) — every customer with their
 * lifetime: when they came, how often, what they looked up, bought and paid,
 * where they came from, and what failed. A row opens their whole journey.
 * Search, filters, sort and pages are the server's.
 */
const WA = { in_window: ['In the 24-hour window', 'good'], known: ['On WhatsApp', 'info'], opted_out: ['Opted out (STOP)', 'wrong'], never: ['Never wrote', 'info'] };
const SIZE = 50;

export default function CustomerIntel() {
  const navigate = useNavigate();
  const [f, setF] = useState({ q: '', paid: '', repeat: '', failures: '', opted_out: '', sort: 'last_active', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try { setError(null); setD(await api.customerIntel({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), limit: SIZE, offset: (page - 1) * SIZE })); } catch (e) { setError(e); }
  }, [f, page]);
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);
  useEffect(() => { setPage(1); }, [f]);
  const put = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? (e.target.checked ? '1' : '') : e.target.value }));
  const th = (k, l) => <th className="th cursor-pointer hover:text-ink" onClick={() => setF((x) => ({ ...x, sort: k, dir: x.sort === k && x.dir === 'desc' ? 'asc' : 'desc' }))}>{l}{f.sort === k ? (f.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>;
  return (
    <Shell title="Customer intelligence" subtitle={d ? `${num(d.total)} customers` : ' '}>
      <div className="card mb-3 flex flex-wrap items-center gap-3 p-3">
        <input className="input !w-64 !py-1.5" value={f.q} onChange={put('q')} placeholder="Phone, name or a vehicle they looked up" />
        <select className="input !w-auto !py-1.5 text-sm" value={f.paid} onChange={put('paid')}><option value="">Paid or not</option><option value="yes">Has paid</option><option value="no">Never paid</option></select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.repeat === '1'} onChange={put('repeat')} /> Repeat buyers</label>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.failures === '1'} onChange={put('failures')} /> Had a payment failure</label>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.opted_out === '1'} onChange={put('opted_out')} /> Opted out</label>
      </div>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={8} /> : !d.rows.length ? <Empty>No customer matches.</Empty> : (
          <>
            <Table head={<tr><th className="th">Customer</th><th className="th">WhatsApp</th>{th('first_seen', 'First seen')}{th('last_active', 'Last active')}<th className="th">Sessions</th>
              {th('lookups', 'Searches')}{th('vehicles', 'Vehicles')}{th('reports', 'Reports')}{th('paid', 'Purchased')}{th('revenue', 'Revenue')}<th className="th">Source</th>
              {th('failures', 'Pay failures')}<th className="th">Last vehicle</th><th className="th">Last channel</th></tr>}>
              {d.rows.map((x) => (
                <tr key={x.id} className="cursor-pointer hover:bg-shell/60" onClick={() => navigate(`/journey?user=${x.id}`)}>
                  <td className="td"><div className="font-mono">{x.mobile || '—'}</div><div className="text-2xs text-muted">#{x.id}{x.name ? ` · ${x.name}` : ''}</div></td>
                  <td className="td"><Chip tone={WA[x.whatsapp][1]}>{WA[x.whatsapp][0]}</Chip></td>
                  <td className="td whitespace-nowrap text-2xs">{dateTime(x.first_seen)}</td>
                  <td className="td whitespace-nowrap text-2xs">{x.last_active ? ago(x.last_active) : '—'}</td>
                  <td className="td tabular">{num(x.sessions)}</td><td className="td tabular">{num(x.lookups)}</td><td className="td tabular">{num(x.vehicles)}</td>
                  <td className="td tabular">{num(x.reports)}</td><td className="td tabular">{num(x.paid)}</td><td className="td tabular">{rs(x.revenue_paise)}</td>
                  <td className="td text-2xs">{x.source.replace(/_/g, ' ')}</td>
                  <td className={`td tabular ${x.pay_failures ? 'text-wrong-700' : ''}`}>{num(x.pay_failures)}</td>
                  <td className="td font-mono">{x.last_reg ? <Link onClick={(e) => e.stopPropagation()} className="text-brand-deep hover:underline" to={`/vehicles/${x.last_reg}`}>{x.last_reg}</Link> : '—'}</td>
                  <td className="td">{x.last_channel === 'website' ? 'Website' : x.last_channel === 'whatsapp' ? 'WhatsApp' : '—'}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={d.total} size={SIZE} onPage={setPage} />
          </>
        )}
      </div>
      {d && <p className="mt-2 text-2xs text-muted">{d.notes.sessions} {d.notes.referral}</p>}
    </Shell>
  );
}
