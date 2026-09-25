import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Chip, Failed, Skeleton, Empty, Table, Pager, PAGE_SIZE } from '../../components/ui.jsx';
import { dateTime } from '../../lib/format';
import { inr, ms, show } from './common.jsx';

/**
 * VEHICLE API LOGS (user, 2026-09-25) — every records-API call, newest first,
 * with the vehicle it was for. Admin-only (vehicles.api_logs). Errors are
 * shown with anything that looks like a credential removed on the server.
 */
export default function ApiLogs() {
  const [params, controls, key] = usePeriod('vehicle-api-logs', { defaultRange: '7d', withCompare: false });
  const [q, setQ] = useState('');
  const [f, setF] = useState({ dataset: '', ok: '', cache: '' });
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const load = useCallback(async () => {
    try { setError(null); setD(await api.vehicleApiLogs({ ...params, ...f, q: q || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })); } catch (e) { setError(e); }
  }, [key, f, q, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { setPage(1); }, [key, f, q]);
  const sel = (k, opts) => (
    <select className="input !w-auto !py-1.5 text-sm" value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  return (
    <Shell title="Vehicle API logs" subtitle={d ? `${d.total.toLocaleString('en-IN')} calls · ${d.range.label}` : ' '} actions={controls}>
      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <input className="input !w-56 !py-1.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Vehicle number" />
        {sel('dataset', [['', 'Every dataset'], ['rc', 'RC'], ['challan', 'Challans'], ['fastag', 'FASTag'], ['all', 'All-in-one']])}
        {sel('ok', [['', 'Any result'], ['1', 'Succeeded'], ['0', 'Failed']])}
        {sel('cache', [['', 'Live and cached'], ['0', 'Live calls only'], ['1', 'Cached only']])}
      </div>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={8} /> : !d.rows.length ? <Empty>No call matches.</Empty> : (
          <>
            <Table head={<tr>{['', 'When', 'Vehicle', 'Operation', 'Request', 'Status', 'HTTP', 'Time', 'Cost', 'Error'].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
              {d.rows.map((c) => (
                <Fragment key={c.id}>
                  <tr className="cursor-pointer hover:bg-shell/60" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
                    <td className="td text-muted">{openId === c.id ? '▾' : '▸'}</td>
                    <td className="td whitespace-nowrap">{dateTime(c.created_at)}</td>
                    <td className="td">{c.reg_no ? <Link onClick={(e) => e.stopPropagation()} to={`/vehicles/${c.reg_no}`} className="font-mono font-semibold text-brand-deep hover:underline">{c.display}</Link> : '—'}</td>
                    <td className="td font-mono text-2xs">{c.provider_path || c.dataset}</td>
                    <td className="td font-mono text-2xs">#{c.id}</td>
                    <td className="td">{c.cache_hit ? <Chip>Cached</Chip> : <Chip tone={c.ok ? 'good' : 'wrong'}>{c.ok ? 'OK' : 'Failed'}</Chip>}</td>
                    <td className="td tabular">{c.http_status ?? '—'}</td>
                    <td className="td tabular">{ms(c.duration_ms)}</td>
                    <td className="td tabular">{inr(c.cost_paise)}</td>
                    <td className="td max-w-[200px] truncate text-wrong-700">{c.error_code || ''}</td>
                  </tr>
                  {openId === c.id && (
                    <tr className="bg-shell/40"><td /><td className="td" colSpan={9}>
                      <div className="grid gap-x-6 gap-y-1 text-2xs sm:grid-cols-3">
                        {[['Dataset', c.dataset], ['Outcome', c.outcome], ['Served from cache', c.cache_hit ? 'Yes' : 'No'], ['Retries', 'Not recorded'],
                          ['Error code', c.error_code], ['Error', c.error_message]].map(([k, x]) => <div key={k}><span className="text-muted">{k}: </span>{show(x)}</div>)}
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </Table>
            <Pager page={page} total={d.total} onPage={setPage} />
          </>
        )}
      </div>
    </Shell>
  );
}
