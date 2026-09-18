import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { count } from '../../lib/format';
import { Hint } from '../../components/ui.jsx';
import { Chart, VehicleDrill, TOOLTIP, AXIS, STATE_COLOURS, STATE_WORDS, DOC_COLOURS, GROUP_COLOURS } from './kit.jsx';

/*
 * Documents: which have lapsed, which are about to, across every vehicle —
 * filtered by class, every cell a tap away from the vehicles behind it.
 *
 * This is the monitoring product seen from above: every "expiring" cell is an
 * alert someone is about to receive, and every "expired" one is a reason a
 * buyer should have checked.
 */
const DOCS = [['insurance', 'Insurance'], ['pucc', 'PUC'], ['fitness', 'Fitness'], ['tax', 'Road tax'], ['permit', 'Permit'], ['registration', 'Registration']];
const STATES = ['expired', 'due', 'valid', 'none'];

export default function Expiry({ fleet }) {
  const [group, setGroup] = useState('all');
  const [drill, setDrill] = useState(null);
  const inGroup = (v) => group === 'all' || v.group === group;
  const list = useMemo(() => fleet.vehicles.filter(inGroup), [fleet, group]); // eslint-disable-line react-hooks/exhaustive-deps

  const cell = (doc, state) => list.filter((v) => v.docs[doc].state === state);
  const open = (doc, docLabel, state) => setDrill({
    title: `${docLabel}: ${STATE_WORDS[state]}${group === 'all' ? '' : ` · ${group}`}`,
    list: cell(doc, state), doc,
  });

  /* Chart data is built once per class, not per render: a new array makes
     recharts replay its animation, so opening a list would redraw every chart. */
  const { perDoc, worst, upcoming, lapsed, byClass } = useMemo(() => {
  const perDoc = DOCS.map(([key, label]) => ({ key, name: label, ...Object.fromEntries(STATES.map((s) => [s, list.filter((v) => v.docs[key].state === s).length])) }));
  const worst = Object.fromEntries(STATES.map((s) => [s, list.filter((v) => v.worst === s).length]));

  /* The next 12 weeks and the lapsed bands, recounted for the class chosen. */
  const upcoming = Array.from({ length: 12 }, (_, i) => ({ week: i, label: i === 0 ? 'This week' : `+${i}w` }));
  const bands = [['≤ 30 days', 30], ['1–3 months', 91], ['3–6 months', 182], ['6–12 months', 365], ['1 year +', Infinity]];
  const lapsed = bands.map(([label]) => ({ label }));
  for (const v of list) {
    for (const [key] of DOCS) {
      const d = v.docs[key].days;
      if (d == null) continue;
      if (d >= 0 && d < 84) { const w = upcoming[Math.floor(d / 7)]; w[key] = (w[key] || 0) + 1; }
      if (d < 0) { const i = bands.findIndex(([, max]) => -d <= max); lapsed[i][key] = (lapsed[i][key] || 0) + 1; }
    }
  }
  const byClass = fleet.groups.filter((g) => g.total).map((g) => ({
    name: g.key === 'OT' ? 'Other' : g.key,
    ...Object.fromEntries(DOCS.map(([k]) => [k, (g.docs[k].expired || 0) + (g.docs[k].due || 0)])),
  }));
  return { perDoc, worst, upcoming, lapsed, byClass };
  }, [list, fleet]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {[['all', 'All classes'], ...fleet.groups.filter((g) => g.total).map((g) => [g.key, g.label])].map(([k, label]) => (
          <button key={k} type="button" onClick={() => { setGroup(k); setDrill(null); }}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${group === k ? 'text-white' : 'border border-line bg-white text-muted hover:text-ink'}`}
            style={group === k ? { background: k === 'all' ? '#0f766e' : GROUP_COLOURS[k] } : undefined}>
            {label}
          </button>
        ))}
        <span className="text-2xs text-muted">{count(list.length)} vehicles · "expiring" means within {fleet.soon_days} days</span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATES.map((s, i) => (
          <div key={s} className="card cv-rise cv-tile cursor-pointer px-4 py-3" style={{ animationDelay: `${i * 30}ms`, borderTop: `3px solid ${STATE_COLOURS[s]}` }}
            onClick={() => setDrill({ title: `Vehicles whose worst document is: ${STATE_WORDS[s]}`, list: list.filter((v) => v.worst === s) })}>
            <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{s === 'valid' ? 'All documents valid' : s === 'none' ? 'Nothing recorded' : `With a document ${s === 'due' ? 'expiring' : 'expired'}`}</div>
            <div className="tabular mt-1 text-2xl font-semibold" style={{ color: s === 'none' ? '#6b8380' : STATE_COLOURS[s] }}>{count(worst[s])}</div>
            <div className="text-2xs text-muted">{list.length ? Math.round((worst[s] / list.length) * 100) : 0}% of vehicles</div>
          </div>
        ))}
      </div>

      <div className="card cv-rise overflow-x-auto">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">Every document, every state</h2>
          <p className="text-2xs text-muted">Tap a number for the vehicles behind it; hover for the share.</p>
        </div>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-shell/60">
            <tr>
              <th className="th">Document</th>
              {STATES.map((s) => <th key={s} className="th"><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: STATE_COLOURS[s] }} />{STATE_WORDS[s]}</th>)}
              <th className="th">Share lapsed or lapsing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {perDoc.map((d) => {
              const recorded = d.expired + d.due + d.valid;
              const risky = recorded ? Math.round(((d.expired + d.due) / recorded) * 100) : 0;
              return (
                <tr key={d.key} className="hover:bg-shell/40">
                  <td className="td font-semibold text-ink">{d.name}</td>
                  {STATES.map((s) => (
                    <td key={s} className="td">
                      <Hint note={`${count(d[s])} of ${count(list.length)} vehicles (${list.length ? Math.round((d[s] / list.length) * 100) : 0}%) — ${d.name.toLowerCase()} ${STATE_WORDS[s].toLowerCase()}. Tap for the list.`}>
                        <button type="button" disabled={!d[s]} onClick={() => open(d.key, d.name, s)}
                          className={`tabular min-w-[3rem] rounded-md px-2.5 py-1 text-sm font-semibold transition ${d[s] ? 'hover:shadow-pop' : 'opacity-40'}`}
                          style={{ background: `${STATE_COLOURS[s]}1a`, color: s === 'none' ? '#6b8380' : STATE_COLOURS[s] }}>
                          {count(d[s])}
                        </button>
                      </Hint>
                    </td>
                  ))}
                  <td className="td">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-shell">
                        <div className="h-full rounded-full" style={{ width: `${risky}%`, background: risky > 30 ? STATE_COLOURS.expired : STATE_COLOURS.due }} />
                      </div>
                      <span className="tabular text-2xs text-muted">{risky}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {drill && <VehicleDrill title={drill.title} list={drill.list} doc={drill.doc} onClose={() => setDrill(null)} />}

      <div className="grid gap-4 xl:grid-cols-2">
        <Chart title="Documents by state" note="Tap a segment for its vehicles.">
          <BarChart data={perDoc}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="name" tick={AXIS} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {STATES.map((s, i) => (
              <Bar key={s} dataKey={s} name={STATE_WORDS[s]} stackId="a" fill={STATE_COLOURS[s]} cursor="pointer"
                radius={i === STATES.length - 1 ? [3, 3, 0, 0] : 0} onClick={(d) => open(d.key, d.name, s)} />
            ))}
          </BarChart>
        </Chart>

        <Chart title="Coming due, next 12 weeks" note="Documents by the week they lapse — the alerts that are about to go out.">
          <BarChart data={upcoming}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="label" tick={AXIS} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {DOCS.map(([k, label], i) => (
              <Bar key={k} dataKey={k} name={label} stackId="a" fill={DOC_COLOURS[k]} radius={i === DOCS.length - 1 ? [3, 3, 0, 0] : 0} cursor="pointer"
                onClick={(d) => setDrill({ title: `${label} lapsing ${d.week === 0 ? 'this week' : `in week +${d.week}`}`, doc: k,
                  list: list.filter((v) => { const x = v.docs[k].days; return x != null && x >= d.week * 7 && x < d.week * 7 + 7; }) })} />
            ))}
          </BarChart>
        </Chart>

        <Chart title="How long ago they lapsed" note="Expired documents by time since expiry. Old lapses are rarely an oversight.">
          <BarChart data={lapsed}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="label" tick={AXIS} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {DOCS.map(([k, label], i) => (
              <Bar key={k} dataKey={k} name={label} stackId="a" fill={DOC_COLOURS[k]} radius={i === DOCS.length - 1 ? [3, 3, 0, 0] : 0} />
            ))}
          </BarChart>
        </Chart>

        <Chart title="Expired and expiring, by class" note="Documents, not vehicles — one vehicle can count several times.">
          <BarChart data={byClass}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="name" tick={AXIS} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {DOCS.map(([k, label], i) => (
              <Bar key={k} dataKey={k} name={label} stackId="a" fill={DOC_COLOURS[k]} radius={i === DOCS.length - 1 ? [3, 3, 0, 0] : 0} />
            ))}
          </BarChart>
        </Chart>
      </div>
    </div>
  );
}
