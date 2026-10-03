import { useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import { count, dateTime } from '../../lib/format';
import { AnimatedGauge } from '../../lib/motion.jsx';
import { SERIES, STATUS, AXIS, GRID, anim, Card, Tip, Drill, Stats, Gauges, drill, dayLabel, rupeeAxis, inr, sumOf } from './kit.jsx';

/*
 * Services: each outside API's calls in the period — answered and failed —
 * how fast it answers, its calls per day, and what the paid RC backup cost.
 * A click on a provider lists its errors.
 */
export default function Services({ data, days }) {
  const providers = data.providers.map((p, i) => ({ ...p, colour: SERIES[i] || SERIES[7] }));
  const [pick, setPick] = useState(null);
  const [errors, setErrors] = useState(null);
  const open = (p) => {
    if (!p?.provider) return;
    setPick(p.provider); setErrors(null);
    drill('services', { days, provider: p.provider }).then((x) => setErrors(x.errors)).catch(() => setErrors([]));
  };
  const xProps = { dataKey: 'd', tickFormatter: dayLabel, tick: AXIS, tickLine: false, axisLine: false, minTickGap: 16 };
  const rate = (p) => (p.ok + p.failed ? `${Math.round((p.ok / (p.ok + p.failed)) * 1000) / 10}%` : '—');

  return (
    <>
      <Stats items={[
        ['API calls', count(sumOf(providers, 'ok') + sumOf(providers, 'failed')), `in ${data.days} days`],
        ['Failed', count(sumOf(providers, 'failed'))],
        ['RC backup spend', inr(sumOf(data.series, 'backup_paise'))],
      ]} />
      {data.backup_today && (
        <Gauges>
          <AnimatedGauge label="RC backup today" value={data.backup_today.used} max={data.backup_today.limit || 200} danger="high" bands={[0.7, 0.9]}
            text={`${data.backup_today.used}/${data.backup_today.limit}`}
            tone={data.backup_today.used >= (data.backup_today.limit || 200) * 0.9 ? 'wrong' : data.backup_today.used >= (data.backup_today.limit || 200) * 0.7 ? 'watch' : 'good'}
            caption="Paid calls used today, of the daily limit" />
        </Gauges>
      )}
      {!providers.length ? <div className="card p-6 text-center text-sm text-muted">No API calls recorded in this period.</div> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Calls answered and failed" note={`By provider. Click one for its errors. ${data.note}`}
            legend={[['Answered', STATUS.ok], ['Failed', STATUS.failed]]} height={Math.max(180, providers.length * 44)}
            table={{ columns: [['provider', 'Provider'], ['ok', 'Answered'], ['failed', 'Failed'], ['rate', 'Success', (_, p) => rate(p)], ['ms', 'Avg ms']], rows: providers }}>
            <BarChart data={providers} layout="vertical" margin={{ top: 4, right: 50, left: 10, bottom: 0 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis type="category" dataKey="provider" width={100} tick={{ ...AXIS, fill: '#0b1f1c' }} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip title={(l) => l} total="All calls" />} cursor={{ fill: '#f3f7f6' }} />
              <Bar dataKey="ok" name="Answered" stackId="s" fill={STATUS.ok} stroke="#fff" strokeWidth={1} onClick={open} className="cursor-pointer" {...anim()} />
              <Bar dataKey="failed" name="Failed" stackId="s" fill={STATUS.failed} radius={[0, 4, 4, 0]} onClick={open} className="cursor-pointer" {...anim()}>
                <LabelList valueAccessor={(e) => rate(e.payload || e)} position="right" className="fill-ink text-2xs" />
              </Bar>
            </BarChart>
          </Card>
          <Card title="How fast each answers" note="Average time of an answered call, in milliseconds."
            height={Math.max(180, providers.length * 44)}
            table={{ columns: [['provider', 'Provider'], ['ms', 'Avg ms']], rows: providers }}>
            <BarChart data={providers} layout="vertical" margin={{ top: 4, right: 60, left: 10, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="provider" width={100} tick={{ ...AXIS, fill: '#0b1f1c' }} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip title={(l) => l} fmt={(v) => `${count(v)} ms`} />} cursor={{ fill: '#f3f7f6' }} />
              <Bar dataKey="ms" name="Average" fill={SERIES[0]} radius={[0, 4, 4, 0]} onClick={open} className="cursor-pointer" {...anim()}>
                <LabelList dataKey="ms" position="right" className="fill-ink text-2xs" formatter={(v) => (v == null ? '' : `${count(v)} ms`)} />
              </Bar>
            </BarChart>
          </Card>
          <Card title="Answered calls per day" note="Each provider's answered calls, day by day."
            legend={providers.map((p) => [p.provider, p.colour])}
            table={{ columns: [['d', 'Day', dayLabel], ...providers.map((p) => [`${p.provider}|ok`, p.provider, (v) => v || 0])], rows: [...data.series].reverse() }}>
            <LineChart data={data.series} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip title={dayLabel} />} cursor={{ stroke: '#c9d6d4' }} />
              {providers.map((p) => (
                <Line key={p.provider} type="monotone" dataKey={(r) => r[`${p.provider}|ok`] || 0} name={p.provider} stroke={p.colour} strokeWidth={2} dot={false} activeDot={{ r: 5 }} {...anim()} />
              ))}
            </LineChart>
          </Card>
          <Card title="RC backup spend" note="What the paid RC backup cost each day — used only when ULIP's VAHAN failed."
            table={{ columns: [['d', 'Day', dayLabel], ['backup_paise', 'Spend', inr]], rows: [...data.series].reverse() }}>
            <BarChart data={data.series} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
              <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis tickFormatter={rupeeAxis} tick={AXIS} tickLine={false} axisLine={false} />
              <Tooltip content={<Tip title={dayLabel} fmt={inr} />} cursor={{ fill: '#f3f7f6' }} />
              <Bar dataKey="backup_paise" name="RC backup" fill={SERIES[1]} radius={[4, 4, 0, 0]} {...anim()} />
            </BarChart>
          </Card>
        </div>
      )}
      {pick && (
        <Drill title={`${pick} — errors`} onClose={() => setPick(null)} loading={!errors}>
          {!errors?.length ? <p className="text-2xs text-muted">No failed calls recorded for {pick} in this period.</p> : (
            <div className="max-h-72 overflow-auto rounded-lg border border-line">
              <table className="w-full text-2xs"><tbody>
                {errors.map((e) => (
                  <tr key={e.code} className="border-t border-line/60 first:border-0">
                    <td className="px-3 py-1.5 font-mono text-ink">{e.code}</td>
                    <td className="px-3 py-1.5 tabular font-semibold text-ink">{count(e.n)}×</td>
                    <td className="px-3 py-1.5 text-muted">last {dateTime(e.last)}</td>
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
