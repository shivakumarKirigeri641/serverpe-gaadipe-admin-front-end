import { useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import { count } from '../../lib/format';
import { SERIES, AXIS, GRID, anim, Card, Tip, Drill, People, Stats, drill, dayLabel, sumOf } from './kit.jsx';

/*
 * Customers: new and returning people per day; STOP and coming back; where new
 * people came from; why people said STOP. A click on a source or a reason
 * lists the people.
 */
export default function CustomersG({ data, days }) {
  const s = data.series;
  const [pick, setPick] = useState(null);
  const [people, setPeople] = useState(null);
  const open = (kind, value) => {
    setPick({ kind, value }); setPeople(null);
    drill('customers', { days, [kind]: value }).then((x) => setPeople(x.people)).catch(() => setPeople([]));
  };
  const xProps = { dataKey: 'd', tickFormatter: dayLabel, tick: AXIS, tickLine: false, axisLine: false, minTickGap: 16 };
  const sources = data.sources.map((x, i) => ({ ...x, fill: SERIES[i] || SERIES[7] }));
  const table = (cols) => ({ columns: [['d', 'Day', dayLabel], ...cols], rows: [...s].reverse() });

  return (
    <>
      <Stats items={[
        ['New', count(sumOf(s, 'new')), `in ${data.days} days`],
        ['Returning', count(Math.max(0, ...s.map((x) => x.returning))), 'busiest day'],
        ['Said STOP', count(sumOf(s, 'stops'))], ['Came back', count(sumOf(s, 'back'))],
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="New and returning people" note="Returning: people who joined earlier and did something that day."
          legend={[['New', SERIES[0]], ['Returning', SERIES[2]]]} table={table([['new', 'New'], ['returning', 'Returning']])}>
          <BarChart data={s} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={dayLabel} total="People" />} cursor={{ fill: '#f3f7f6' }} />
            <Bar dataKey="new" name="New" stackId="p" fill={SERIES[0]} stroke="#fff" strokeWidth={1} {...anim()} />
            <Bar dataKey="returning" name="Returning" stackId="p" fill={SERIES[2]} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} {...anim()} />
          </BarChart>
        </Card>
        <Card title="STOP and coming back" note="Replied STOP, and turned messages back on (START or Undo), per day."
          legend={[['Said STOP', SERIES[1]], ['Came back', SERIES[2]]]} table={table([['stops', 'Said STOP'], ['back', 'Came back']])}>
          <BarChart data={s} margin={{ top: 4, right: 8, left: -18, bottom: 0 }} barGap={2}>
            <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={dayLabel} />} cursor={{ fill: '#f3f7f6' }} />
            <Bar dataKey="stops" name="Said STOP" fill={SERIES[1]} radius={[4, 4, 0, 0]} {...anim()} />
            <Bar dataKey="back" name="Came back" fill={SERIES[2]} radius={[4, 4, 0, 0]} {...anim()} />
          </BarChart>
        </Card>
        <Card title="Where new people came from" note="New customers in the period by first source. Click a slice for the people."
          legend={sources.map((x) => [`${x.source} · ${count(x.n)}`, x.fill])}
          table={{ columns: [['source', 'Source'], ['n', 'People']], rows: sources }}>
          <PieChart>
            <Tooltip content={<Tip title={(_, p) => p?.[0]?.name} />} />
            <Pie data={sources} dataKey="n" nameKey="source" innerRadius="55%" outerRadius="85%" paddingAngle={1} stroke="#fff" strokeWidth={2}
              onClick={(x) => open('source', x.source)} className="cursor-pointer" {...anim()}>
              {sources.map((x) => <Cell key={x.source} fill={x.fill} />)}
            </Pie>
          </PieChart>
        </Card>
        <Card title="Why they said STOP" note="Answers to “May we ask why?” after STOP. Click a reason for the people."
          table={{ columns: [['reason', 'Reason'], ['n', 'People']], rows: data.reasons }}>
          {data.reasons.length ? (
            <BarChart data={data.reasons} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="reason" width={140} tick={{ ...AXIS, fill: '#0b1f1c' }} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip title={(l) => l} />} cursor={{ fill: '#f3f7f6' }} />
              <Bar dataKey="n" name="People" fill={SERIES[1]} maxBarSize={28} radius={[0, 4, 4, 0]} onClick={(x) => open('reason', x.reason)} className="cursor-pointer" {...anim()}>
                <LabelList dataKey="n" position="right" className="fill-ink text-2xs" />
              </Bar>
            </BarChart>
          ) : <div className="grid h-full place-items-center text-2xs text-muted">No STOP reasons in this period.</div>}
        </Card>
      </div>
      {pick && (
        <Drill title={pick.kind === 'source' ? `New from ${pick.value}` : `Said STOP: ${pick.value}`} onClose={() => setPick(null)} loading={!people}>
          <People rows={people} extra={pick.kind === 'reason' ? (p) => (p.said ? `“${p.said}”` : '') : undefined} />
        </Drill>
      )}
    </>
  );
}
