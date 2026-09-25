import { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { chartAnim, legendToggle } from '../../lib/motion.jsx';
import { count } from '../../lib/format';
import { Hint } from '../../components/ui.jsx';
import { Chart, VehicleDrill, TOOLTIP, AXIS, GROUP_COLOURS, STATE_COLOURS, STATE_WORDS, PALETTE, inr } from './kit.jsx';

/*
 * Every vehicle GaadiPe knows, by kind. Each tile, slice and bar opens the
 * vehicles behind it underneath — the number and the list are one tap apart.
 */
export default function Fleet({ fleet }) {
  const [drill, setDrill] = useState(null);
  const show = (title, filter) => setDrill({ title, list: fleet.vehicles.filter(filter) });
  const total = fleet.total || 0;

  /* Built once per fleet: a new array per render replays recharts' animation. */
  const charts = useMemo(() => ({
    status: fleet.status.map((s) => ({ name: s.name, value: s.count })),
    fuel: fleet.fuel.map((s) => ({ name: s.name, value: s.count })),
  }), [fleet]);
  const { groupSlices, worstByGroup, challansByGroup } = useMemo(() => ({
    groupSlices: fleet.groups.filter((g) => g.total).map((g) => ({ name: g.label, key: g.key, value: g.total })),
    worstByGroup: fleet.groups.filter((g) => g.total).map((g) => ({ name: g.key === 'OT' ? 'Other' : g.key, key: g.key, ...g.worst })),
    challansByGroup: fleet.groups.filter((g) => g.total).map((g) => ({
    name: g.key === 'OT' ? 'Other' : g.key, key: g.key, vehicles: g.with_challans, amount: g.challans_amount_paise / 100,
  })),
  }), [fleet]);

  const pie = (title, note, data, onPick, colours) => (
    <Chart title={title} note={note} height={250}>
      <PieChart>
        <Pie {...chartAnim()} data={data} dataKey="value" nameKey="name" innerRadius="52%" outerRadius="82%" paddingAngle={2}
          onClick={(d) => onPick(d.payload || d)} cursor="pointer" isAnimationActive>
          {data.map((d, i) => <Cell key={d.name} fill={colours ? colours(d, i) : PALETTE[i % PALETTE.length]} />)}
        </Pie>
        <Tooltip contentStyle={TOOLTIP} formatter={(v, n) => [`${count(v)} · ${total ? Math.round((v / total) * 100) : 0}%`, n]} />
        <Legend {...legendToggle()} wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </Chart>
  );

  if (!total) {
    return <div className="card p-8 text-center text-sm text-muted">No vehicles checked yet — the fleet fills in as customers check vehicles.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <div className="card cv-rise cv-tile cursor-pointer px-4 py-3" onClick={() => show('Every vehicle', () => true)}>
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted">All vehicles</div>
          <div className="tabular mt-1 text-2xl font-semibold text-ink">{count(total)}</div>
          <div className="text-2xs text-muted">{count(fleet.vehicles.filter((v) => v.paid).length)} bought · {count(fleet.vehicles.filter((v) => v.watched).length)} monitored</div>
        </div>
        {fleet.groups.map((g, i) => (
          <Hint key={g.key} note={
            <span className="block space-y-0.5">
              <b className="block text-ink">{g.label}: {count(g.total)}</b>
              <span className="block">{count(g.active)} with an active RC</span>
              <span className="block">{count(g.paid)} reports bought · {count(g.watched)} monitored</span>
              <span className="block" style={{ color: STATE_COLOURS.expired }}>{count(g.worst.expired)} with a document expired</span>
              <span className="block" style={{ color: STATE_COLOURS.due }}>{count(g.worst.due)} with one expiring within 30 days</span>
              <span className="block">{count(g.with_challans)} with pending challans · {inr(g.challans_amount_paise)}</span>
            </span>
          }>
            <div className="card cv-rise cv-tile h-full cursor-pointer px-4 py-3" style={{ animationDelay: `${(i + 1) * 30}ms`, borderTop: `3px solid ${GROUP_COLOURS[g.key]}` }}
              onClick={() => show(g.label, (v) => v.group === g.key)}>
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{g.label}</div>
              <div className="tabular mt-1 text-2xl font-semibold text-ink">{count(g.total)}</div>
              <div className="text-2xs text-muted">{total ? Math.round((g.total / total) * 100) : 0}% · {count(g.active)} active</div>
              {(g.worst.expired > 0 || g.worst.due > 0) && (
                <div className="mt-1 flex gap-1">
                  {g.worst.expired > 0 && <span className="chip bg-wrong-50 text-wrong-700">{g.worst.expired} expired</span>}
                  {g.worst.due > 0 && <span className="chip bg-watch-50 text-watch-700">{g.worst.due} due</span>}
                </div>
              )}
            </div>
          </Hint>
        ))}
      </div>

      {drill && <VehicleDrill title={drill.title} list={drill.list} onClose={() => setDrill(null)} />}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {pie('By class', 'Tap a slice for its vehicles.', groupSlices,
          (d) => show(d.name, (v) => v.group === d.key), (d) => GROUP_COLOURS[d.key])}
        {pie('RC status', 'As VAHAN reports it.', charts.status,
          (d) => show(`RC status: ${d.name}`, (v) => statusWord(v.status) === d.name),
          (d, i) => (d.name === 'Active' ? '#12a150' : d.name === 'Not recorded' ? '#c9d6d4' : ['#d92d20', '#e08700', '#db2777', '#7c3aed'][i % 4]))}
        {pie('Fuel', 'Tap a slice for its vehicles.', charts.fuel,
          (d) => show(`Fuel: ${d.name}`, (v) => fuelWord(v.fuel) === d.name))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Chart title="Document health by class" note="Each vehicle counted once, by its worst document. Tap a bar.">
          <BarChart data={worstByGroup}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="name" tick={AXIS} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} />
            <Legend {...legendToggle()} wrapperStyle={{ fontSize: 11 }} />
            {['expired', 'due', 'valid', 'none'].map((s, i, all) => (
              <Bar {...chartAnim()} key={s} dataKey={s} name={STATE_WORDS[s]} stackId="a" fill={STATE_COLOURS[s]} cursor="pointer"
                radius={i === all.length - 1 ? [3, 3, 0, 0] : 0}
                onClick={(d) => show(`${d.name}: ${STATE_WORDS[s]}`, (v) => v.group === d.key && v.worst === s)} />
            ))}
          </BarChart>
        </Chart>

        <Chart title="Pending challans by class" note="Vehicles with challans, and the penalty they carry.">
          <BarChart data={challansByGroup}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="name" tick={AXIS} />
            <YAxis yAxisId="n" tick={AXIS} allowDecimals={false} />
            <YAxis yAxisId="a" orientation="right" tick={AXIS} tickFormatter={(v) => `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
            <Tooltip contentStyle={TOOLTIP} formatter={(v, n) => (n === 'Penalty' ? `₹${Number(v).toLocaleString('en-IN')}` : v)} />
            <Legend {...legendToggle()} wrapperStyle={{ fontSize: 11 }} />
            <Bar {...chartAnim()} yAxisId="n" dataKey="vehicles" name="Vehicles" fill="#0d9488" radius={[3, 3, 0, 0]} cursor="pointer"
              onClick={(d) => show(`${d.name} with pending challans`, (v) => v.group === d.key && v.challans_pending > 0)} />
            <Bar {...chartAnim()} yAxisId="a" dataKey="amount" name="Penalty" fill="#d92d20" radius={[3, 3, 0, 0]} />
          </BarChart>
        </Chart>

        <Chart title="Top makers" note="Tap a bar for that maker's vehicles." height={300}>
          <BarChart data={fleet.makers} layout="vertical" margin={{ left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis type="number" tick={AXIS} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={AXIS} width={130} />
            <Tooltip contentStyle={TOOLTIP} />
            <Bar {...chartAnim()} dataKey="count" name="Vehicles" fill="#0b4f4a" radius={[0, 3, 3, 0]} cursor="pointer"
              onClick={(d) => show(`Maker: ${d.name}`, (v) => (v.maker || '').toUpperCase().startsWith(String(d.name).toUpperCase()))} />
          </BarChart>
        </Chart>

        <Chart title="Age of vehicles" note="From the manufacturing date on the RC." height={300}>
          <BarChart data={fleet.age}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="name" tick={AXIS} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} />
            <Bar {...chartAnim()} dataKey="count" name="Vehicles" fill="#7c3aed" radius={[3, 3, 0, 0]} cursor="pointer"
              onClick={(d) => show(`Age ${d.name}`, (v) => ageBand(v.age_years) === d.name)} />
          </BarChart>
        </Chart>

        <Chart title="Registered in" note="State code of the registration.">
          <BarChart data={fleet.states}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="name" tick={AXIS} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} />
            <Bar {...chartAnim()} dataKey="count" name="Vehicles" fill="#2563eb" radius={[3, 3, 0, 0]} cursor="pointer"
              onClick={(d) => show(`Registered in ${d.name}`, (v) => v.state_code === d.name)} />
          </BarChart>
        </Chart>

        <Chart title="Emission norms" note="BS IV, BS VI and the rest.">
          <BarChart data={fleet.norms}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
            <XAxis dataKey="name" tick={AXIS} />
            <YAxis tick={AXIS} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP} />
            <Bar {...chartAnim()} dataKey="count" name="Vehicles" fill="#12a150" radius={[3, 3, 0, 0]} cursor="pointer"
              onClick={(d) => show(`Norms: ${d.name}`, (v) => (v.norms || 'Not recorded') === d.name)} />
          </BarChart>
        </Chart>
      </div>
    </div>
  );
}

/* The same words the server groups by, so a tapped slice finds its vehicles. */
const statusWord = (s) => (!s ? 'Not recorded' : /^active$/i.test(s) ? 'Active'
  : s.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w+/g, (w) => w.toLowerCase()));
const fuelWord = (f) => (!f ? 'Not recorded' : /petrol.*cng|cng.*petrol/i.test(f) ? 'Petrol/CNG'
  : /electric|battery|bov/i.test(f) ? 'Electric' : /hybrid/i.test(f) ? 'Hybrid'
  : f.replace(/\b\w+/g, (w) => w.charAt(0) + w.slice(1).toLowerCase()));
const ageBand = (a) => (a == null ? 'Not recorded' : a < 3 ? '0–2 yrs' : a < 6 ? '3–5 yrs' : a < 11 ? '6–10 yrs' : a < 16 ? '11–15 yrs' : '15+ yrs');
