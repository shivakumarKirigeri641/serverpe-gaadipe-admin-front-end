import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Shell from '../components/Shell.jsx';
import { usePeriod } from '../components/Period.jsx';
import { Failed, Empty, Hint, Skeleton } from '../components/ui.jsx';
import { count } from '../lib/format';
import { Rolling, motionLevel } from '../lib/motion.jsx';

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
const SHORT = { visitors: 'Visitors', lookups: 'Lookups', reports: 'Reports', payments: 'Paid', revenue_paise: 'Revenue' };
const MEDAL = ['🥇', '🥈', '🥉'];

/*
 * THE LEADERBOARD (user, 2026-10-01): the table beside the map, made a ranked
 * list worth looking at. Sorted by the figure chosen above; medals for the top
 * three; a badge in the map's own shade; a bar that grows to each row's share,
 * with the per cent beside it; the other figures underneath, rolling in. Rows
 * slide in one after another, and pointing at a row lights its tile on the map.
 * With reduced motion the bars and rows simply appear.
 */
export function Leaderboard({ rows, metric, label, code, fields, onPick, pickHint, hover, onHover }) {
  const [grown, setGrown] = useState(motionLevel() !== 'full');
  useEffect(() => {
    if (motionLevel() !== 'full') return undefined;
    const t = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
    return () => cancelAnimationFrame(t);
  }, []);
  const sorted = [...rows].sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
  const total = sorted.reduce((t, r) => t + (Number(r[metric]) || 0), 0);
  const most = Math.max(1, ...sorted.map((r) => r[metric] || 0));
  const still = motionLevel() !== 'full';
  return (
    <div className="max-h-[560px] overflow-y-auto">
      <style>{`@keyframes gp-row-in { from { opacity: 0; transform: translateX(14px) } to { opacity: 1; transform: none } }`}</style>
      <div className="flex items-baseline justify-between border-b border-line/70 bg-shell/40 px-4 py-2 text-2xs text-muted">
        <span>{sorted.length} {sorted.length === 1 ? 'place' : 'places'}</span>
        <span>Total {SHORT[metric].toLowerCase()}: <b className="text-ink"><Rolling text={show(metric, total)} /></b></span>
      </div>
      <ol>
        {sorted.map((r, i) => {
          const v = Number(r[metric]) || 0;
          const pct = total ? Math.round((v / total) * 100) : 0;
          const lit = hover && hover === code(r);
          return (
            <li key={r.key}
              onClick={() => onPick(r)} onMouseEnter={() => onHover?.(code(r))} onMouseLeave={() => onHover?.(null)} title={pickHint}
              className={`group cursor-pointer border-b border-line/60 px-4 py-3 transition-colors ${lit ? 'bg-amber-50' : 'hover:bg-brand/[0.04]'}`}
              style={still ? undefined : { animation: `gp-row-in .45s cubic-bezier(.2,.8,.2,1) ${Math.min(i, 12) * 0.05}s both` }}>
              <div className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-center text-sm font-bold text-muted">{MEDAL[i] || i + 1}</span>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white shadow-sm transition-transform group-hover:scale-110"
                  style={{ background: `rgba(15,118,110,${0.35 + 0.65 * (v / most)})` }}>{code(r)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{label(r)}</span>
                    <span className="shrink-0 text-sm font-bold text-ink"><Rolling text={show(metric, v)} /></span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-shell">
                      <div className="h-full rounded-full"
                        style={{ width: grown ? `${Math.max(2, (v / most) * 100)}%` : '0%',
                          background: i === 0 ? 'linear-gradient(90deg,#f5a623,#ffd966)' : 'linear-gradient(90deg,#0f766e,#14b8a6)',
                          transition: still ? 'none' : `width .9s cubic-bezier(.2,.8,.2,1) ${0.15 + Math.min(i, 12) * 0.05}s` }} />
                    </div>
                    <span className="w-9 shrink-0 text-right text-2xs font-semibold text-muted">{pct}%</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
                    {fields.filter((f) => f !== metric).map((f) => (
                      <span key={f}>{SHORT[f]} <b className="text-body"><Rolling text={show(f, r[f])} /></b></span>
                    ))}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function Geo() {
  const navigate = useNavigate();
  const [params, controls, key] = usePeriod('geo', { defaultRange: '30d', withCompare: false });
  const [metric, setMetric] = useState('lookups');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [state, setState] = useState(null);
  const [rtos, setRtos] = useState(null);
  const [hover, setHover] = useState(null); // a state pointed at, in the list or on the map

  const load = useCallback(async () => {
    try { setData(await api.geoStates(params)); setError(null); } catch (e) { setError(e); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
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
                      onMouseEnter={() => setHover(code)} onMouseLeave={() => setHover(null)}
                      className={`lift aspect-square w-full rounded-md border text-[10px] font-semibold transition ${
                        state === code ? 'border-ink ring-2 ring-ink/20' : hover === code ? 'scale-110 border-amber-400 ring-2 ring-amber-300/60' : 'border-line'} ${on ? 'text-white' : 'text-muted'}`}
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

          <div className="card overflow-hidden xl:col-span-2">
            {state ? (
              <>
                <div className="flex items-center justify-between border-b border-line bg-gradient-to-r from-brand/10 to-transparent px-4 py-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-[10px] font-bold text-white">{state}</span>
                    {data.names[state] || state} · RTOs
                  </h2>
                  <button className="btn-quiet !py-1 text-2xs" onClick={() => setState(null)}>← All states</button>
                </div>
                {rtos === undefined ? <div className="p-4"><Skeleton rows={4} /></div> : !rtos?.rtos.length ? <Empty>No activity in this state.</Empty> : (
                  <Leaderboard key={`rto-${state}-${metric}`} rows={rtos.rtos} metric={metric === 'visitors' ? 'lookups' : metric}
                    label={(r) => r.key} code={(r) => r.key.replace(/\D/g, '').slice(0, 3) || r.key}
                    fields={['lookups', 'reports', 'payments', 'revenue_paise']} onPick={() => navigate('/lookups')} pickHint="See the lookups" />
                )}
              </>
            ) : (
              <>
                <div className="border-b border-line bg-gradient-to-r from-brand/10 to-transparent px-4 py-3">
                  <h2 className="text-sm font-semibold text-ink">States · ranked by {METRICS.find(([k]) => k === metric)[1].toLowerCase()}</h2>
                </div>
                {!data.states.length ? <Empty>No activity in this period.</Empty> : (
                  <Leaderboard key={`st-${metric}-${key}`} rows={data.states} metric={metric}
                    label={(s) => s.name} code={(s) => s.key} hover={hover} onHover={setHover}
                    fields={['visitors', 'lookups', 'reports', 'payments', 'revenue_paise']} onPick={(s) => setState(s.key)} pickHint="Tap for its RTOs" />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
