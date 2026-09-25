import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Shell from '../components/Shell.jsx';
import { usePeriod } from '../components/Period.jsx';
import { Failed, Empty, Table, Hint, Skeleton } from '../components/ui.jsx';
import { count } from '../lib/format';

/**
 * WHERE (user, 2026-09-25, command center phase 7).
 *
 * India as tiles — each state a square roughly where it sits — shaded by the
 * figure chosen: lookups, reports, payments, revenue or website visitors. Tap
 * a state for its RTOs. A vehicle's state comes from its registration number;
 * website visitors from the city-level place kept for them, never finer.
 */

// [column, row] on a 9 × 8 grid, roughly where each state sits.
const TILES = {
  JK: [2, 0], LA: [3, 0],
  CH: [1, 1], PB: [2, 1], HP: [3, 1], UK: [4, 1],
  RJ: [1, 2], HR: [2, 2], DL: [3, 2], UP: [4, 2], BR: [5, 2], SK: [6, 2], AR: [8, 2],
  GJ: [1, 3], MP: [2, 3], CG: [3, 3], JH: [4, 3], WB: [5, 3], AS: [6, 3], NL: [7, 3],
  DD: [0, 4], MH: [1, 4], TS: [2, 4], OD: [3, 4], ML: [6, 4], MN: [7, 4],
  GA: [1, 5], KA: [2, 5], AP: [3, 5], TR: [6, 5], MZ: [7, 5],
  KL: [2, 6], TN: [3, 6], PY: [4, 6],
  LD: [1, 7], AN: [5, 7],
};
const METRICS = [
  ['lookups', 'Lookups'], ['reports', 'Reports'], ['payments', 'Payments'], ['revenue_paise', 'Revenue'], ['visitors', 'Website visitors'],
];
const inr = (p) => `₹${(Number(p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const show = (m, v) => (m === 'revenue_paise' ? inr(v) : count(v || 0));

export default function Geo() {
  const navigate = useNavigate();
  const [params, controls, key] = usePeriod('geo', { defaultRange: '30d', withCompare: false });
  const [metric, setMetric] = useState('lookups');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [state, setState] = useState(null);
  const [rtos, setRtos] = useState(null);

  const load = useCallback(async () => {
    try { setData(await api.geoStates(params)); setError(null); } catch (e) { setError(e); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => {
    if (!state) { setRtos(null); return; }
    setRtos(undefined);
    api.geoRtos(state, params).then(setRtos).catch(() => setRtos({ rtos: [] }));
  }, [state, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const by = Object.fromEntries((data?.states || []).map((s) => [s.key, s]));
  const most = Math.max(1, ...(data?.states || []).map((s) => s[metric] || 0));

  return (
    <Shell title="Where" subtitle={data ? `${data.range.label} · by the state on the number plate` : ' '}
      actions={
        <>
          <select className="input !w-auto !py-1.5 text-sm" value={metric} onChange={(e) => setMetric(e.target.value)}>
            {METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {controls}
        </>
      }>
      {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <Skeleton rows={6} /> : (
        <div className="grid gap-4 xl:grid-cols-5">
          <div className="card p-4 xl:col-span-3">
            <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(9, minmax(0, 1fr))' }}>
              {Array.from({ length: 8 * 9 }, (_, i) => {
                const col = i % 9; const row = Math.floor(i / 9);
                const code = Object.keys(TILES).find((c) => TILES[c][0] === col && TILES[c][1] === row);
                if (!code) return <div key={i} />;
                const s = by[code]; const v = s?.[metric] || 0;
                const on = v > 0;
                return (
                  <Hint key={i} note={`${data.names[code] || code}: ${show(metric, v)}`}>
                    <button type="button" onClick={() => setState(state === code ? null : code)}
                      className={`lift aspect-square w-full rounded-md border text-[10px] font-semibold transition ${
                        state === code ? 'border-ink ring-2 ring-ink/20' : 'border-line'} ${on ? 'text-white' : 'text-muted'}`}
                      style={{ background: on ? `rgba(15,118,110,${0.25 + 0.75 * (v / most)})` : '#f3f8f7' }}>
                      {code}
                    </button>
                  </Hint>
                );
              })}
            </div>
            <p className="mt-3 text-2xs text-muted">
              Darker = more {METRICS.find(([k]) => k === metric)[1].toLowerCase()}. Tap a state for its RTOs.
              {data.visitors_unplaced ? ` ${count(data.visitors_unplaced)} visitors could not be placed in a state.` : ''}
              {by.BH ? ` Bharat-series (BH) plates: ${show(metric, by.BH[metric])}.` : ''}
            </p>
          </div>

          <div className="card xl:col-span-2">
            {state ? (
              <>
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <h2 className="text-sm font-semibold text-ink">{data.names[state] || state} · RTOs</h2>
                  <button className="btn-quiet !py-1 text-2xs" onClick={() => setState(null)}>All states</button>
                </div>
                {rtos === undefined ? <div className="p-4 text-sm text-muted">Loading…</div> : !rtos?.rtos.length ? <Empty>No activity in this state.</Empty> : (
                  <Table head={<tr>{['RTO', 'Lookups', 'Reports', 'Paid', 'Revenue'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                    {rtos.rtos.map((r) => (
                      <tr key={r.key} className="cursor-pointer hover:bg-shell/70" onClick={() => navigate('/lookups')} title="See the lookups">
                        <td className="td tabular text-sm font-semibold text-ink">{r.key}</td>
                        <td className="td tabular">{count(r.lookups)}</td>
                        <td className="td tabular">{count(r.reports)}</td>
                        <td className="td tabular">{count(r.payments)}</td>
                        <td className="td tabular">{inr(r.revenue_paise)}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </>
            ) : (
              <>
                <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold text-ink">States</h2></div>
                {!data.states.length ? <Empty>No activity in this period.</Empty> : (
                  <Table head={<tr>{['State', 'Visitors', 'Lookups', 'Reports', 'Paid', 'Revenue'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                    {data.states.map((s) => (
                      <tr key={s.key} className="cursor-pointer hover:bg-shell/70" onClick={() => setState(s.key)}>
                        <td className="td text-sm text-ink">{s.name}</td>
                        <td className="td tabular">{count(s.visitors)}</td>
                        <td className="td tabular">{count(s.lookups)}</td>
                        <td className="td tabular">{count(s.reports)}</td>
                        <td className="td tabular">{count(s.payments)}</td>
                        <td className="td tabular">{inr(s.revenue_paise)}</td>
                      </tr>
                    ))}
                  </Table>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
