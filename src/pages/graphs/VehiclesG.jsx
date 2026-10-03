import { useState } from 'react';
import { BarChart, Bar, Treemap, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import { Link } from 'react-router-dom';
import { count, plate, dateTime } from '../../lib/format';
import { SERIES, AXIS, GRID, anim, Card, Tip, Drill, Stats, drill, sumOf } from './kit.jsx';

/*
 * Vehicles: checks by state — a click opens that state's RTOs, a click on an
 * RTO its vehicles (two levels down); what kind of vehicles are checked (type,
 * fuel, make as a treemap); and the documents expiring in the next 12 months.
 */
const DOCS = [['Insurance', SERIES[0]], ['PUC', SERIES[1]], ['Road tax', SERIES[2]], ['Fitness', SERIES[6]]];
const KINDS = [['classes', 'Vehicle type'], ['fuels', 'Fuel'], ['makers', 'Make']];

export default function VehiclesG({ data, days }) {
  const [state, setState] = useState(null);
  const [rtos, setRtos] = useState(null);
  const [rto, setRto] = useState(null);
  const [vehicles, setVehicles] = useState(null);
  const [kind, setKind] = useState('classes');
  const openState = (s) => {
    if (!s?.code) return;
    setState(s); setRtos(null); setRto(null);
    drill('vehicles', { days, state: s.code }).then((x) => setRtos(x.rtos)).catch(() => setRtos([]));
  };
  const openRto = (r) => {
    if (!r?.code) return;
    setRto(r); setVehicles(null);
    drill('vehicles', { days, rto: r.code }).then((x) => setVehicles(x.vehicles)).catch(() => setVehicles([]));
  };
  const states = data.states.slice(0, 15);
  // Seven named, the rest folded into "Other" — colours are never reused.
  const all = data[kind] || [];
  const tree = [
    ...all.slice(0, 7).map((x, i) => ({ ...x, fill: SERIES[i] })),
    ...(all.length > 7 ? [{ name: 'Other', value: all.slice(7).reduce((a, x) => a + x.value, 0), fill: '#94a3b8' }] : []),
  ];
  const month = (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

  const Cellish = (props) => {
    const { x, y, width, height, name, value, fill } = props;
    if (width < 2 || height < 2) return null;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={2} rx={4} />
        {width > 60 && height > 28 && (
          <text x={x + 8} y={y + 18} fill="#fff" fontSize={11} fontWeight={600}>{String(name).slice(0, Math.floor(width / 7))}</text>
        )}
        {width > 60 && height > 44 && <text x={x + 8} y={y + 33} fill="#fff" fontSize={11} opacity={0.9}>{count(value)}</text>}
      </g>
    );
  };

  return (
    <>
      <Stats items={[
        ['Checks', count(sumOf(data.states, 'checks')), `in ${data.days} days`],
        ['Different vehicles', count(sumOf(data.states, 'vehicles'))],
        ['States', count(data.states.length)],
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Checks by state" note="Top 15 states by checks. Click a state for its RTOs, then an RTO for its vehicles." height={Math.max(220, states.length * 26)}
          table={{ columns: [['name', 'State'], ['checks', 'Checks'], ['vehicles', 'Vehicles']], rows: data.states }}>
          <BarChart data={states} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="name" width={130} tick={{ ...AXIS, fill: '#0b1f1c' }} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={(l) => l} />} cursor={{ fill: '#f3f7f6' }} />
            <Bar dataKey="checks" name="Checks" fill={SERIES[0]} radius={[0, 4, 4, 0]} onClick={openState} className="cursor-pointer" {...anim()}>
              <LabelList dataKey="checks" position="right" className="fill-ink text-2xs" />
            </Bar>
          </BarChart>
        </Card>
        <Card title="What is checked" note="Vehicles checked in the period, by its saved record." height={Math.max(220, states.length * 26)}
          right={(
            <select className="input !w-auto !py-1 text-2xs" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
          table={{ columns: [['name', KINDS.find(([k]) => k === kind)[1]], ['value', 'Vehicles']], rows: all }}>
          {tree.length ? (
            <Treemap data={tree} dataKey="value" nameKey="name" content={<Cellish />} {...anim()}>
              <Tooltip content={<Tip title={(_, p) => p?.[0]?.payload?.name} />} />
            </Treemap>
          ) : <div className="grid h-full place-items-center text-2xs text-muted">No saved records for this period.</div>}
        </Card>
        <Card className="lg:col-span-2" title="Documents expiring" note="Insurance, PUC, road tax and fitness ending each month, across the vehicles GaadiPe holds."
          legend={DOCS} height={240}
          table={{ columns: [['month', 'Month', month], ...DOCS.map(([d]) => [d, d])], rows: data.expiring }}>
          <BarChart data={data.expiring} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="month" tickFormatter={month} tick={AXIS} tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={month} total="All documents" />} cursor={{ fill: '#f3f7f6' }} />
            {DOCS.map(([d, c], i) => (
              <Bar key={d} dataKey={d} name={d} stackId="e" fill={c} stroke="#fff" strokeWidth={1} radius={i === DOCS.length - 1 ? [4, 4, 0, 0] : 0} {...anim()} />
            ))}
          </BarChart>
        </Card>
      </div>

      {state && (
        <Drill title={`${state.name} — by RTO`} onClose={() => { setState(null); setRto(null); }} loading={!rtos}>
          {!rtos?.length ? <p className="text-2xs text-muted">No RTOs.</p> : (
            <Card title="RTOs" note="Click an RTO for its vehicles." height={Math.max(140, Math.min(rtos.length, 20) * 24)}
                table={{ columns: [['code', 'RTO'], ['name', 'Office'], ['checks', 'Checks'], ['vehicles', 'Vehicles']], rows: rtos }}>
                <BarChart data={rtos.slice(0, 20).map((r) => ({ ...r, label: r.name ? `${r.code} · ${r.name}` : r.code }))} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={210} tick={{ ...AXIS, fill: '#0b1f1c' }} tickLine={false} axisLine={false} />
                  <Tooltip content={<Tip title={(l) => l} />} cursor={{ fill: '#f3f7f6' }} />
                  <Bar dataKey="checks" name="Checks" fill={SERIES[2]} radius={[0, 4, 4, 0]} onClick={openRto} className="cursor-pointer" {...anim()}>
                    <LabelList dataKey="checks" position="right" className="fill-ink text-2xs" />
                  </Bar>
                </BarChart>
              </Card>
          )}
          {rto && (
            <Drill title={`${rto.code}${rto.name ? ` · ${rto.name}` : ''} — vehicles`} onClose={() => setRto(null)} loading={!vehicles}>
              {!vehicles?.length ? <p className="text-2xs text-muted">No vehicles.</p> : (
                <div className="max-h-72 overflow-auto rounded-lg border border-line">
                  <table className="w-full text-2xs"><tbody>
                    {vehicles.map((v) => (
                      <tr key={v.reg_no} className="border-t border-line/60 first:border-0">
                        <td className="px-3 py-1.5 font-mono font-semibold text-ink">{plate(v.reg_no)}</td>
                        <td className="px-3 py-1.5 text-body">{count(v.checks)} check{v.checks === 1 ? '' : 's'}</td>
                        <td className="px-3 py-1.5 text-muted">last {dateTime(v.last)}</td>
                        <td className="px-3 py-1.5 text-right"><Link className="text-brand hover:underline" to={`/vehicles/${v.reg_no}`}>Vehicle →</Link></td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              )}
            </Drill>
          )}
        </Drill>
      )}
    </>
  );
}
