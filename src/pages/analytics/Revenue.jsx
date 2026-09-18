import {
  ComposedChart, AreaChart, Area, BarChart, Bar, Line, LineChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
} from 'recharts';
import { count, date } from '../../lib/format';
import { Chart, Delta, inr, TOOLTIP, AXIS, rupeeAxis } from './kit.jsx';

/*
 * Money over time: what came in, what was left, where the rest went, and
 * whether each period grew on the one before it.
 */
export default function Revenue({ rows, grain }) {
  let running = 0;
  const data = rows.map((r, i) => {
    const prev = rows[i - 1];
    running += r.take_home_paise;
    const growth = prev && prev.gross_paise ? Math.round(((r.gross_paise - prev.gross_paise) / prev.gross_paise) * 1000) / 10 : null;
    return {
      ...r,
      gross: r.gross_paise / 100,
      take_home: r.take_home_paise / 100,
      gst: r.gst_paise / 100,
      gateway: (r.gateway_fee_paise + r.gateway_fee_gst_paise) / 100,
      messaging: ((r.whatsapp_cost_paise || 0) + (r.sms_cost_paise || 0)) / 100,
      cumulative: running / 100,
      growth,
      aov: r.payments ? r.gross_paise / r.payments / 100 : 0,
      conversion: r.active_users ? Math.round((r.payments / r.active_users) * 1000) / 10 : 0,
    };
  });

  const totals = rows.reduce((t, r) => ({
    gross: t.gross + r.gross_paise, take: t.take + r.take_home_paise, pay: t.pay + r.payments,
  }), { gross: 0, take: 0, pay: 0 });
  const half = Math.floor(rows.length / 2);
  const firstHalf = rows.slice(0, half).reduce((t, r) => t + r.gross_paise, 0);
  const secondHalf = rows.slice(half).reduce((t, r) => t + r.gross_paise, 0);
  const best = rows.reduce((b, r) => (r.gross_paise > (b?.gross_paise || 0) ? r : b), null);
  const unit = { day: 'day', week: 'week', month: 'month' }[grain];
  const money = (v) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Gross in range', inr(totals.gross)],
          ['Take-home in range', inr(totals.take)],
          ['Payments', count(totals.pay)],
          ['Average per ' + unit, inr(rows.length ? totals.gross / rows.length : 0)],
          ['Best ' + unit, best ? `${inr(best.gross_paise)} · ${grain === 'day' ? date(best.bucket) : best.bucket}` : '—'],
        ].map(([k, v], i) => (
          <div key={k} className="card cv-rise cv-tile px-4 py-3" style={{ animationDelay: `${i * 30}ms` }}>
            <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{k}</div>
            <div className="tabular mt-1 text-lg font-semibold text-ink">{v}</div>
          </div>
        ))}
      </div>
      <p className="text-2xs text-muted">
        Second half of the range against the first: <Delta now={secondHalf} before={firstHalf} /> ({inr(secondHalf)} against {inr(firstHalf)}).
      </p>

      <Chart title={`Revenue and growth, ${unit} by ${unit}`} note={`Bars: gross and take-home. Line: change in gross on the ${unit} before.`} height={300}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
          <XAxis dataKey="label" tick={AXIS} />
          <YAxis yAxisId="r" tick={AXIS} tickFormatter={rupeeAxis} />
          <YAxis yAxisId="g" orientation="right" tick={AXIS} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={TOOLTIP} formatter={(v, n) => (n === 'Growth %' ? (v == null ? '—' : `${v}%`) : money(v))} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <ReferenceLine yAxisId="g" y={0} stroke="#c9d6d4" />
          <Bar yAxisId="r" dataKey="gross" name="Gross" fill="#0d9488" radius={[3, 3, 0, 0]} />
          <Bar yAxisId="r" dataKey="take_home" name="Take-home" fill="#0b4f4a" radius={[3, 3, 0, 0]} />
          <Line yAxisId="g" type="monotone" dataKey="growth" name="Growth %" stroke="#e08700" strokeWidth={2} dot={{ r: 2 }} connectNulls />
        </ComposedChart>
      </Chart>

      <div className="grid gap-4 xl:grid-cols-2">
        <Chart title="Where each rupee went" note="Gross split into take-home, GST, Razorpay (fee + GST) and messaging.">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="label" tick={AXIS} />
            <YAxis tick={AXIS} tickFormatter={rupeeAxis} />
            <Tooltip contentStyle={TOOLTIP} formatter={(v) => money(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="take_home" name="Take-home" stackId="a" fill="#0b4f4a" />
            <Bar dataKey="gst" name="GST" stackId="a" fill="#94a3b8" />
            <Bar dataKey="gateway" name="Razorpay" stackId="a" fill="#e08700" />
            <Bar dataKey="messaging" name="WhatsApp + SMS" stackId="a" fill="#d92d20" radius={[3, 3, 0, 0]} />
          </BarChart>
        </Chart>

        <Chart title="Take-home, cumulative" note="Running total across the range.">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="cum" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0b4f4a" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0b4f4a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="label" tick={AXIS} />
            <YAxis tick={AXIS} tickFormatter={rupeeAxis} />
            <Tooltip contentStyle={TOOLTIP} formatter={(v) => money(v)} />
            <Area type="monotone" dataKey="cumulative" name="Take-home so far" stroke="#0b4f4a" fill="url(#cum)" strokeWidth={2} />
          </AreaChart>
        </Chart>

        <Chart title="Payments and conversion" note="Payments per period, and payments as a share of the people who checked.">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="label" tick={AXIS} />
            <YAxis yAxisId="n" tick={AXIS} allowDecimals={false} />
            <YAxis yAxisId="p" orientation="right" tick={AXIS} tickFormatter={(v) => `${v}%`} />
            <Tooltip contentStyle={TOOLTIP} formatter={(v, n) => (n === 'Conversion' ? `${v}%` : v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="n" dataKey="payments" name="Payments" fill="#0d9488" radius={[3, 3, 0, 0]} />
            <Line yAxisId="p" type="monotone" dataKey="conversion" name="Conversion" stroke="#7c3aed" strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </Chart>

        <Chart title="Average order value" note="Gross per payment. Flat at ₹19 while there is one product.">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="label" tick={AXIS} />
            <YAxis tick={AXIS} tickFormatter={(v) => `₹${v}`} />
            <Tooltip contentStyle={TOOLTIP} formatter={(v) => money(v)} />
            <Line type="monotone" dataKey="aov" name="Average order" stroke="#0d9488" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </Chart>
      </div>

      <div className="card cv-rise overflow-x-auto">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">Period by period</h2>
        </div>
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line bg-shell/60">
            <tr>
              <th className="th">Period</th><th className="th">Payments</th><th className="th">Gross</th><th className="th">Growth</th>
              <th className="th">GST</th><th className="th">Razorpay</th><th className="th">Messaging</th><th className="th">Take-home</th><th className="th">Conversion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...rows].reverse().map((r, i, all) => {
              const prev = all[i + 1];
              return (
                <tr key={r.bucket} className="hover:bg-shell/40">
                  <td className="td">{grain === 'day' ? date(r.bucket) : r.bucket}</td>
                  <td className="td tabular">{count(r.payments)}</td>
                  <td className="td tabular">{inr(r.gross_paise)}</td>
                  <td className="td">{prev ? <Delta now={r.gross_paise} before={prev.gross_paise} /> : '—'}</td>
                  <td className="td tabular text-muted">{inr(r.gst_paise)}</td>
                  <td className="td tabular text-muted">{inr(r.gateway_fee_paise + r.gateway_fee_gst_paise)}</td>
                  <td className="td tabular text-muted">{inr((r.whatsapp_cost_paise || 0) + (r.sms_cost_paise || 0))}</td>
                  <td className="td tabular font-semibold">{inr(r.take_home_paise)}</td>
                  <td className="td tabular">{r.active_users ? `${Math.round((r.payments / r.active_users) * 1000) / 10}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
