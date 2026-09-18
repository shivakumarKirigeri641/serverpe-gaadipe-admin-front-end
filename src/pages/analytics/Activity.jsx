import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { count, date, percent } from '../../lib/format';
import { Hint, Empty } from '../../components/ui.jsx';
import { Chart, TOOLTIP, AXIS, inr } from './kit.jsx';

/*
 * How people use it: where they stop (the funnel), when they come (the
 * heatmap), and the volume underneath — checks, people, ULIP calls, messages.
 */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Activity({ rows, grain, funnel, heat }) {
  const max = heat?.max || 0;
  const byDay = (heat?.grid || []).map((r) => r.reduce((t, n) => t + n, 0));
  const byHour = Array.from({ length: 24 }, (_, h) => (heat?.grid || []).reduce((t, r) => t + r[h], 0));
  const busiestDay = byDay.indexOf(Math.max(...byDay, 0));
  const busiestHour = byHour.indexOf(Math.max(...byHour, 0));

  return (
    <div className="space-y-4">
      <div className="card cv-rise p-5">
        <h2 className="text-sm font-semibold text-ink">The funnel, last 30 days</h2>
        <p className="text-2xs text-muted">Counted by people, not by events — somebody who sent four numbers is one person who got that far.</p>
        {!funnel?.steps?.[0]?.people ? <Empty>Nobody has been through the flow in the last 30 days.</Empty> : (
          <div className="mt-4 space-y-2">
            {funnel.steps.map((s, i) => {
              const prev = i ? funnel.steps[i - 1].people : s.people;
              const dropped = prev - s.people;
              return (
                <div key={s.key}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-body">{s.label}</span>
                    <span className="tabular"><b className="text-ink">{count(s.people)}</b><span className="ml-2 text-2xs text-muted">{s.of_first}% of all</span></span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-shell">
                    <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${s.of_first}%` }} />
                  </div>
                  {i > 0 && dropped > 0 && (
                    <div className="mt-0.5 text-2xs text-muted">{count(dropped)} stopped here ({percent(dropped, prev)} of the step before)</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="card cv-rise p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-ink">When people check, last {heat?.days || 30} days</h2>
            <p className="text-2xs text-muted">Weekday by hour, IST. Darker is busier — the hours to be watching the panel, and the hours to deploy in.</p>
          </div>
          {max > 0 && <span className="text-2xs text-muted">Busiest: {DAYS[busiestDay]}s, around {String(busiestHour).padStart(2, '0')}:00</span>}
        </div>
        {!max ? <Empty>No checks in this period.</Empty> : (
          <div className="mt-4 overflow-x-auto">
            <div className="inline-grid min-w-[720px] gap-[3px]" style={{ gridTemplateColumns: '44px repeat(24, minmax(22px, 1fr)) 56px' }}>
              <span />
              {Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[10px] text-muted">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>)}
              <span className="text-right text-[10px] text-muted">total</span>
              {heat.grid.map((row, d) => (
                <FragmentRow key={d}>
                  <span className="self-center text-2xs font-semibold text-muted">{DAYS[d]}</span>
                  {row.map((n, h) => (
                    <Hint key={h} note={`${DAYS[d]} ${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59 · ${count(n)} check${n === 1 ? '' : 's'}`}>
                      <span className="block h-6 rounded-[4px] transition hover:ring-2 hover:ring-brand/40"
                        style={{ background: n ? `rgba(13,148,136,${0.12 + 0.88 * (n / max)})` : '#f3f8f7' }} />
                    </Hint>
                  ))}
                  <span className="self-center text-right text-2xs tabular text-body">{count(byDay[d])}</span>
                </FragmentRow>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Chart title="People and checks" note="New customers, people who checked something, and the number of checks.">
          <AreaChart data={rows}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="label" tick={AXIS} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="checks" name="Checks" stroke="#0d9488" fill="url(#g1)" />
            <Area type="monotone" dataKey="active_users" name="People checking" stroke="#0f766e" fill="none" />
            <Area type="monotone" dataKey="new_users" name="New customers" stroke="#e08700" fill="none" />
          </AreaChart>
        </Chart>

        <Chart title="Upstream" note="Live ULIP calls and messages sent. The gap between calls and checks is the cache doing its job.">
          <AreaChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="label" tick={AXIS} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="ulip_calls" name="ULIP calls" stroke="#d92d20" fill="none" />
            <Area type="monotone" dataKey="messages" name="WhatsApp messages" stroke="#6b8380" fill="none" />
            <Area type="monotone" dataKey="reports" name="Reports sold" stroke="#0d9488" fill="none" />
          </AreaChart>
        </Chart>
      </div>

      <div className="card cv-rise overflow-x-auto">
        <div className="border-b border-line px-5 py-3"><h2 className="text-sm font-semibold text-ink">The same figures, as a table</h2></div>
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="border-b border-line bg-shell/60">
            <tr>
              <th className="th">Period</th><th className="th">New</th><th className="th">Checks</th><th className="th">People</th>
              <th className="th">Reports</th><th className="th">Payments</th><th className="th">Gross</th><th className="th">Take-home</th><th className="th">ULIP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...rows].reverse().map((r) => (
              <tr key={r.bucket} className="hover:bg-shell/40">
                <td className="td">{grain === 'day' ? date(r.bucket) : r.bucket}</td>
                <td className="td tabular">{count(r.new_users)}</td>
                <td className="td tabular">{count(r.checks)}</td>
                <td className="td tabular">{count(r.active_users)}</td>
                <td className="td tabular">{count(r.reports)}</td>
                <td className="td tabular">{count(r.payments)}</td>
                <td className="td tabular">{inr(r.gross_paise)}</td>
                <td className="td tabular">{inr(r.take_home_paise)}</td>
                <td className="td tabular">{count(r.ulip_calls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FragmentRow = ({ children }) => <>{children}</>;
