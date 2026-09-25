import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { chartAnim, legendToggle } from '../../lib/motion.jsx';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Failed, SkeletonCards, Empty, Table, Hint } from '../../components/ui.jsx';
import { num, pct } from './common.jsx';

/**
 * DATA QUALITY (user, 2026-09-25) — how complete and reliable the vehicle
 * data is: what share of records came back with each document, what went
 * wrong with responses, what is stale or disagrees, and the trend. Available
 * means returned, not valid.
 */
const COLORS = { insurance: '#0f766e', puc: '#e08700', tax: '#12a150', permit: '#d92d20', fitness: '#6b8380', loan: '#0b4f4a', blacklist: '#8f5600' };

export default function DataQuality() {
  const [params, controls, key] = usePeriod('data-quality', { defaultRange: '30d', withCompare: false });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.dataQuality(params)); } catch (e) { setError(e); } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return (
    <Shell title="Data quality" subtitle={d ? `${num(d.records)} vehicle records · API problems for ${d.range.label}` : ' '} actions={controls}>
      {error && !d ? <div className="card"><Failed error={error} onRetry={load} /></div> : !d ? <SkeletonCards n={8} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {d.availability.map((a) => (
              <Hint key={a.key} note={`${num(a.n)} of ${num(a.of)} records.${a.key === 'permit' ? ` ${d.notes.permit}` : ''}`}>
                <div className="card px-4 py-3"><div className="text-2xs font-semibold uppercase tracking-wider text-muted">{a.label} availability</div>
                  <div className="tabular mt-1 text-2xl font-semibold text-ink">{a.pct == null ? '—' : `${a.pct}%`}</div>
                  <div className="mt-1 h-1.5 rounded bg-shell"><div className="h-1.5 rounded bg-brand" style={{ width: `${a.pct || 0}%` }} /></div></div>
              </Hint>
            ))}
          </div>
          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Problems</div>
            <Table head={<tr>{['', 'Count', 'Of', 'Share'].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
              {d.problems.map((p) => (
                <tr key={p.key} className={p.rows?.length ? 'cursor-pointer hover:bg-shell/60' : ''} onClick={() => p.rows?.length && setOpen(p)}>
                  <td className="td"><Hint note={p.note}><span className="text-ink">{p.label}</span></Hint></td>
                  <td className={`td tabular ${p.n ? 'font-semibold text-wrong-700' : ''}`}>{num(p.n)}</td>
                  <td className="td tabular text-muted">{num(p.of)}</td><td className="td tabular">{pct(p.pct)}</td>
                </tr>
              ))}
            </Table>
          </div>
          {open && (
            <div className="card p-4">
              <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold text-ink">{open.label}</h2><button className="btn-quiet !py-1 text-2xs" onClick={() => setOpen(null)}>Close</button></div>
              <ul className="space-y-1 text-sm">{open.rows.map((x) => <li key={x.reg_no}><Link className="font-mono text-brand-deep hover:underline" to={`/vehicles/${x.reg_no}`}>{x.reg_no}</Link> — {x.fields.join(', ')}</li>)}</ul>
            </div>
          )}
          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold text-ink">Availability over time</h2>
            {!d.trend.length ? <Empty>No data available — no report was issued in this period.</Empty> : (
              <div className="h-64"><ResponsiveContainer>
                <LineChart data={d.trend}><CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" /><XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => `${v}%`} /><Legend {...legendToggle()} wrapperStyle={{ fontSize: 12 }} />
                  {Object.entries(COLORS).map(([k, c]) => <Line {...chartAnim()} key={k} type="monotone" dataKey={k} stroke={c} dot={false} />)}
                </LineChart>
              </ResponsiveContainer></div>
            )}
            <p className="mt-1 text-2xs text-muted">{d.notes.trend} {d.notes.available}</p>
          </div>
        </div>
      )}
    </Shell>
  );
}
