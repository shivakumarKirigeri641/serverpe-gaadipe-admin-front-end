import { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api';
import Shell from '../components/Shell.jsx';
import { usePeriod } from '../components/Period.jsx';
import { Hint, Failed, SkeletonCards, Empty, Table, Chip, Pager, PAGE_SIZE, saveBlob } from '../components/ui.jsx';
import { count, dateTime, ago } from '../lib/format';

/**
 * API MONITOR (user, 2026-09-25, command center phase 5).
 *
 * The Government-records API, call by call: is it answering, how fast, how
 * often from cache, what it costs — per dataset (RC, challan, FASTag) — and
 * every call, filterable. WhatsApp's delivery lives on the WhatsApp page and
 * Razorpay's on Payments: their failures arrive as receipts and webhooks.
 */

const AXIS = { fontSize: 11, fill: '#6b8380' };
const TOOLTIP = { fontSize: 12, borderRadius: 8, border: '1px solid #e3ecea' };
const inr = (p) => `₹${(Number(p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const STATUS = {
  operational: ['Operational', 'good'], degraded: ['Degraded', 'watch'], down: ['Down', 'wrong'], idle: ['No calls', 'info'],
};
const NAMES = { rc: 'Registration (RC)', challan: 'Challans', fastag: 'FASTag', all: 'Cached answers' };

export default function ApiMonitor() {
  const [params, controls, key] = usePeriod('api', { defaultRange: '7d', withCompare: false });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [log, setLog] = useState(null);
  const [dataset, setDataset] = useState('');
  const [result, setResult] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try { setData(await api.apiMonitor(params)); setError(null); } catch (e) { setError(e); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadLog = useCallback(async () => {
    try { setLog(await api.apiLog({ ...params, dataset: dataset || undefined, result: result || undefined, q: q || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })); }
    catch (e) { setError(e); }
  }, [key, dataset, result, q, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [key, dataset, result, q]);
  useEffect(() => { const t = setTimeout(loadLog, q ? 300 : 0); return () => clearTimeout(t); }, [loadLog, q]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) load(); }, 60000); return () => clearInterval(t); }, [load]);

  const t = data?.totals;
  const [word, tone] = STATUS[t?.status] || STATUS.idle;
  const exportCsv = async () => {
    try {
      const day = (d) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
      const { blob, filename } = await api.exportCsv('api', { from: day(data.range.from), to: day(new Date(data.range.to) - 1) });
      saveBlob(blob, filename);
    } catch (e) { alert(e.message || 'Export failed.'); }
  };

  return (
    <Shell title="API monitor" subtitle={data ? `Government records · ${data.range.label}` : ' '}
      actions={<>{controls}<button className="btn-quiet !py-1.5 text-2xs" disabled={!data} onClick={exportCsv}>Export CSV</button></>}>
      {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <SkeletonCards n={8} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Hint note="Down: 20%+ of calls failed. Degraded: 5%+ failed, or the slowest 5% took over 8 seconds." className="block">
              <div className="card p-3">
                <div className="text-2xs uppercase tracking-wider text-muted">Status</div>
                <div className="mt-1"><Chip tone={tone}>{word}</Chip></div>
              </div>
            </Hint>
            <Box label="Calls" v={count(t.calls)} sub={`${t.cache_pct == null ? '—' : `${t.cache_pct}%`} from cache`} />
            <Box label="Error rate" v={t.error_pct == null ? 'No data' : `${t.error_pct}%`} sub={`${count(t.failed)} failed · ${count(t.timeouts)} timeouts`} bad={t.failed > 0} />
            <Box label="Average" v={t.avg_ms == null ? 'No data' : `${t.avg_ms} ms`} note="Live calls only; a cached answer takes no time." />
            <Box label="95th percentile" v={t.p95_ms == null ? 'No data' : `${t.p95_ms} ms`} note="95 calls in 100 were faster than this." />
            <Box label="Cost" v={inr(t.cost_paise)} note="At the per-call rates in Settings." />
            <Box label="Per paid report" v={t.cost_per_paid_paise == null ? 'No data' : inr(t.cost_per_paid_paise)} sub={`${count(t.paid_reports)} paid`} />
          </div>

          <div className="card mt-4">
            <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold text-ink">By dataset</h2></div>
            {!data.by_dataset.length ? <Empty>No calls in this period.</Empty> : (
              <Table head={<tr>{['Dataset', 'Calls', 'Found', 'Failed', 'Timeouts', 'Cached', 'Average', '95th pct', 'Slowest', 'Cost', 'Last success', 'Last failure'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {data.by_dataset.map((d) => (
                  <tr key={d.dataset} className="cursor-pointer hover:bg-shell/70" onClick={() => setDataset(d.dataset)} title="Show these calls in the log">
                    <td className="td text-sm text-ink">{NAMES[d.dataset] || d.dataset}</td>
                    <td className="td tabular">{count(d.calls)}</td>
                    <td className="td tabular">{count(d.found)}</td>
                    <td className={`td tabular ${d.failed ? 'text-wrong-700' : ''}`}>{count(d.failed)}</td>
                    <td className={`td tabular ${d.timeouts ? 'text-wrong-700' : ''}`}>{count(d.timeouts)}</td>
                    <td className="td tabular">{count(d.cached)}</td>
                    <td className="td tabular text-2xs">{d.avg_ms == null ? '—' : `${d.avg_ms} ms`}</td>
                    <td className="td tabular text-2xs">{d.p95_ms == null ? '—' : `${d.p95_ms} ms`}</td>
                    <td className="td tabular text-2xs">{d.max_ms == null ? '—' : `${d.max_ms} ms`}</td>
                    <td className="td tabular text-2xs">{inr(d.cost_paise)}</td>
                    <td className="td text-2xs text-muted">{d.last_ok ? ago(d.last_ok) : '—'}</td>
                    <td className="td text-2xs">
                      {d.last_failure ? <Hint note={d.last_error}><span className="text-wrong-700">{ago(d.last_failure)}</span></Hint> : <span className="text-muted">none</span>}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-ink">Calls by day</h2>
              <div className="mt-3 h-52">
                {!data.by_day.length ? <Empty>No calls.</Empty> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.by_day}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef3f2" vertical={false} />
                      <XAxis dataKey="day" tick={AXIS} tickFormatter={(d) => d.slice(5)} />
                      <YAxis tick={AXIS} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="found" name="Found" stackId="a" fill="#0d9488" />
                      <Bar dataKey="cached" name="Cached" stackId="a" fill="#99d5cf" />
                      <Bar dataKey="failed" name="Failed" stackId="a" fill="#d92d20" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-ink">Calls by hour of day, and speed by day</h2>
              <div className="mt-3 grid h-52 grid-rows-2 gap-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.by_hour}>
                    <XAxis dataKey="hour" tick={AXIS} interval={2} />
                    <Tooltip contentStyle={TOOLTIP} labelFormatter={(h) => `${h}:00`} />
                    <Bar dataKey="calls" name="Calls" fill="#0b4f4a" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.by_day}>
                    <XAxis dataKey="day" tick={AXIS} tickFormatter={(d) => d.slice(5)} />
                    <Tooltip contentStyle={TOOLTIP} formatter={(v) => `${v} ms`} />
                    <Line type="monotone" dataKey="avg_ms" name="Average" stroke="#e08700" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">API log {log ? <span className="font-normal text-muted">· {count(log.total)}</span> : null}</h2>
          <div className="flex flex-wrap gap-2">
            <input className="input !w-40 !py-1.5 text-sm" placeholder="Vehicle number" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input !w-auto !py-1.5 text-sm" value={dataset} onChange={(e) => setDataset(e.target.value)}>
              <option value="">Every dataset</option>{Object.entries(NAMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className="input !w-auto !py-1.5 text-sm" value={result} onChange={(e) => setResult(e.target.value)}>
              <option value="">Every result</option><option value="ok">Found</option><option value="cached">Cached</option>
              <option value="failed">Failed</option><option value="timeout">Timed out</option>
            </select>
          </div>
        </div>
        {!log ? <div className="p-4 text-sm text-muted">Loading…</div> : !log.rows.length ? <Empty>No calls match.</Empty> : (
          <>
            <Table head={<tr>{['When', 'Dataset', 'Request', 'Vehicle', 'Result', 'HTTP', 'Took', 'Cost', 'Error'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
              {log.rows.map((a) => (
                <tr key={a.id}>
                  <td className="td tabular text-2xs text-muted">{dateTime(a.created_at)}</td>
                  <td className="td text-2xs">{NAMES[a.dataset] || a.dataset}</td>
                  <td className="td text-2xs text-muted">{a.provider_path || '—'}</td>
                  <td className="td tabular text-2xs">{a.reg_no || '—'}</td>
                  <td className="td">{a.cache_hit ? <Chip tone="info">Cached</Chip> : a.ok ? <Chip tone="good">{a.outcome || 'OK'}</Chip> : <Chip tone="wrong">{a.outcome || 'Failed'}</Chip>}</td>
                  <td className="td tabular text-2xs">{a.http_status || '—'}</td>
                  <td className="td tabular text-2xs">{a.duration_ms == null ? '—' : `${a.duration_ms} ms`}</td>
                  <td className="td tabular text-2xs">{inr(a.cost_paise)}</td>
                  <td className="td text-2xs text-wrong-700">{a.error_message || a.error_code || ''}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={log.total} onPage={setPage} />
          </>
        )}
      </div>
    </Shell>
  );
}

function Box({ label, v, sub, note, bad = false }) {
  return (
    <Hint note={note} className="block">
      <div className="card p-3">
        <div className="text-2xs uppercase tracking-wider text-muted">{label}</div>
        <div className={`tabular mt-1 text-lg font-bold ${bad ? 'text-wrong-700' : 'text-ink'}`}>{v}</div>
        {sub && <div className="text-2xs text-muted">{sub}</div>}
      </div>
    </Hint>
  );
}
