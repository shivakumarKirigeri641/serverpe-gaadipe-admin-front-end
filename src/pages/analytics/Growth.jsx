import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { count } from '../../lib/format';
import { Hint } from '../../components/ui.jsx';
import { Chart, Delta, delta, inr, TOOLTIP, AXIS } from './kit.jsx';

/*
 * Today, this week, this month — each against the period before.
 *
 * TWO COMPARISONS, because one misleads. At 11am, today against the whole of
 * yesterday always looks like a collapse; against yesterday up to 11am it is
 * the truth. The chip compares like for like; the full previous period is in
 * the hover and in the table.
 */

const PERIODS = {
  day: { label: 'Today', prev: 'yesterday' },
  week: { label: 'This week', prev: 'last week' },
  month: { label: 'This month', prev: 'last month' },
};

/* [key, label, format, lowerIsBetter, what it means] */
const METRICS = [
  ['gross_paise', 'Revenue (gross)', inr, false, 'Every captured payment, GST included.'],
  ['take_home_paise', 'Take-home', inr, false, 'After GST, Razorpay fee and its GST, WhatsApp and SMS costs.'],
  ['payments', 'Payments', count, false, 'Reports paid for.'],
  ['avg_order_paise', 'Average order', inr, false, 'Gross divided by payments.'],
  ['conversion', 'Conversion', (v) => `${v}%`, false, 'Payments as a share of the people who checked a vehicle.'],
  ['checks', 'Vehicle checks', count, false, 'Every lookup made by a customer.'],
  ['active_users', 'People checking', count, false, 'Distinct customers who checked at least one vehicle.'],
  ['wa_chats', 'WhatsApp chats', count, false, 'Distinct people who messaged GaadiPe on WhatsApp.'],
  ['new_users', 'New customers', count, false, 'People who wrote to GaadiPe for the first time.'],
  ['new_vehicles', 'New vehicles', count, false, 'Vehicles GaadiPe had never seen before.'],
  ['reports', 'Reports issued', count, false, 'Full reports produced.'],
  ['abandoned', 'Abandoned payments', count, true, 'Payments started and not finished.'],
  ['feedback', 'Feedback', count, false, 'Messages sent through the feedback button.'],
  ['messaging_paise', 'Messaging cost', inr, true, 'WhatsApp templates and SMS codes.'],
];

export default function Growth({ data }) {
  const [period, setPeriod] = useState('day');
  const p = data[period];
  const cur = p.current; const same = p.previous_same_point; const full = p.previous_full;

  const chartKeys = ['checks', 'wa_chats', 'active_users', 'new_users', 'payments', 'reports'];
  const chart = chartKeys.map((k) => {
    const m = METRICS.find((x) => x[0] === k);
    return { name: m[1], [PERIODS[period].label]: cur[k], [`${PERIODS[period].prev} (same point)`]: same[k], [`${PERIODS[period].prev} (full)`]: full[k] };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(PERIODS).map(([k, v]) => (
          <button key={k} type="button" onClick={() => setPeriod(k)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${period === k ? 'bg-brand text-white' : 'border border-line bg-white text-muted hover:text-ink'}`}>
            {v.label}
          </button>
        ))}
        <span className="text-2xs text-muted">
          against {PERIODS[period].prev} to the same point ({Math.round(p.elapsed_fraction * 100)}% of the {period} gone) · hover a figure for the full {PERIODS[period].prev}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {METRICS.map(([key, label, fmt, lower, what], i) => (
          <Hint key={key} note={
            <span className="block space-y-0.5">
              <b className="block text-ink">{label}</b>
              <span className="block">{what}</span>
              <span className="block">{PERIODS[period].label}: <b>{fmt(cur[key])}</b></span>
              <span className="block">{PERIODS[period].prev}, same point: {fmt(same[key])} ({delta(cur[key], same[key]).label})</span>
              <span className="block">{PERIODS[period].prev}, in full: {fmt(full[key])} ({delta(cur[key], full[key]).label})</span>
            </span>
          }>
            <div className="card cv-rise cv-tile h-full px-4 py-3" style={{ animationDelay: `${i * 25}ms` }}>
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</div>
              <div className="tabular mt-1 text-xl font-semibold text-ink">{fmt(cur[key])}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Delta now={cur[key]} before={same[key]} lowerIsBetter={lower} />
                <span className="text-2xs text-muted">was {fmt(same[key])}</span>
              </div>
            </div>
          </Hint>
        ))}
      </div>

      <Chart title={`${PERIODS[period].label} against ${PERIODS[period].prev}`} note="Same point is the fair comparison while the period is still running." height={300}>
        <BarChart data={chart}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
          <XAxis dataKey="name" tick={AXIS} />
          <YAxis tick={AXIS} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey={PERIODS[period].label} fill="#0d9488" radius={[3, 3, 0, 0]} />
          <Bar dataKey={`${PERIODS[period].prev} (same point)`} fill="#94a3b8" radius={[3, 3, 0, 0]} />
          <Bar dataKey={`${PERIODS[period].prev} (full)`} fill="#dbe4e2" radius={[3, 3, 0, 0]} />
        </BarChart>
      </Chart>

      <div className="card cv-rise overflow-x-auto">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">Day, week and month side by side</h2>
          <p className="text-2xs text-muted">Each against the period before, to the same point. Hover a change for the full previous period.</p>
        </div>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-line bg-shell/60">
            <tr>
              <th className="th">Measure</th>
              {Object.values(PERIODS).map((v) => <th key={v.label} className="th" colSpan={2}>{v.label} · vs {v.prev}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {METRICS.map(([key, label, fmt, lower]) => (
              <tr key={key} className="hover:bg-shell/40">
                <td className="td font-medium text-ink">{label}</td>
                {Object.keys(PERIODS).map((k) => (
                  <FragmentCells key={k}>
                    <td className="td tabular">{fmt(data[k].current[key])} <span className="text-2xs text-muted">/ {fmt(data[k].previous_same_point[key])}</span></td>
                    <td className="td">
                      <Hint note={`Full ${PERIODS[k].prev}: ${fmt(data[k].previous_full[key])} (${delta(data[k].current[key], data[k].previous_full[key]).label})`}>
                        <Delta now={data[k].current[key]} before={data[k].previous_same_point[key]} lowerIsBetter={lower} />
                      </Hint>
                    </td>
                  </FragmentCells>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FragmentCells = ({ children }) => <>{children}</>;
