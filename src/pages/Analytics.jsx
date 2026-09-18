import { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { api } from '../lib/api';
import { rupees, count, date, percent } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Spinner, Failed, Hint, Empty } from '../components/ui.jsx';

/**
 * Day, week and month.
 *
 * THE FUNNEL IS AT THE TOP because it is the only chart that tells you what to
 * change. Everything else describes what happened; the funnel says where people
 * stop — and at this stage of the product, that is the whole question.
 *
 * Empty buckets are drawn, not skipped: a quiet Tuesday that disappears makes
 * the line lie about the shape of the week.
 */
const GRAINS = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
const SPAN = { day: 30, week: 120, month: 365 };

export default function Analytics() {
  const [grain, setGrain] = useState('day');
  const [series, setSeries] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [s, f] = await Promise.all([
        api.series({ grain, days: SPAN[grain] }),
        api.funnel({ days: 30 }),
      ]);
      setSeries(s); setFunnel(f);
    } catch (e) { setError(e); }
  }, [grain]);
  useEffect(() => { load(); }, [load]);

  const rows = (series?.rows || []).map((r) => ({
    ...r,
    label: grain === 'month' ? r.bucket.slice(0, 7) : r.bucket.slice(5),
    gross: r.gross_paise / 100,
    take_home: r.take_home_paise / 100,
  }));

  return (
    <Shell title="Analytics" subtitle="Checks, customers, revenue and where people stop"
      actions={
        <div className="flex gap-1">
          {Object.entries(GRAINS).map(([key, label]) => (
            <button key={key} onClick={() => setGrain(key)}
              className={`btn-quiet !px-3 !py-1.5 text-2xs ${grain === key ? '!border-brand !text-brand-deep' : ''}`}>
              {label}
            </button>
          ))}
        </div>
      }>

      {error ? <Failed error={error} onRetry={load} /> : !series ? <Spinner /> : (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-ink">The funnel, last 30 days</h2>
            <p className="text-2xs text-muted">
              Counted by people, not by events — somebody who sent four numbers is one person who got that far.
            </p>
            {!funnel?.steps?.[0]?.people ? (
              <Empty>Nobody has been through the flow in the last 30 days.</Empty>
            ) : (
              <div className="mt-4 space-y-2">
                {funnel.steps.map((s, i) => {
                  const prev = i ? funnel.steps[i - 1].people : s.people;
                  const dropped = prev - s.people;
                  return (
                    <div key={s.key}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-body">{s.label}</span>
                        <span className="tabular">
                          <b className="text-ink">{count(s.people)}</b>
                          <span className="ml-2 text-2xs text-muted">{s.of_first}% of all</span>
                        </span>
                      </div>
                      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-shell">
                        <div className="h-full rounded-full bg-brand transition-all"
                          style={{ width: `${s.of_first}%` }} />
                      </div>
                      {i > 0 && dropped > 0 && (
                        <div className="mt-0.5 text-2xs text-muted">
                          {count(dropped)} stopped here ({percent(dropped, prev)} of the step before)
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Chart title="People and checks"
            note="New customers, people who checked something, and the number of checks.">
            <AreaChart data={rows}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b8380' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b8380' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="checks" name="Checks" stroke="#0d9488" fill="url(#g1)" />
              <Area type="monotone" dataKey="active_users" name="People checking" stroke="#0f766e" fill="none" />
              <Area type="monotone" dataKey="new_users" name="New customers" stroke="#e08700" fill="none" />
            </AreaChart>
          </Chart>

          <Chart title="Money" note="Gross collected against what is left after GST and the gateway.">
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b8380' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b8380' }} />
              <Tooltip contentStyle={TOOLTIP} formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="gross" name="Gross ₹" fill="#0d9488" radius={[3, 3, 0, 0]} />
              <Bar dataKey="take_home" name="Take-home ₹" fill="#0b4f4a" radius={[3, 3, 0, 0]} />
            </BarChart>
          </Chart>

          <Chart title="Upstream" note="Live ULIP calls and messages sent. The gap between calls and checks is the cache doing its job.">
            <AreaChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b8380' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6b8380' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="ulip_calls" name="ULIP calls" stroke="#d92d20" fill="none" />
              <Area type="monotone" dataKey="messages" name="WhatsApp messages" stroke="#6b8380" fill="none" />
              <Area type="monotone" dataKey="reports" name="Reports sold" stroke="#0d9488" fill="none" />
            </AreaChart>
          </Chart>

          <div className="card overflow-x-auto">
            <div className="border-b border-line px-5 py-3">
              <h2 className="text-sm font-semibold text-ink">The same figures, as a table</h2>
            </div>
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-line bg-shell/60">
                <tr>
                  <th className="th">Period</th><th className="th">New</th><th className="th">Checks</th>
                  <th className="th">Reports</th><th className="th">Payments</th>
                  <th className="th">Gross</th><th className="th">Take-home</th><th className="th">ULIP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...rows].reverse().map((r) => (
                  <tr key={r.bucket}>
                    <td className="td">{grain === 'day' ? date(r.bucket) : r.bucket}</td>
                    <td className="td tabular">{count(r.new_users)}</td>
                    <td className="td tabular">{count(r.checks)}</td>
                    <td className="td tabular">{count(r.reports)}</td>
                    <td className="td tabular">{count(r.payments)}</td>
                    <td className="td tabular">{rupees(r.gross_paise)}</td>
                    <td className="td tabular">{rupees(r.take_home_paise)}</td>
                    <td className="td tabular">{count(r.ulip_calls)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Shell>
  );
}

const TOOLTIP = {
  borderRadius: 10, border: '1px solid #e3ecea', fontSize: 12,
  boxShadow: '0 12px 32px rgba(11,31,28,.12)',
};

const Chart = ({ title, note, children }) => (
  <div className="card p-5">
    <Hint note={note}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
    </Hint>
    <p className="mb-3 text-2xs text-muted">{note}</p>
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </div>
  </div>
);
