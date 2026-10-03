import { useState } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { count } from '../../lib/format';
import { AnimatedGauge } from '../../lib/motion.jsx';
import { SERIES, AXIS, GRID, anim, Card, Tip, Drill, Stats, Gauges, drill, dayLabel, rupeeAxis, inr, sumOf } from './kit.jsx';

/* Overview: four daily series; a click on any day opens that day by the hour. */
export default function Overview({ data }) {
  const s = data.series;
  const [day, setDay] = useState(null);
  const [hours, setHours] = useState(null);
  const open = (e) => {
    const d = e?.activeLabel;
    if (!d) return;
    setDay(d); setHours(null);
    drill('overview', { day: d }).then((x) => setHours(x.hours)).catch(() => setHours([]));
  };
  const xProps = { dataKey: 'd', tickFormatter: dayLabel, tick: AXIS, tickLine: false, axisLine: false, minTickGap: 16 };
  const dayTitle = (d) => dayLabel(d);
  const table = (cols) => ({ columns: [['d', 'Day', dayLabel], ...cols], rows: [...s].reverse() });

  return (
    <>
      <Stats items={[
        ['New customers', count(sumOf(s, 'customers')), `in ${data.days} days`],
        ['Vehicle checks', count(sumOf(s, 'checks_distinct') + sumOf(s, 'checks_repeat')), `${count(sumOf(s, 'checks_distinct'))} distinct`],
        ['Full reports', count(sumOf(s, 'reports')), 'paid'],
        ['Revenue', inr(sumOf(s, 'revenue_paise')), 'incl. GST'],
      ]} />
      {data.pace && (() => {
        const top = Math.max(10, Math.ceil(Math.max(data.pace.best_hour, data.pace.last_hour) / 10) * 10);
        return (
          <Gauges>
            <AnimatedGauge label="Check speed" value={data.pace.last_hour} max={top} danger="high" bands={[1, 1]}
              text={`${data.pace.last_hour}/h`} caption={`Checks in the last hour · best hour ${data.pace.best_hour}`} />
          </Gauges>
        );
      })()}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="New customers" note="People using GaadiPe for the first time, per day. Click a day for its hours."
          table={table([['customers', 'New customers']])}>
          <AreaChart data={s} onClick={open} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <defs><linearGradient id="gNew" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={SERIES[0]} stopOpacity={0.3} /><stop offset="1" stopColor={SERIES[0]} stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={dayTitle} />} cursor={{ stroke: '#c9d6d4' }} />
            <Area type="monotone" dataKey="customers" name="New customers" stroke={SERIES[0]} strokeWidth={2} fill="url(#gNew)" activeDot={{ r: 5 }} {...anim()} />
          </AreaChart>
        </Card>
        <Card title="Vehicle checks" note="Every check — distinct vehicles and repeats, stacked. Click a day for its hours."
          legend={[['Distinct', SERIES[0]], ['Repeat', SERIES[1]]]}
          table={table([['checks_distinct', 'Distinct'], ['checks_repeat', 'Repeat']])}>
          <BarChart data={s} onClick={open} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={dayTitle} total="All checks" />} cursor={{ fill: '#f3f7f6' }} />
            <Bar dataKey="checks_distinct" name="Distinct" stackId="c" fill={SERIES[0]} stroke="#fff" strokeWidth={1} {...anim()} />
            <Bar dataKey="checks_repeat" name="Repeat" stackId="c" fill={SERIES[1]} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} {...anim()} />
          </BarChart>
        </Card>
        <Card title="Full reports bought" note="Paid full reports, per day. Click a day for its hours." table={table([['reports', 'Full reports']])}>
          <BarChart data={s} onClick={open} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={dayTitle} />} cursor={{ fill: '#f3f7f6' }} />
            <Bar dataKey="reports" name="Full reports" fill={SERIES[2]} radius={[4, 4, 0, 0]} {...anim()} />
          </BarChart>
        </Card>
        <Card title="Revenue" note="Money received per day, GST included. Click a day for its hours."
          table={table([['revenue_paise', 'Revenue', inr]])}>
          <LineChart data={s} onClick={open} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis tickFormatter={rupeeAxis} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={dayTitle} fmt={inr} />} cursor={{ stroke: '#c9d6d4' }} />
            <Line type="monotone" dataKey="revenue_paise" name="Revenue" stroke={SERIES[6]} strokeWidth={2} dot={false} activeDot={{ r: 5 }} {...anim()} />
          </LineChart>
        </Card>
      </div>

      {day && (
        <Drill title={`${dayLabel(day)} — hour by hour`} onClose={() => setDay(null)} loading={!hours}>
          <Card title="Hour by hour" note="Customers, checks and reports in each hour (IST)."
            legend={[['New customers', SERIES[0]], ['Checks', SERIES[1]], ['Full reports', SERIES[2]]]}
            table={{ columns: [['h', 'Hour', (h) => `${String(h).padStart(2, '0')}:00`], ['customers', 'Customers'], ['checks', 'Checks'], ['reports', 'Reports']], rows: hours || [] }}
            height={220}>
            <BarChart data={hours || []} margin={{ top: 4, right: 8, left: -18, bottom: 0 }} barGap={2}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="h" tickFormatter={(h) => `${h}h`} tick={AXIS} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip title={(h) => `${String(h).padStart(2, '0')}:00 – ${String(h).padStart(2, '0')}:59`} />} cursor={{ fill: '#f3f7f6' }} />
              <Bar dataKey="customers" name="New customers" fill={SERIES[0]} radius={[4, 4, 0, 0]} {...anim()} />
              <Bar dataKey="checks" name="Checks" fill={SERIES[1]} radius={[4, 4, 0, 0]} {...anim()} />
              <Bar dataKey="reports" name="Full reports" fill={SERIES[2]} radius={[4, 4, 0, 0]} {...anim()} />
            </BarChart>
          </Card>
        </Drill>
      )}
    </>
  );
}
