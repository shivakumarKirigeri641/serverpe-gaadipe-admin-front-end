import { useState } from 'react';
import { BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Link } from 'react-router-dom';
import { dateTime, plate } from '../../lib/format';
import { AnimatedGauge } from '../../lib/motion.jsx';
import { SERIES, AXIS, GRID, anim, Card, Tip, Drill, Stats, Gauges, drill, dayLabel, rupeeAxis, inr, sumOf } from './kit.jsx';

/*
 * Money: where each day's revenue went — GST, the gateway's fee, the vehicle
 * APIs, WhatsApp, ads — and what was left. Stacked so the parts add up to the
 * revenue; a click on a day lists its payments.
 */
const PARTS = [
  ['left', 'Left with you', SERIES[2]],
  ['gst', 'GST', SERIES[0]],
  ['gateway', 'Gateway fee', SERIES[3]],
  ['api', 'Vehicle APIs', SERIES[1]],
  ['whatsapp', 'WhatsApp', SERIES[4]],
  ['ads', 'Ads', SERIES[6]],
];

export default function Money({ data }) {
  const s = data.series.map((r) => ({ ...r, left_pos: Math.max(0, r.left) }));
  const [day, setDay] = useState(null);
  const [rows, setRows] = useState(null);
  const open = (e) => {
    const d = e?.activeLabel; if (!d) return;
    setDay(d); setRows(null);
    drill('money', { day: d }).then((x) => setRows(x.payments)).catch(() => setRows([]));
  };
  const totals = Object.fromEntries(PARTS.map(([k]) => [k, sumOf(data.series, k)]));
  const gross = sumOf(data.series, 'gross');
  const pie = PARTS.map(([k, name, fill]) => ({ name, value: Math.max(0, totals[k]), fill })).filter((p) => p.value > 0);
  const xProps = { dataKey: 'd', tickFormatter: dayLabel, tick: AXIS, tickLine: false, axisLine: false, minTickGap: 16 };
  const table = { columns: [['d', 'Day', dayLabel], ['gross', 'Revenue', inr], ...PARTS.map(([k, l]) => [k, l, inr])], rows: [...data.series].reverse() };

  return (
    <>
      <Stats items={[
        ['Revenue', inr(gross), `${sumOf(data.series, 'payments')} payments`],
        ['Left with you', inr(totals.left), gross ? `${Math.round((totals.left / gross) * 100)}% of revenue` : ''],
        ['GST', inr(totals.gst)], ['Costs', inr(totals.gateway + totals.api + totals.whatsapp), 'gateway · APIs · WhatsApp'],
        ['Ads', inr(totals.ads)],
      ]} />
      {(() => {
        const m = gross ? Math.round((totals.left / gross) * 1000) / 10 : null;
        return (
          <Gauges>
            <AnimatedGauge label="Margin" value={m == null ? null : Math.max(0, m)} max={100} danger="low" bands={[0.5, 0.25]}
              text={m == null ? null : `${m}%`} tone={m == null ? 'muted' : m >= 50 ? 'good' : m >= 25 ? 'watch' : 'wrong'}
              caption="Left with you ÷ revenue, after GST, fees, APIs, WhatsApp and ads" />
          </Gauges>
        );
      })()}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Where each day's money went" note={`Stacked: the parts make the revenue. Click a day for its payments. ${data.note}`}
          legend={PARTS.map(([, l, c]) => [l, c])} table={table} height={300}>
          <BarChart data={s} onClick={open} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis tickFormatter={rupeeAxis} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip fmt={inr} title={(d, p) => {
              const r = p?.[0]?.payload || {};
              return `${dayLabel(d)} · revenue ${inr(r.gross)} · left ${inr(r.left)}`;
            }} />} cursor={{ fill: '#f3f7f6' }} />
            {PARTS.map(([k, l, c], i) => (
              <Bar key={k} dataKey={k === 'left' ? 'left_pos' : k} name={l} stackId="m" fill={c} stroke="#fff" strokeWidth={1}
                radius={i === PARTS.length - 1 ? [4, 4, 0, 0] : 0} {...anim()} />
            ))}
          </BarChart>
        </Card>
        <Card title="The period's split" note="Share of all revenue in the period." height={300}
          table={{ columns: [['name', 'Part'], ['value', 'Amount', inr]], rows: pie }}>
          <PieChart>
            <Tooltip content={<Tip fmt={inr} title={(_, p) => p?.[0]?.name} />} />
            <Pie data={pie} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={1} stroke="#fff" strokeWidth={2} {...anim()}>
              {pie.map((p) => <Cell key={p.name} fill={p.fill} />)}
            </Pie>
          </PieChart>
        </Card>
        <Card className="lg:col-span-3" title="Revenue and what is left" note="Revenue each day against what is left after GST, fees, APIs, WhatsApp and ads."
          legend={[['Revenue', SERIES[0]], ['Left with you', SERIES[2]]]} table={table} height={220}>
          <AreaChart data={data.series} onClick={open} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis tickFormatter={rupeeAxis} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={dayLabel} fmt={inr} />} cursor={{ stroke: '#c9d6d4' }} />
            <Area type="monotone" dataKey="gross" name="Revenue" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.12} {...anim()} />
            <Area type="monotone" dataKey="left" name="Left with you" stroke={SERIES[2]} strokeWidth={2} fill={SERIES[2]} fillOpacity={0.12} {...anim()} />
          </AreaChart>
        </Card>
      </div>
      {day && (
        <Drill title={`${dayLabel(day)} — payments`} onClose={() => setDay(null)} loading={!rows}>
          {!rows?.length ? <p className="text-2xs text-muted">No payments that day.</p> : (
            <div className="max-h-72 overflow-auto rounded-lg border border-line">
              <table className="w-full text-2xs"><tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-t border-line/60 first:border-0">
                    <td className="px-3 py-1.5 text-ink">{p.name || 'Unknown'}</td>
                    <td className="px-3 py-1.5 tabular text-muted">{p.masked}</td>
                    <td className="px-3 py-1.5 font-mono">{p.reg_no ? plate(p.reg_no) : '—'}</td>
                    <td className="px-3 py-1.5 tabular font-semibold text-ink">{inr(p.amount_paise)}</td>
                    <td className="px-3 py-1.5 text-muted">{dateTime(p.paid_at)}</td>
                    <td className="px-3 py-1.5 text-right"><Link className="text-brand hover:underline" to={`/journey?mobile=${p.mobile}`}>Journey →</Link></td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          )}
        </Drill>
      )}
    </>
  );
}
