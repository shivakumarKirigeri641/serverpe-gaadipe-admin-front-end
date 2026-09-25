import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Failed, SkeletonCards, Hint } from '../../components/ui.jsx';
import { dateTime } from '../../lib/format';
import { MetricCard, Change, rs, num, LEVEL } from './common.jsx';

/**
 * BUSINESS HEALTH (user, 2026-09-25) — the owner's first screen.
 *
 * Today's Summary on top: today's numbers, three conversions, today against
 * yesterday to the same hour, the services and the open alerts. Under it every
 * business figure for any period against the one before. Every figure opens
 * the screen with its rows. The figures are the server's: the counts are the
 * Command Center's, the money the ledger's.
 */
export default function BusinessHealth() {
  const [params, controls, key] = usePeriod('business', { defaultRange: 'today' });
  const [sum, setSum] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const loadSummary = useCallback(async () => { try { setSum(await api.businessSummary()); } catch { /* the rest still shows */ } }, []);
  const load = useCallback(async () => { try { setError(null); setData(await api.businessHealth(params)); } catch (e) { setError(e); } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(loadSummary, 30000);
  useAutoRefresh(load, 60000);

  return (
    <Shell title="Business Health" subtitle={data ? `${data.range.label}${data.compare ? ` · ${data.compare.label}` : ''}` : ' '} actions={controls}>
      <TodaySummary s={sum} />

      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink">{data?.range.label || 'The period'} in full</h2>
      {error && !data ? <div className="card"><Failed error={error} onRetry={load} /></div> : !data ? <SkeletonCards n={12} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {data.metrics.map((m, i) => <MetricCard key={m.key} period={{ label: data.range.label, compare: data.compare?.label }}
              m={m.key === 'net' ? { ...m, formula: 'Revenue (GST incl.)\n− GST\n− refunds (net of GST)\n− gateway fee + its GST\n− vehicle API cost\n− WhatsApp & SMS cost\n= Net contribution\n(no referral rewards: no programme)' } : m}
              delay={Math.min(4, Math.floor(i / 5) + 1)} />)}
            <div className="card px-4 py-3">
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted">Contribution margin</div>
              <div className="tabular mt-1 text-2xl font-semibold text-ink">{data.margin_pct == null ? '—' : `${data.margin_pct}%`}</div>
              <div className="text-2xs text-muted">{data.previous_margin_pct == null ? 'No previous-period data' : `was ${data.previous_margin_pct}%`}</div>
            </div>
          </div>
          <p className="mt-2 text-2xs text-muted">
            {data.free_reports ? `${data.free_reports} free report(s) are in the costs but not in revenue. ` : ''}
            {data.fees_estimated ? `${data.fees_estimated} payment(s) have an estimated gateway fee — Razorpay has not given it yet. ` : ''}
            {data.referral}
          </p>
        </>
      )}
    </Shell>
  );
}

function TodaySummary({ s }) {
  if (!s) return <div className="card h-64 skeleton" />;
  const t = s.today;
  const row = (label, value, to) => (
    <Link to={to} className="flex items-baseline justify-between gap-3 rounded px-1 py-0.5 hover:bg-shell">
      <span className="text-sm text-body">{label}</span><span className="tabular text-sm font-semibold text-ink">{value}</span>
    </Link>
  );
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-brand/5 px-4 py-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-brand-deep">Today’s summary</h2>
        <span className="text-2xs text-muted">as of {dateTime(s.at)}</span>
      </div>
      <div className="grid divide-y divide-line md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-5">
        <div className="p-4">
          <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Today</div>
          {row('Visitors', num(t.visitors), '/journey')}
          {row('Vehicle searches', num(t.searches), '/lookups')}
          {row('WhatsApp chats', num(t.conversations), '/whatsapp')}
          {row('Reports', num(t.reports), '/documents')}
          {row('Paid reports', num(t.paid), '/profitability?tab=transactions&range=today')}
        </div>
        <div className="p-4">
          <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Money</div>
          {row('Revenue', rs(t.revenue), '/profitability?range=today')}
          {row('GST', rs(t.gst), '/finance')}
          {row('Gateway cost', rs(t.gateway_cost), '/profitability?range=today')}
          {row('API cost', rs(t.api_cost), '/api-monitor')}
          {row('Messaging cost', rs(t.whatsapp_cost), '/whatsapp')}
          <div className="mt-1 border-t border-line pt-1">{row('Net contribution', rs(t.net), '/profitability?range=today')}</div>
        </div>
        <div className="p-4">
          <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Conversion</div>
          {s.conversion.map((c) => (
            <Hint key={c.label} note={`${c.note} ${num(c.to)} of ${num(c.from)}.`}>
              <div className="flex items-baseline justify-between gap-3 px-1 py-0.5">
                <span className="text-sm text-body">{c.label}</span>
                <span className="tabular text-sm font-semibold text-ink">{c.pct == null ? <span className="text-muted">No data</span> : `${c.pct}%`}</span>
              </div>
            </Hint>
          ))}
          <p className="mt-1 px-1 text-2xs text-muted">Referral is not measured: GaadiPe has no referral programme for now.</p>
        </div>
        <div className="p-4">
          <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Comparison</div>
          {s.comparison.map((c) => (
            <div key={c.key} className="flex items-baseline justify-between gap-3 px-1 py-0.5">
              <span className="text-sm text-body">{c.label}</span>
              <Change m={c} compact />
            </div>
          ))}
          <p className="mt-1 px-1 text-2xs text-muted">{s.compare_label}</p>
        </div>
        <div className="p-4">
          <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">System</div>
          {!s.system ? <p className="text-sm text-muted">No data available</p> : s.system.map((x) => {
            const [mark, tone, word] = LEVEL[x.level] || LEVEL.unknown;
            return (
              <Hint key={x.key} note={`${word}: ${x.message}`}>
                <Link to="/health" className="flex items-baseline justify-between gap-3 rounded px-1 py-0.5 hover:bg-shell">
                  <span className="text-sm text-body">{x.name}</span><span className={`text-sm font-bold ${tone}`}>{mark}</span>
                </Link>
              </Hint>
            );
          })}
          <Link to="/alerts" className="mt-2 block rounded-lg border border-line px-2 py-1.5 text-sm hover:bg-shell">
            <span className="text-2xs font-semibold uppercase tracking-wider text-muted">Alerts </span>
            <span className={s.alerts.critical ? 'font-semibold text-wrong-700' : 'text-body'}>{s.alerts.critical} critical</span>
            <span className="text-muted"> · </span>
            <span className={s.alerts.warning ? 'font-semibold text-watch-700' : 'text-body'}>{s.alerts.warning} warning{s.alerts.warning === 1 ? '' : 's'}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
