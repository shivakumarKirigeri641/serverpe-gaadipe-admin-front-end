import { useState } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import { Link } from 'react-router-dom';
import { count, dateTime } from '../../lib/format';
import { AnimatedGauge } from '../../lib/motion.jsx';
import { SERIES, AXIS, GRID, anim, Card, Tip, Drill, People, Stats, Gauges, drill, dayLabel, sumOf } from './kit.jsx';

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
  // A day on the STOP chart (user, 2026-10-03): who said STOP, and who came back.
  const [stopDay, setStopDay] = useState(null);
  const [stopRows, setStopRows] = useState(null);
  const openStopDay = (e) => {
    const d = e?.activeLabel; if (!d) return;
    setStopDay(d); setStopRows(null);
    drill('customers', { days, day: d }).then(setStopRows).catch(() => setStopRows({ stopped: [], came_back: [] }));
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
      {(() => {
        const n = sumOf(s, 'new'); const st = sumOf(s, 'stops');
        const r = n ? Math.round((st / n) * 1000) / 10 : null;
        return (
          <Gauges>
            <AnimatedGauge label="STOP rate" value={r} max={20} danger="high" bands={[0.25, 0.5]}
              text={r == null ? null : `${r}%`} tone={r == null ? 'muted' : r >= 10 ? 'wrong' : r >= 5 ? 'watch' : 'good'}
              caption="Said STOP ÷ new customers, this period" />
          </Gauges>
        );
      })()}
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
        <Card title="STOP and coming back" note="Replied STOP, and turned messages back on (START or Undo), per day. Click a day for the people."
          legend={[['Said STOP', SERIES[1]], ['Came back', SERIES[2]]]} table={table([['stops', 'Said STOP'], ['back', 'Came back']])}>
          <BarChart data={s} onClick={openStopDay} margin={{ top: 4, right: 8, left: -18, bottom: 0 }} barGap={2}>
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
      {stopDay && (
        <Drill title={`${dayLabel(stopDay)} — STOP and coming back`} onClose={() => setStopDay(null)} loading={!stopRows}>
          <h4 className="text-2xs font-semibold uppercase tracking-wider text-muted">Said STOP · {stopRows?.stopped?.length || 0}</h4>
          <StopPeople rows={stopRows?.stopped} kind="stop" />
          <h4 className="mt-3 text-2xs font-semibold uppercase tracking-wider text-muted">Came back · {stopRows?.came_back?.length || 0}</h4>
          <StopPeople rows={stopRows?.came_back} kind="back" />
        </Drill>
      )}
      {pick && (
        <Drill title={pick.kind === 'source' ? `New from ${pick.value}` : `Said STOP: ${pick.value}`} onClose={() => setPick(null)} loading={!people}>
          <People rows={people} extra={pick.kind === 'reason' ? (p) => (p.said ? `“${p.said}”` : '') : undefined} />
        </Drill>
      )}
    </>
  );
}

/* The people in the STOP-day popup: who, when, why, how they came back, paid before, stopped now. */
function StopPeople({ rows, kind }) {
  if (!rows?.length) return <p className="text-2xs text-muted">Nobody.</p>;
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-line">
      <table className="w-full text-2xs">
        <thead className="sticky top-0 bg-shell text-left text-muted"><tr>
          <th className="px-3 py-1.5">Customer</th><th className="px-3 py-1.5">Time</th>
          <th className="px-3 py-1.5">{kind === 'stop' ? 'Why' : 'How · had stopped because'}</th>
          <th className="px-3 py-1.5">Paid before</th><th className="px-3 py-1.5">Now</th><th className="px-3 py-1.5" />
        </tr></thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} className="border-t border-line/60">
              <td className="px-3 py-1.5"><span className="text-ink">{p.name || 'Unknown'}</span> <span className="tabular text-muted">{p.masked}</span></td>
              <td className="px-3 py-1.5 text-muted">{dateTime(p.at)}</td>
              <td className="px-3 py-1.5 text-body">
                {kind === 'back' && <span className="mr-1 font-semibold text-ink">{p.undo ? 'Undo' : 'START'}</span>}
                {p.reason ? `${kind === 'back' ? '· ' : ''}${p.reason}` : <span className="text-muted">{kind === 'stop' ? 'no answer' : ''}</span>}
                {p.said && <span className="text-muted"> — “{p.said}”</span>}
              </td>
              <td className="px-3 py-1.5">{p.paid ? <b className="text-good-700">Yes ({p.paid})</b> : <span className="text-muted">No</span>}</td>
              <td className="px-3 py-1.5">{p.stopped_now ? <span className="font-semibold text-wrong-700">Stopped</span> : <span className="font-semibold text-good-700">Active</span>}</td>
              <td className="px-3 py-1.5 text-right"><Link className="text-brand hover:underline" to={`/journey?mobile=${p.mobile}`}>Journey →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
