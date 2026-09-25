import { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { chartAnim } from '../../lib/motion.jsx';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Failed, SkeletonCards, Empty, Table, Hint } from '../../components/ui.jsx';
import { num, pct } from './common.jsx';

/**
 * PAYMENT FUNNEL & FAILURES (user, 2026-09-25) — from the payment page to
 * money received, what failed and why (as Razorpay said it), and when, on
 * what and from where payments succeed. A stage GaadiPe cannot see says so.
 */
export default function PaymentFailures() {
  const [params, controls, key] = usePeriod('pay-funnel', { defaultRange: '30d', withCompare: false });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.paymentFunnel(params)); } catch (e) { setError(e); } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const main = d?.stages.filter((s) => !s.side) || [];
  const side = d?.stages.filter((s) => s.side) || [];
  const top = Math.max(1, ...main.map((s) => s.n || 0));
  return (
    <Shell title="Payment funnel & failures" subtitle={d?.range.label || ' '} actions={controls}>
      {error && !d ? <div className="card"><Failed error={error} onRetry={load} /></div> : !d ? <SkeletonCards n={8} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[['Success rate', pct(d.success_rate), 'Payments completed ÷ payments started.'], ['Failure rate', pct(d.failure_rate), 'Started, failed at Razorpay and never paid ÷ started.'],
              ['Paid after a failure', num(d.recovered_after_failure), `Of ${d.had_failure} with a failed attempt, these paid on a later try.`], ['In progress now', num(d.in_progress), 'Started in the last 30 minutes.']].map(([l, v, n]) => (
              <Hint key={l} note={n}><div className="card px-4 py-3"><div className="text-2xs font-semibold uppercase tracking-wider text-muted">{l}</div><div className="tabular mt-1 text-xl font-semibold text-ink">{v}</div></div></Hint>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">The funnel</h2>
              {main.map((s) => (
                <Hint key={s.key} note={s.note}>
                  <div className="mb-2">
                    <div className="flex justify-between text-sm"><span>{s.label}</span><span className="tabular font-semibold">{s.n == null ? <span className="text-muted">Not recorded</span> : `${num(s.n)}${s.pct_of_started != null && s.key !== 'started' ? ` · ${s.pct_of_started}%` : ''}`}</span></div>
                    <div className="mt-1 h-2 rounded bg-shell"><div className="h-2 rounded bg-brand" style={{ width: `${((s.n || 0) / top) * 100}%` }} /></div>
                  </div>
                </Hint>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-2">
                {side.map((s) => (
                  <Hint key={s.key} note={s.note}><div className="rounded-lg border border-line px-3 py-2"><div className="text-2xs text-muted">{s.label}</div>
                    <div className="tabular text-sm font-semibold text-ink">{num(s.n)}{s.pct_of_started != null ? <span className="text-2xs text-muted"> · {s.pct_of_started}% of started</span> : null}</div></div></Hint>
                ))}
              </div>
            </div>
            <div className="card overflow-hidden">
              <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Failure reasons</div>
              {!d.reasons.length ? <Empty>No failed attempt reported by Razorpay in this period.</Empty> : (
                <Table head={<tr><th className="th">Reason</th><th className="th">Attempts</th></tr>}>
                  {d.reasons.map((r) => <tr key={r.label}><td className="td">{r.label}</td><td className="td tabular">{num(r.n)}</td></tr>)}
                </Table>
              )}
              <p className="px-4 py-2 text-2xs text-muted">Reasons are Razorpay’s own (error_reason), grouped. Reasons are recorded from this release on.</p>
            </div>
          </div>
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold text-ink">Payment conversion by hour (IST)</h2>
            {!d.by_hour.some((h) => h.started) ? <Empty>No data available.</Empty> : (
              <div className="h-56"><ResponsiveContainer>
                <BarChart data={d.by_hour.map((h) => ({ hour: `${h.hour}`, Started: h.started, Paid: h.success }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" /><XAxis dataKey="hour" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip />
                  <Bar {...chartAnim()} dataKey="Started" fill="#e3ecea" /><Bar {...chartAnim()} dataKey="Paid" fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer></div>
            )}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[['By device', d.by_device], ['By source', d.by_source]].map(([t, rows]) => (
              <div key={t} className="card overflow-hidden">
                <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">{t}</div>
                {!rows.length ? <Empty>No data available.</Empty> : (
                  <Table head={<tr>{['', 'Started', 'Paid', 'Success'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                    {rows.map((r) => <tr key={r.key}><td className="td">{r.key}</td><td className="td tabular">{num(r.started)}</td><td className="td tabular">{num(r.success)}</td><td className="td tabular">{pct(r.rate)}</td></tr>)}
                  </Table>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}
