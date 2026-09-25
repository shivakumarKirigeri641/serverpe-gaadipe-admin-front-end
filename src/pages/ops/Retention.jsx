import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Failed, SkeletonCards, Empty, Table, Hint, Chip } from '../../components/ui.jsx';
import { rs, num, pct } from './common.jsx';

/**
 * RETENTION & REPEAT USAGE (user, 2026-09-25) — new against returning,
 * repeat searches and purchases, coming back after 1, 7 and 30 days, and
 * weekly cohorts by first activity. Real counts only: a cohort too small to
 * read a rate from is marked, never filled in.
 */
export default function Retention() {
  const [params, controls, key] = usePeriod('retention', { defaultRange: '30d', withCompare: false });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.retention(params)); } catch (e) { setError(e); } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const tile = (l, v, n) => <Hint key={l} note={n}><div className="card px-4 py-3"><div className="text-2xs font-semibold uppercase tracking-wider text-muted">{l}</div><div className="tabular mt-1 text-xl font-semibold text-ink">{v}</div></div></Hint>;
  return (
    <Shell title="Retention & repeat usage" subtitle={d?.range.label || ' '} actions={controls}>
      {error && !d ? <div className="card"><Failed error={error} onRetry={load} /></div> : !d ? <SkeletonCards n={8} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {tile('Active customers', num(d.active), 'Customers with any activity in the period.')}
            {tile('New', num(d.new_customers), 'First seen in the period.')}
            {tile('Returning', num(d.returning_customers), 'First seen before the period, active in it.')}
            {tile('Repeat customer rate', pct(d.repeat_customer_rate), 'Returning ÷ active.')}
            {tile('Repeat vehicle searches', num(d.repeat_searchers), 'Customers with two or more lookups in the period.')}
            {tile('Repeat purchase rate', pct(d.repeat_purchase_rate), 'Paying customers with two or more purchases ÷ paying customers.')}
            {tile('Reports per customer', d.avg_reports_per_customer ?? '—', 'Reports ÷ active customers.')}
            {tile('Revenue per paying customer', d.avg_revenue_per_customer_paise == null ? '—' : rs(d.avg_revenue_per_customer_paise), 'Lifetime revenue ÷ paying customers active in the period.')}
          </div>
          <div className="card p-4">
            <h2 className="text-sm font-semibold text-ink">Came back after…</h2>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {[['1 day', d.returned_after.d1], ['7 days', d.returned_after.d7], ['30 days', d.returned_after.d30]].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-line px-3 py-2"><div className="text-2xs text-muted">{l}</div>
                  <div className="tabular text-lg font-semibold text-ink">{num(v)} <span className="text-2xs text-muted">{d.active ? `${Math.round((v / d.active) * 100)}%` : ''}</span></div></div>
              ))}
            </div>
            <p className="mt-2 text-2xs text-muted">{d.notes.returned}</p>
          </div>
          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Weekly cohorts (first activity, last 12 weeks)</div>
            {!d.cohorts.length ? <Empty>No data available — no customer was first seen in the last 12 weeks.</Empty> : (
              <Table head={<tr>{['Week of', 'Customers', 'First purchase', 'Repeat purchase', 'Back after 7 days', 'Revenue', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
                {d.cohorts.map((c) => (
                  <tr key={c.week}>
                    <td className="td">{c.week}</td><td className="td tabular">{num(c.customers)}</td>
                    <td className="td tabular">{num(c.first_purchase)}{!c.small && <span className="text-2xs text-muted"> · {Math.round((c.first_purchase / c.customers) * 100)}%</span>}</td>
                    <td className="td tabular">{num(c.repeat_purchase)}</td><td className="td tabular">{num(c.returned_7d)}</td><td className="td tabular">{rs(c.revenue_paise)}</td>
                    <td className="td">{c.small && <Chip note={d.notes.small}>Too few to read a rate</Chip>}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
