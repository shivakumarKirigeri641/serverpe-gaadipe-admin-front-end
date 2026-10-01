import { Fragment, useCallback, useEffect, useState } from 'react';
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
 * STATES & UTs → RTOs (user, 2026-10-01): one row per state and union
 * territory — how many RTOs it has, how many GaadiPe has reached, and the
 * period's lookups, reports, payments and revenue. Tap a state and its RTOs
 * open beneath it in full: code, office, district or jurisdiction, notes and
 * activity. Search reaches into the RTOs and opens the states that match;
 * "Open all" / "Close all"; sort by name or by activity. Same data as the
 * All RTOs tab.
 */
function StatesNested({ params, periodKey }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => new Set());
  const [sort, setSort] = useState('activity');
  const load = useCallback(() => api.geoAllRtos(params).then((x) => { setD(x); setError(null); }).catch(setError), [periodKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  if (error && !d) return <Failed error={error} onRetry={load} />;
  if (!d) return <Skeleton rows={10} />;

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hit = (r) => !words.length || words.every((w) => `${r.code} ${r.office || ''} ${r.district || ''} ${r.state_name}`.toLowerCase().includes(w));
  const groups = Object.values(d.rtos.reduce((m, r) => {
    const g = (m[r.state] = m[r.state] || { code: r.state, name: r.state_name, rtos: [], lookups: 0, reports: 0, payments: 0, revenue_paise: 0, reached: 0 });
    g.rtos.push(r);
    for (const f of ['lookups', 'reports', 'payments', 'revenue_paise']) g[f] += r[f];
    if (r.lookups > 0) g.reached += 1;
    return m;
  }, {}))
    .map((g) => ({ ...g, shown: g.rtos.filter(hit).sort((a, b) => (b.lookups - a.lookups) || a.code.localeCompare(b.code, 'en', { numeric: true })) }))
    .filter((g) => g.shown.length)
    .sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : (b.lookups - a.lookups) || (b.reached - a.reached) || a.name.localeCompare(b.name)));
  const isOpen = (c) => open.has(c) || words.length > 0;
  const toggle = (c) => setOpen((s) => { const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const most = Math.max(1, ...groups.map((g) => g.lookups));
  const still = motionLevel() !== 'full';
  const totals = groups.reduce((t, g) => ({ rtos: t.rtos + g.rtos.length, reached: t.reached + g.reached }), { rtos: 0, reached: 0 });

  return (
    <div className="space-y-3">
      <style>{`
        @keyframes gp-open { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }
        @keyframes gp-row-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
      `}</style>
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <input className="input !w-72 !py-1.5 text-sm" placeholder="Search a state, RTO code, office or district" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex overflow-hidden rounded-lg border border-line text-2xs">
          {[['activity', 'Most active first'], ['name', 'A–Z']].map(([k, l]) => (
            <button key={k} onClick={() => setSort(k)} className={`px-3 py-1.5 ${sort === k ? 'bg-brand text-white' : 'text-body hover:bg-shell'}`}>{l}</button>
          ))}
        </div>
        <button className="btn-quiet !py-1.5 text-2xs" onClick={() => setOpen(new Set(groups.map((g) => g.code)))}>Open all</button>
        <button className="btn-quiet !py-1.5 text-2xs" onClick={() => setOpen(new Set())}>Close all</button>
        <span className="ml-auto text-2xs text-muted">
          {groups.length} states & UTs · {count(totals.rtos)} RTOs · {count(totals.reached)} reached · {d.range.label}
        </span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-muted">
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2">State / UT</th>
              <th className="px-3 py-2 text-right">RTOs</th>
              <th className="px-3 py-2">Reached</th>
              <th className="px-3 py-2 text-right">Lookups</th>
              <th className="px-3 py-2 text-right">Reports</th>
              <th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2 text-right">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => {
              const on = isOpen(g.code);
              const pct = Math.round((g.reached / g.rtos.length) * 100);
              return (
                <Fragment key={g.code}>
                  <tr onClick={() => toggle(g.code)}
                    className={`cursor-pointer border-b border-line/70 transition-colors ${on ? 'bg-brand/[0.06]' : 'hover:bg-shell/70'}`}
                    style={still ? undefined : { animation: `gp-row-in .35s ease-out ${Math.min(gi, 20) * 0.03}s both` }}>
                    <td className="px-3 py-2.5 text-muted">
                      <span className="inline-block transition-transform duration-300" style={{ transform: on ? 'rotate(90deg)' : 'none' }}>▸</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2.5">
                        <span className="grid h-7 w-9 place-items-center rounded-md text-[10px] font-bold text-white"
                          style={{ background: g.lookups ? `rgba(15,118,110,${0.4 + 0.6 * (g.lookups / most)})` : '#b8c7c4' }}>{g.code}</span>
                        <span className="font-semibold text-ink">{g.name}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular text-body">{count(g.rtos.length)}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center gap-2">
                        <span className="inline-block h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-shell">
                          <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%`, transition: 'width .8s cubic-bezier(.2,.8,.2,1)' }} />
                        </span>
                        <span className="text-2xs text-muted">{g.reached}/{g.rtos.length}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink"><Rolling text={count(g.lookups)} /></td>
                    <td className="px-3 py-2.5 text-right"><Rolling text={count(g.reports)} /></td>
                    <td className="px-3 py-2.5 text-right"><Rolling text={count(g.payments)} /></td>
                    <td className="px-3 py-2.5 text-right"><Rolling text={inr(g.revenue_paise)} /></td>
                  </tr>
                  {on && (
                    <tr className="border-b border-line/70 bg-shell/40">
                      <td />
                      <td colSpan={7} className="px-3 pb-3 pt-1">
                        <div className="overflow-hidden rounded-lg border border-line bg-white" style={still ? undefined : { animation: 'gp-open .35s ease-out both' }}>
                          <table className="w-full text-[13px]">
                            <thead>
                              <tr className="border-b border-line bg-shell/60 text-left text-[10px] uppercase tracking-wider text-muted">
                                <th className="px-3 py-1.5">Code</th>
                                <th className="px-3 py-1.5">Office</th>
                                <th className="px-3 py-1.5">District / jurisdiction</th>
                                <th className="px-3 py-1.5">Notes</th>
                                <th className="px-3 py-1.5 text-right">Lookups</th>
                                <th className="px-3 py-1.5 text-right">Reports</th>
                                <th className="px-3 py-1.5 text-right">Paid</th>
                                <th className="px-3 py-1.5 text-right">Revenue</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.shown.map((r, i) => (
                                <tr key={r.code} className={`border-b border-line/50 last:border-0 hover:bg-brand/[0.04] ${r.lookups ? '' : 'text-muted'}`}
                                  style={still ? undefined : { animation: `gp-row-in .3s ease-out ${Math.min(i, 25) * 0.02}s both` }}>
                                  <td className="px-3 py-1.5">
                                    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-bold ${r.lookups ? 'bg-brand text-white' : 'bg-shell text-muted'}`}>{r.code}</span>
                                  </td>
                                  <td className="max-w-[220px] px-3 py-1.5">
                                    <span className={`block truncate ${r.lookups ? 'font-semibold text-ink' : ''}`} title={r.office || undefined}>
                                      {r.office || <i className="text-muted">Office name not known yet</i>}
                                    </span>
                                  </td>
                                  <td className="max-w-[220px] px-3 py-1.5"><span className="block truncate" title={r.district || undefined}>{r.district || '—'}</span></td>
                                  <td className="max-w-[200px] px-3 py-1.5"><span className="block truncate text-2xs" title={r.notes || undefined}>{r.notes || '—'}</span></td>
                                  <td className="px-3 py-1.5 text-right tabular">{r.lookups ? count(r.lookups) : '—'}</td>
                                  <td className="px-3 py-1.5 text-right tabular">{r.reports ? count(r.reports) : '—'}</td>
                                  <td className="px-3 py-1.5 text-right tabular">{r.payments ? count(r.payments) : '—'}</td>
                                  <td className="px-3 py-1.5 text-right tabular">{r.revenue_paise ? inr(r.revenue_paise) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {g.shown.length < g.rtos.length && (
                            <div className="border-t border-line px-3 py-1.5 text-2xs text-muted">{g.shown.length} of {g.rtos.length} RTOs match the search</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!groups.length && <Empty>No state or RTO matches that.</Empty>}
      </div>
    </div>
  );
}

/*
 * EVERY RTO IN INDIA (user, 2026-10-01): all 1,357 (and any code only a vehicle
 * record knew), each with this period's activity — zeros included, so the
 * places GaadiPe has not reached yet are in plain sight. Search by code, office,
 * district or state; filter by state and by "reached / not yet"; rows slide in;
 * sixty at a time; the view downloads as CSV.
 */
const PAGE = 60;
function AllRtos({ params, periodKey }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [st, setSt] = useState('');
  const [reach, setReach] = useState('all');
  const [shown, setShown] = useState(PAGE);
  const load = useCallback(() => api.geoAllRtos(params).then((x) => { setD(x); setError(null); }).catch(setError), [periodKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setShown(PAGE); }, [q, st, reach]);
  if (error && !d) return <Failed error={error} onRetry={load} />;
  if (!d) return <Skeleton rows={8} />;

  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = d.rtos
    .filter((r) => !st || r.state === st)
    .filter((r) => reach === 'all' || (reach === 'active' ? r.lookups > 0 : !r.lookups))
    .filter((r) => !words.length || words.every((w) => `${r.code} ${r.office || ''} ${r.district || ''} ${r.state_name}`.toLowerCase().includes(w)))
    .sort((a, b) => (b.lookups - a.lookups) || (b.revenue_paise - a.revenue_paise) || a.code.localeCompare(b.code, 'en', { numeric: true }));
  const active = d.rtos.filter((r) => r.lookups > 0).length;
  const states = [...new Set(d.rtos.map((r) => r.state))].sort((a, b) => (d.names[a] || a).localeCompare(d.names[b] || b));
  const most = Math.max(1, ...rows.map((r) => r.lookups));
  const still = motionLevel() !== 'full';

  const csv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Code', 'Office', 'District', 'State', 'Lookups', 'Reports', 'Paid', 'Revenue (₹)'].join(',')]
      .concat(rows.map((r) => [r.code, r.office, r.district, r.state_name, r.lookups, r.reports, r.payments, (r.revenue_paise / 100).toFixed(2)].map(esc).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv' }));
    a.download = `gaadipe-rtos-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <div className="space-y-3">
      <style>{`@keyframes gp-row-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[['RTOs in India', d.rtos.length, 'from the state-wise lists, plus any code only a vehicle record knew'],
          ['Reached', active, `RTOs with at least one lookup · ${d.range.label}`],
          ['Not reached yet', d.rtos.length - active, 'Where an ad could find new customers'],
          ['States & UTs', states.length, 'with at least one RTO listed']].map(([l, v, n]) => (
          <Hint key={l} note={n} className="block">
            <div className="card px-3 py-2">
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{l}</div>
              <div className="text-xl font-bold text-ink"><Rolling text={count(v)} /></div>
            </div>
          </Hint>
        ))}
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-3">
        <input className="input !w-64 !py-1.5 text-sm" placeholder="Search code, office, district or state" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-auto !py-1.5 text-sm" value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">All states</option>
          {states.map((s) => <option key={s} value={s}>{d.names[s] || s}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-lg border border-line text-2xs">
          {[['all', 'All'], ['active', 'Reached'], ['none', 'Not yet']].map(([k, l]) => (
            <button key={k} onClick={() => setReach(k)} className={`px-3 py-1.5 ${reach === k ? 'bg-brand text-white' : 'text-body hover:bg-shell'}`}>{l}</button>
          ))}
        </div>
        <span className="ml-auto text-2xs text-muted">{count(rows.length)} shown</span>
        <button className="btn-quiet !py-1.5 text-2xs" onClick={csv}>⬇ CSV</button>
      </div>

      <div className="card overflow-hidden">
        {!rows.length ? <Empty>No RTO matches that.</Empty> : (
          <ol>
            {rows.slice(0, shown).map((r, i) => {
              const on = r.lookups > 0;
              return (
                <li key={r.code} className={`flex items-center gap-3 border-b border-line/60 px-4 py-2.5 transition-colors hover:bg-brand/[0.04] ${on ? '' : 'opacity-80'}`}
                  style={still ? undefined : { animation: `gp-row-in .35s ease-out ${Math.min(i % PAGE, 20) * 0.025}s both` }}>
                  <span className="grid h-9 w-12 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white shadow-sm"
                    style={{ background: on ? `rgba(15,118,110,${0.4 + 0.6 * (r.lookups / most)})` : '#b8c7c4' }}>{r.code}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{r.office || <span className="text-muted">Office name not known yet</span>}</div>
                    <div className="truncate text-[11px] text-muted">{[r.district, r.state_name].filter(Boolean).join(' · ')}</div>
                  </div>
                  {on ? (
                    <div className="hidden shrink-0 items-center gap-4 text-right text-[11px] text-muted sm:flex">
                      {[['Lookups', count(r.lookups)], ['Reports', count(r.reports)], ['Paid', count(r.payments)], ['Revenue', inr(r.revenue_paise)]].map(([l, v]) => (
                        <span key={l} className="w-14"><b className="block text-sm text-ink"><Rolling text={v} /></b>{l}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="chip shrink-0 bg-shell text-muted">Not reached yet</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        {rows.length > shown && (
          <div className="p-3 text-center">
            <button className="btn-quiet !py-1.5 text-sm" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, rows.length - shown)} more</button>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [view, setView] = useState('map');  // map | rtos (every RTO in India)

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
      tabs={
        <div className="flex gap-1">
          {[['map', 'Map & states'], ['nested', 'States & UTs → RTOs'], ['rtos', 'All RTOs in India']].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${view === id ? 'border-brand font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
      }
      actions={
        <>
          {view === 'map' && (
            <select className="input !w-auto !py-1.5 text-sm" value={metric} onChange={(e) => setMetric(e.target.value)}>
              {METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          )}
          {controls}
        </>
      }>
      {view === 'rtos' ? <AllRtos params={params} periodKey={key} />
        : view === 'nested' ? <StatesNested params={params} periodKey={key} />
        : error && !data ? <Failed error={error} onRetry={load} /> : !data ? <Skeleton rows={6} /> : (
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
                    label={(r) => (r.name ? `${r.key} · ${r.name}` : r.key)} code={(r) => r.key.replace(/\D/g, '').slice(0, 3) || r.key}
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
