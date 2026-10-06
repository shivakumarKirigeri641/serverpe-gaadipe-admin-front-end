import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';
import { api } from '../../lib/api';
import { count } from '../../lib/format';
import { Failed, Skeleton } from '../../components/ui.jsx';
import { SERIES, STATUS, AXIS, GRID, inr, Stats } from './kit.jsx';

/*
 * TODAY, LIVE (user, 2026-10-06: "today's timeline — customers, vehicle checks
 * failed or success, full reports and more — in one graph, every minute").
 * Back end: src/admin/graphs.js today(). One chart: checks as stacked bars
 * (found / not found / failed), people saying hi, ₹19 taps, paid reports and
 * STOPs as lines. Asks again every minute; a tap on a legend item hides it.
 */
const KEYS = [
  ['checked', 'Checks — found', STATUS.ok, 'bar'],
  ['not_found', 'Checks — no such vehicle', STATUS.neutral, 'bar'],
  ['failed', 'Checks — failed (services down)', STATUS.failed, 'bar'],
  ['hi', 'Said hi', SERIES[0], 'line'],
  ['tapped', 'Tapped ₹19', SERIES[3], 'line'],
  ['paid', 'Full reports paid', SERIES[6], 'line'],
  ['stops', 'Said STOP', SERIES[4], 'line'],
];
const WINDOWS = [['hour', 'Last 60 min'], ['three', 'Last 3 hours'], ['today', 'Today']];
const STEP = {
  hi: ['👋', 'said hi'], basic_shown: ['✅', 'checked'], buy_tapped: ['👆', 'tapped ₹19'],
  opt_out: ['✋', 'said STOP'], paid: ['💰', 'paid'],
};
const time = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s+/g, ' ').toLowerCase();

export default function TodayLive() {
  const [win, setWin] = useState(() => { try { return localStorage.getItem('gp.graphs.live') || 'hour'; } catch { return 'hour'; } });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const [tick, setTick] = useState(60);
  const want = useRef(win);

  const load = useCallback(() => {
    want.current = win;
    return api.graph('today', { window: win })
      .then((d) => { if (want.current === win) { setData(d); setError(null); setTick(60); } })
      .catch(setError);
  }, [win]);
  useEffect(() => { load(); }, [load]);
  // Every minute, and a countdown so it is clear it is live.
  useEffect(() => {
    const t = setInterval(() => setTick((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (tick === 0) { setTick(60); load(); } }, [tick, load]);

  const pick = (w) => { setWin(w); setData(null); try { localStorage.setItem('gp.graphs.live', w); } catch { /* private window */ } };
  const toggle = (k) => setHidden((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const t = data?.totals;
  const checks = t ? t.checked + t.not_found + t.failed : 0;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Window">
          {WINDOWS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => pick(k)} aria-pressed={win === k}
              className={`rounded-md px-3 py-1 text-2xs font-semibold ${win === k ? 'bg-brand text-white' : 'text-body hover:bg-shell'}`}>{l}</button>
          ))}
        </div>
        <span className="inline-flex items-center gap-2 text-2xs text-muted">
          <span className="m-dot h-2 w-2 bg-good-500" aria-hidden="true" />
          Live{data ? ` · updated ${time(data.checked_at)}` : ''} · next in {tick}s
          <button type="button" className="btn-quiet !px-2 !py-0.5 text-2xs" onClick={load}>Now</button>
        </span>
      </div>

      {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <Skeleton rows={8} /> : (
        <>
          <Stats items={[
            ['Said hi', count(t.hi), 'people today'],
            ['Checks', count(checks), `${count(t.checked)} found`],
            ['Failed', count(t.failed), t.not_found ? `+${count(t.not_found)} no such vehicle` : 'services down'],
            ['Tapped ₹19', count(t.tapped), 'today'],
            ['Paid', count(t.paid), inr(t.revenue_paise)],
            ['STOP', count(t.stops), 'today'],
          ]} />

          <section className="card cv-rise p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-ink">{data.label} — every {data.bucket_minutes === 1 ? 'minute' : `${data.bucket_minutes} minutes`}</h2>
                <p className="text-2xs text-muted">Bars: vehicle checks (found, no such vehicle, failed). Lines: people saying hi, ₹19 taps, paid reports, STOPs. Tap a name to hide or show it.</p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {KEYS.map(([k, label, colour, kind]) => (
                <button key={k} type="button" onClick={() => toggle(k)} aria-pressed={!hidden.has(k)}
                  className={`inline-flex items-center gap-1.5 rounded px-1 text-2xs ${hidden.has(k) ? 'text-muted line-through opacity-60' : 'text-body'}`}>
                  <span className={kind === 'bar' ? 'h-2.5 w-2.5 rounded-sm' : 'h-0.5 w-3.5 rounded'} style={{ background: colour }} aria-hidden="true" />{label}
                </button>
              ))}
            </div>
            <div className="mt-3" style={{ width: '100%', height: 340 }}>
              <ResponsiveContainer>
                <ComposedChart data={data.series} margin={{ top: 8, right: 12, left: -12, bottom: 0 }} barCategoryGap={data.series.length > 60 ? 1 : 3}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="t" tickFormatter={time} tick={AXIS} tickLine={false} axisLine={false} minTickGap={36} />
                  <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
                  <Tooltip content={<LiveTip />} cursor={{ fill: '#f3f7f6' }} />
                  {KEYS.filter(([, , , kind]) => kind === 'bar').map(([k, label, colour]) => (
                    <Bar key={k} dataKey={k} name={label} stackId="checks" fill={colour} hide={hidden.has(k)}
                      isAnimationActive animationDuration={500} radius={k === 'failed' ? [3, 3, 0, 0] : 0} />
                  ))}
                  {KEYS.filter(([, , , kind]) => kind === 'line').map(([k, label, colour]) => (
                    <Line key={k} dataKey={k} name={label} stroke={colour} strokeWidth={2} dot={false} type="monotone"
                      hide={hidden.has(k)} isAnimationActive animationDuration={500} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="card cv-rise mt-4 p-5">
            <h2 className="text-sm font-semibold text-ink">Latest moments</h2>
            <p className="text-2xs text-muted">Newest first, in this window. Tap a person for their journey.</p>
            {!data.feed.length ? <p className="mt-3 text-2xs text-muted">Nothing yet in this window.</p> : (
              <ul className="mt-2 divide-y divide-line/60">
                {data.feed.map((f, i) => {
                  const [icon, verb] = f.step === 'lookup_failed'
                    ? (f.reason === 'not_found' ? ['❔', 'checked — no such vehicle'] : ['⚠️', 'check failed'])
                    : STEP[f.step] || ['•', f.step];
                  return (
                    <li key={i} className="flex items-center gap-3 py-1.5 text-2xs">
                      <span className="w-16 shrink-0 tabular text-muted">{time(f.at)}</span>
                      <span aria-hidden="true">{icon}</span>
                      <span className="min-w-0 flex-1 truncate text-body">
                        <b className="text-ink">{f.name || f.masked || 'Someone'}</b> {verb}
                        {f.reg_no ? <> <span className="font-semibold text-ink">{f.reg_no}</span></> : null}
                        {f.paise != null ? <> <b className="text-ink">{inr(f.paise)}</b></> : null}
                      </span>
                      {f.mobile && <Link className="shrink-0 text-brand hover:underline" to={`/journey?mobile=${f.mobile}`}>Journey →</Link>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}

function LiveTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const items = KEYS.filter(([k]) => row[k] > 0);
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-2xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{time(label)}</div>
      {!items.length && <div className="text-muted">Quiet</div>}
      {items.map(([k, l, colour]) => (
        <div key={k} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: colour }} aria-hidden="true" />
          <span className="text-body">{l}</span>
          <b className="ml-auto pl-4 tabular text-ink">{count(row[k])}</b>
        </div>
      ))}
      {row.revenue_paise > 0 && <div className="mt-1 border-t border-line pt-1 text-body">Revenue <b className="float-right pl-4 text-ink">{inr(row.revenue_paise)}</b></div>}
    </div>
  );
}
