import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { chartAnim, legendToggle } from '../lib/motion.jsx';
import { api } from '../lib/api';
import Shell from '../components/Shell.jsx';
import { usePeriod } from '../components/Period.jsx';
import { Hint, Failed, SkeletonCards, Empty, Table, Chip, Pager, PAGE_SIZE, saveBlob } from '../components/ui.jsx';
import { count, dateTime, mobile as fmtMobile } from '../lib/format';

/**
 * VEHICLE LOOKUPS (user, 2026-09-25, command center phase 4).
 *
 * Every time someone asked about a vehicle: found or not, how fast and costly
 * the Government records were, where the vehicles are registered (state and
 * RTO, from the number itself), what they are — and the lookups themselves,
 * searchable, each showing whether it became a report and a payment.
 * Fleet and Expiry (Analytics) cover the vehicles as they stand; this is the
 * asking.
 */

const AXIS = { fontSize: 11, fill: '#6b8380' };
const TOOLTIP = { fontSize: 12, borderRadius: 8, border: '1px solid #e3ecea' };
const inr = (p) => `₹${(Number(p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function Lookups() {
  const navigate = useNavigate();
  const [params, controls, key] = usePeriod('lookups', { defaultRange: '30d', withCompare: false });
  const [sum, setSum] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [result, setResult] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const loadSum = useCallback(async () => {
    try { setSum(await api.lookupsSummary(params)); setError(null); } catch (e) { setError(e); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadRows = useCallback(async () => {
    try {
      setRows(await api.lookups({ ...params, q: q || undefined, result: result || undefined,
                                  limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }));
    } catch (e) { setError(e); }
  }, [key, q, result, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setSum(null); loadSum(); }, [loadSum]);
  useEffect(() => { setPage(1); }, [key, q, result]);
  useEffect(() => { const t = setTimeout(loadRows, q ? 300 : 0); return () => clearTimeout(t); }, [loadRows, q]);

  const t = sum?.totals;
  const exportCsv = async () => {
    setExporting(true);
    try {
      const day = (d) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
      const { blob, filename } = await api.exportCsv('searches', { from: day(sum.range.from), to: day(new Date(sum.range.to) - 1) });
      saveBlob(blob, filename);
    } catch (e) { alert(e.message || 'Export failed.'); }
    setExporting(false);
  };

  return (
    <Shell title="Vehicle lookups" subtitle={sum ? sum.range.label : ' '}
      actions={<>{controls}<button className="btn-quiet !py-1.5 text-2xs" disabled={!sum || exporting} onClick={exportCsv}>{exporting ? 'Exporting…' : 'Export CSV'}</button></>}>
      {error && !sum ? <Failed error={error} onRetry={loadSum} /> : !sum ? <SkeletonCards n={8} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Box label="Lookups" v={count(t.searches)} note="Times someone asked about a vehicle and got an answer." />
            <Box label="Different vehicles" v={count(t.vehicles)} note="Distinct registration numbers looked up." />
            <Box label="Found" v={`${t.success_pct == null ? '—' : `${t.success_pct}%`}`} sub={`${count(t.found)} found · ${count(t.failed)} not`} note="Share of lookups where the Government records had the vehicle." />
            <Box label="API speed" v={t.api.avg_ms == null ? 'No data' : `${t.api.avg_ms} ms`} sub={t.api.p95_ms == null ? '' : `95% under ${t.api.p95_ms} ms`} note="Average and 95th-percentile time of live Government-records calls (cached answers excluded)." />
            <Box label="API calls" v={count(t.api.calls)} sub={`${count(t.api.cached)} from cache · ${count(t.api.failed)} failed`} note="Every call to the records provider; a cached answer costs nothing." />
            <Box label="API cost" v={inr(t.api.cost_paise)} sub={t.paid ? `${inr(Math.round(t.api.cost_paise / t.paid))} per paid report` : ''} note="What the records calls cost, at the rates in Settings." />
            <Box label="Reports" v={count(t.reports)} sub={`${count(t.paid)} paid · ${count(t.delivered)} delivered`} note="Full reports generated, payments completed and reports delivered in the period." />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <div className="card p-4 xl:col-span-2">
              <h2 className="text-sm font-semibold text-ink">Found and not found, by day</h2>
              <div className="mt-3 h-52">
                {!sum.by_day.length ? <Empty>No lookups in this period.</Empty> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sum.by_day}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef3f2" vertical={false} />
                      <XAxis dataKey="day" tick={AXIS} tickFormatter={(d) => d.slice(5)} />
                      <YAxis tick={AXIS} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP} />
                      <Legend {...legendToggle()} wrapperStyle={{ fontSize: 11 }} />
                      <Bar {...chartAnim()} dataKey="found" name="Found" stackId="a" fill="#0d9488" />
                      <Bar {...chartAnim()} dataKey="failed" name="Not found" stackId="a" fill="#d92d20" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <Breakdown title="By state" note="From the registration number, not where the person is." rows={sum.by_state} onPick={(n) => setQ(n)} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Breakdown title="Top RTOs" rows={sum.by_rto} onPick={(n) => setQ(n)} />
            <Breakdown title="Vehicle type" rows={sum.by_class} />
            <Breakdown title="Manufacturer" rows={sum.by_maker} onPick={(n) => setQ(n)} />
          </div>
        </>
      )}

      {/* ─────────────────────────────── every lookup ── */}
      <div className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Every lookup {rows ? <span className="font-normal text-muted">· {count(rows.total)}</span> : null}</h2>
          <div className="flex gap-2">
            <input className="input !w-56 !py-1.5 text-sm" placeholder="Plate, RTO, maker or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input !w-auto !py-1.5 text-sm" value={result} onChange={(e) => setResult(e.target.value)}>
              <option value="">Found or not</option><option value="found">Found</option><option value="failed">Not found</option>
            </select>
          </div>
        </div>
        {!rows ? <div className="p-4 text-sm text-muted">Loading…</div> : !rows.rows.length ? <Empty>No lookups match.</Empty> : (
          <>
            <Table head={<tr>{['When', 'Vehicle', 'What it is', 'Who', 'Result', 'Report', 'Payment'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
              {rows.rows.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-shell/70" onClick={() => r.mobile && navigate(`/journey?mobile=${r.mobile}`)}
                  title="Open this person's journey">
                  <td className="td tabular text-2xs text-muted">{dateTime(r.occurred_at)}</td>
                  <td className="td"><div className="tabular text-sm font-semibold text-ink">{r.reg_no}</div><div className="text-2xs text-muted">{r.rto} · {r.channel}</div></td>
                  <td className="td text-2xs">{[r.maker && r.maker.split(' ')[0], r.model].filter(Boolean).join(' ') || '—'}<div className="text-muted">{[r.fuel, r.vehicle_class].filter(Boolean).join(' · ')}</div></td>
                  <td className="td text-2xs">{r.person_name && <div className="font-semibold text-ink">{r.person_name}</div>}<div className="text-muted">{r.mobile ? fmtMobile(r.mobile) : '—'}</div></td>
                  <td className="td">{r.name === 'vehicle_search_success' ? <Chip tone="good">Found</Chip> : <Chip tone="wrong">{r.error_code === 'not_found' ? 'Not found' : 'Failed'}</Chip>}</td>
                  <td className="td text-2xs">{r.has_report ? 'Full report' : 'Basic'}</td>
                  <td className="td text-2xs">{r.payment_status === 'paid' ? <span className="text-good-700">Paid {inr(r.paid_paise)}</span> : r.payment_status ? r.payment_status : '—'}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={rows.total} onPage={setPage} />
          </>
        )}
      </div>
    </Shell>
  );
}

function Box({ label, v, sub, note }) {
  return (
    <Hint note={note} className="block">
      <div className="card p-3">
        <div className="text-2xs uppercase tracking-wider text-muted">{label}</div>
        <div className="tabular mt-1 text-lg font-bold text-ink">{v}</div>
        {sub && <div className="text-2xs text-muted">{sub}</div>}
      </div>
    </Hint>
  );
}

function Breakdown({ title, note, rows, onPick }) {
  const most = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card p-4">
      <Hint note={note}><h2 className="text-sm font-semibold text-ink">{title}</h2></Hint>
      {!rows.length ? <p className="mt-2 text-2xs text-muted">No data</p> : (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.name} className={`flex items-center gap-2 text-2xs ${onPick ? 'cursor-pointer hover:text-ink' : ''}`} onClick={() => onPick?.(r.name)}>
              <span className="w-28 shrink-0 truncate text-body">{r.name}</span>
              <span className="h-2 flex-1 rounded bg-shell"><span className="block h-2 rounded bg-brand/70" style={{ width: `${r.count / most * 100}%` }} /></span>
              <span className="tabular w-8 text-right text-ink">{count(r.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
