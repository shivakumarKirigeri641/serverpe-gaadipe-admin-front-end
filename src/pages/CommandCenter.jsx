import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { motionLevel, AnimatedNumber } from '../lib/motion.jsx';
import { api } from '../lib/api';
import Shell from '../components/Shell.jsx';
import { Hint, Modal, Table, Failed, SkeletonCards, Empty, Chip, saveBlob } from '../components/ui.jsx';
import { count, dateTime, mobile as fmtMobile, ago } from '../lib/format';

/**
 * GAADIPE LIVE COMMAND CENTER (user, 2026-09-25).
 *
 * At a glance: traffic, WhatsApp, vehicles, reports, payments, revenue, what
 * is left after costs, and whether anything is broken — for any period against
 * the one before. Every number opens the rows behind it.
 *
 * All figures come from the back end (src/admin/command.js), money included;
 * this screen only lays them out. A figure the product cannot produce is shown
 * as "No data", never as a zero it did not measure.
 */

const RANGES = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'],
  ['this_month', 'This month'], ['last_month', 'Last month'], ['custom', 'Custom'],
];
const COMPARES = [
  ['previous', 'vs previous period'], ['yesterday', 'vs day before'], ['last_week', 'vs same days last week'],
  ['last_month', 'vs same days last month'], ['none', 'No comparison'],
];
const OVERVIEW_MS = 60 * 1000;
const LIVE_MS = 5 * 1000;

const saved = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
const inr = (paise) => (paise == null ? '—'
  : `${paise < 0 ? '-' : ''}₹${(Math.abs(paise) / 100).toLocaleString('en-IN', { maximumFractionDigits: Math.abs(paise) % 100 ? 2 : 0 })}`);
const today = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

export default function CommandCenter() {
  const [range, setRange] = useState(() => saved('gp.cc.range', 'today'));
  const [compare, setCompare] = useState(() => saved('gp.cc.compare', 'previous'));
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drill, setDrill] = useState(null);
  const [layout, setLayout] = useLayout();
  const [customizing, setCustomizing] = useState(false);

  const params = range === 'custom' ? { range, compare, from, to } : { range, compare };

  const load = useCallback(async () => {
    setBusy(true);
    try { setData(await api.commandOverview(params)); setError(null); } catch (e) { setError(e); }
    setBusy(false);
  }, [range, compare, from, to]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, OVERVIEW_MS);
    return () => clearInterval(t);
  }, [load]);

  const pick = (k, v) => {
    if (k === 'range') { setRange(v); keep('gp.cc.range', v); }
    else { setCompare(v); keep('gp.cc.compare', v); }
  };
  const open = (what, title, previous = false) => what && setDrill({ what, title, previous });

  return (
    <Shell title="Command center"
      subtitle={data ? `${data.range.label}${data.compare ? ` · ${data.compare.label}` : ''} · updated ${ago(data.at)}` : ' '}
      actions={
        <>
          <select className="input !w-auto !py-1.5 text-sm" value={range} onChange={(e) => pick('range', e.target.value)}>
            {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          {range === 'custom' && (
            <>
              <input type="date" className="input !w-auto !py-1.5 text-sm" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
              <input type="date" className="input !w-auto !py-1.5 text-sm" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />
            </>
          )}
          <select className="input !w-auto !py-1.5 text-sm" value={compare} onChange={(e) => pick('compare', e.target.value)}>
            {COMPARES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="btn-quiet !py-1.5 text-2xs" onClick={load} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh'}</button>
          {data && <ExportMenu range={data.range} />}
          <button className="btn-quiet !py-1.5 text-2xs" onClick={() => setCustomizing((v) => !v)}>Customise</button>
        </>
      }>

      {customizing && <Customize layout={layout} setLayout={setLayout} kpis={data?.kpis || []} onClose={() => setCustomizing(false)} />}

      {/* On a phone: the six numbers that matter, before anything else (phase 7). */}
      {data && <MobileSummary data={data} />}

      {layout.order.map((block) => {
        if (layout.hidden.includes(block)) return null;
        if (block === 'live') return <LiveNow key="live" />;
        if (!data) return error ? <Failed key={block} error={error} onRetry={load} /> : <SkeletonCards key={block} n={8} />;
        if (block === 'kpis') return (
          <div key="kpis" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {data.kpis.filter((k) => !layout.hiddenKpis.includes(k.key)).map((k, i) => (
              <Kpi key={k.key} k={k} compareLabel={data.compare?.label} delay={i}
                onOpen={() => open(k.drill, k.label)} onOpenPrevious={() => open(k.drill, `${k.label} — ${data.compare?.label || 'previous'}`, true)} />
            ))}
          </div>
        );
        const showJourney = !layout.hidden.includes('journey');
        const showMoney = !layout.hidden.includes('money');
        if (block !== 'flow' || (!showJourney && !showMoney)) return null;
        return (
          <div key="flow" className="mt-4 grid gap-4 xl:grid-cols-3">
            {/* ─────────────────────────────── the journey ── */}
            {showJourney && <div className={`card ${showMoney ? 'xl:col-span-2' : 'xl:col-span-3'}`}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold text-ink">The customer journey</h2>
                  <p className="text-2xs text-muted">One person per stage · website counts browsers, the chat counts people · tap a stage to see who</p>
                </div>
              </div>
              <Funnel stages={data.funnel} compare={data.compare} onOpen={(s) => open(s.drill, s.label)} />
            </div>}

            {/* ─────────────────────────────── the money ── */}
            {showMoney && <div className={`card ${showJourney ? '' : 'xl:col-span-3'}`}>
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">What is left</h2>
                <p className="text-2xs text-muted">From what customers paid, worked out by the server</p>
              </div>
              <Money m={data.money} compareLabel={data.compare?.label} onOpen={() => open('payment_success', 'Payments')} />
            </div>}
          </div>
        );
      })}

      {drill && (
        <Drill drill={drill} params={params} onClose={() => setDrill(null)} />
      )}
    </Shell>
  );
}

/* ──────────────────────────────────────────────── KPI card ── */

function Kpi({ k, compareLabel, delay, onOpen, onOpenPrevious }) {
  const shown = useCountUp(k.value);
  const fmt = (v) => (k.money ? inr(v) : count(v));
  const up = k.change > 0; const down = k.change < 0;
  // Colour only where movement means something: better is green, worse red.
  const good = k.worse_up ? down : up; const bad = k.worse_up ? up : down;
  const tone = good ? 'text-good-700' : bad ? 'text-wrong-700' : 'text-muted';
  const stroke = good ? '#12a150' : bad ? '#d92d20' : '#0d9488';
  return (
    <div className={`card lift rise group cursor-pointer p-3 ${delay < 4 ? `rise-${delay + 1}` : ''}`}
      role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <Hint note={k.note} className="block">
        <div className="text-2xs uppercase tracking-wider text-muted">{k.label}</div>
      </Hint>
      <div className="mt-1 flex items-end justify-between gap-2">
        <div className="tabular text-xl font-bold text-ink">{fmt(shown)}</div>
        <div className="h-8 w-20 opacity-80 group-hover:opacity-100">
          {k.spark.some((v) => v) && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={k.spark.map((v, i) => ({ i, v }))}>
                <Line type="monotone" dataKey="v" stroke={stroke} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
      {k.previous == null ? (
        <div className="mt-1 text-2xs text-muted">No comparison</div>
      ) : (
        <button className={`mt-1 text-left text-2xs ${tone} hover:underline`}
          onClick={(e) => { e.stopPropagation(); onOpenPrevious(); }}
          title={`Open the ${compareLabel || 'previous period'}`}>
          {k.change === 0 ? '— same' : `${up ? '▲' : '▼'} ${k.change_pct == null ? 'new' : `${Math.abs(k.change_pct)}%`} · ${up ? '+' : ''}${fmt(k.change)}`}
          <span className="text-muted"> · was {fmt(k.previous)}</span>
        </button>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────── funnel ── */

export function Funnel({ stages, compare, onOpen }) {
  const most = Math.max(1, ...stages.map((s) => s.n || 0));
  return (
    <div className="divide-y divide-line">
      {stages.map((s, i) => (
        <div key={s.key}
          className={`flex items-center gap-3 px-4 py-2 ${s.drill ? 'cursor-pointer hover:bg-shell/70' : ''}`}
          onClick={() => s.drill && onOpen(s)} role={s.drill ? 'button' : undefined}>
          <div className="w-6 shrink-0 text-right text-2xs text-muted">{i + 1}</div>
          <div className="w-48 shrink-0 text-sm text-ink">{s.label}</div>
          <div className="relative h-6 flex-1 rounded bg-shell">
            {s.n == null ? (
              <Hint note={s.unavailable} className="block">
                <div className="flex h-6 items-center px-2 text-2xs italic text-muted">No data</div>
              </Hint>
            ) : (
              <div className="h-6 rounded bg-brand/80"
                style={{ width: `${Math.max(s.n / most * 100, s.n ? 2 : 0)}%`, transition: 'width .5s cubic-bezier(.2,.7,.3,1)', transitionDelay: `${i * 40}ms` }} />
            )}
          </div>
          <div className="tabular w-12 shrink-0 text-right text-sm font-semibold text-ink">{s.n == null ? '—' : <AnimatedNumber value={s.n} />}</div>
          <Hint right note={s.conversion_pct == null ? null
            : `${s.conversion_pct}% of “${s.from_stage}” reached this stage; ${s.drop_pct}% did not.`}>
            <div className="w-24 shrink-0 text-right text-2xs">
              {s.conversion_pct == null ? <span className="text-muted">—</span> : (
                <>
                  <span className="text-ink">{s.conversion_pct}%</span>
                  {s.drop_pct > 0 && <span className="text-wrong-700"> ↓{s.drop_pct}%</span>}
                </>
              )}
            </div>
          </Hint>
          <div className="hidden w-16 shrink-0 text-right text-2xs text-muted md:block">
            {compare && s.previous != null ? `was ${count(s.previous)}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────── money ── */

function Money({ m, compareLabel, onOpen }) {
  const rows = [
    ['Gross collected', m.gross_paise, 'What customers paid, GST included.'],
    ['GST', -m.gst_paise, 'The GST inside the price, owed to the government.'],
    ['Payment gateway', -m.gateway_paise, 'Razorpay fee and the GST on it, at the rates in Settings.'],
    ['WhatsApp messaging', -m.messaging_paise, 'Template messages sent, at the per-message rate in Settings.'],
    ['Records API', -m.api_cost_paise, 'Government-records calls, at the rates in Settings.'],
  ];
  const diff = m.previous_net_paise == null ? null : m.net_paise - m.previous_net_paise;
  return (
    <div className="px-4 py-3">
      {rows.map(([label, v, note]) => (
        <Hint key={label} note={note} className="block">
          <div className="flex justify-between py-1 text-sm">
            <span className="text-body">{label}</span>
            <span className={`tabular ${v < 0 ? 'text-muted' : 'text-ink'}`}>{v < 0 ? `− ${inr(-v)}` : inr(v)}</span>
          </div>
        </Hint>
      ))}
      <div className="mt-2 flex items-end justify-between border-t border-line pt-2">
        <span className="text-sm font-semibold text-ink">Net contribution</span>
        <span className={`tabular text-lg font-bold ${m.net_paise < 0 ? 'text-wrong-700' : 'text-ink'}`}>{inr(m.net_paise)}</span>
      </div>
      {diff != null && (
        <div className={`text-right text-2xs ${diff > 0 ? 'text-good-700' : diff < 0 ? 'text-wrong-700' : 'text-muted'}`}>
          {diff === 0 ? 'same' : `${diff > 0 ? '▲ +' : '▼ '}${inr(diff)}`} {compareLabel}
        </div>
      )}
      <button className="btn-quiet mt-3 w-full !py-1.5 text-2xs" onClick={onOpen}>Open the payments</button>
    </div>
  );
}

/* ──────────────────────────────────────────────── live ── */

function LiveNow() {
  const [live, setLive] = useState(null);
  const [feed, setFeed] = useState([]);
  const since = useRef(null);

  const poll = useCallback(async () => {
    try {
      const out = await api.commandLive(since.current);
      setLive(out);
      if (out.events.length) {
        setFeed((f) => [...f, ...out.events].slice(-60));
        since.current = out.last_id;
      }
    } catch { /* the next tick retries */ }
  }, []);
  useEffect(() => {
    poll();
    const t = setInterval(() => { if (!document.hidden) poll(); }, LIVE_MS);
    return () => clearInterval(t);
  }, [poll]);

  const c = live?.counters;
  const ok = live?.status?.level === 'operational';
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="card p-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`absolute inline-flex h-2.5 w-2.5 m-dot m-dot-live rounded-full ${ok ? 'bg-good-500/60' : 'bg-watch-500/60'}`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${ok ? 'bg-good-500' : 'bg-watch-500'}`} />
            </span>
            <span className="text-2xs font-semibold uppercase tracking-wider text-ink">Live now</span>
          </div>
          <span className={`text-2xs ${ok ? 'text-good-700' : 'text-watch-700'}`}>{live?.status?.text || 'Checking…'}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6">
          <Counter label="On the site" note="Browsers active on gaadipe.in in the last 5 minutes." v={c?.on_site} />
          <Counter label="Chatting" note="People who sent a WhatsApp message in the last 15 minutes." v={c?.chatting} />
          <Counter label="Lookups" note="Vehicle lookups in the last 15 minutes." v={c?.searches} />
          <Counter label="Paying now" note="Payment links opened in the last 30 minutes, not yet paid." v={c?.paying_now} />
          <Counter label="Paid, last hour" note="Payments completed in the last 60 minutes." v={c?.paid_hour} />
          <Counter label="Errors, last hour" note="Records-API failures and reports that could not be delivered." v={c == null ? null : c.api_errors + c.delivery_errors} bad />
        </div>
      </div>
      <div className="card">
        <div className="border-b border-line px-4 py-2 text-2xs font-semibold uppercase tracking-wider text-muted">As it happens</div>
        <ul className="max-h-40 overflow-y-auto">
          {!feed.length ? <li className="px-4 py-3 text-2xs text-muted">Waiting for activity…</li>
            : [...feed].reverse().map((e, i) => (
              <li key={e.id} className="fade flex items-center gap-2 px-4 py-1.5 text-2xs">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.status === 'failed' ? 'bg-wrong-500' : i === 0 ? 'breathe bg-good-500' : 'bg-line'}`} />
                <span className="tabular shrink-0 text-muted">{new Date(e.occurred_at).toLocaleTimeString('en-IN', { hour12: false })}</span>
                <span className="truncate text-body">
                  {e.words}{e.reg_no ? ` · ${e.reg_no}` : ''}{e.amount_paise ? ` · ${inr(e.amount_paise)}` : ''}
                  <span className="text-muted"> · {e.person_name || (e.mobile ? fmtMobile(e.mobile) : e.channel)}</span>
                </span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

function Counter({ label, note, v, bad = false }) {
  const shown = useCountUp(v || 0);
  return (
    <Hint note={note} className="block">
      <div>
        <div className="text-2xs text-muted">{label}</div>
        <div className={`tabular text-lg font-bold ${bad && v ? 'text-wrong-700' : 'text-ink'}`}>{v == null ? '—' : count(shown)}</div>
      </div>
    </Hint>
  );
}

/* ──────────────────────────────────────────────── drill-down ── */

export function Drill({ drill, params, onClose }) {
  const navigate = useNavigate();
  const [out, setOut] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.commandEvents({ ...params, what: drill.what, previous: drill.previous ? '1' : undefined })
      .then(setOut).catch(setError);
  }, [drill]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal wide title={drill.title}
      subtitle={out ? `${count(out.total)} event${out.total === 1 ? '' : 's'} · ${dateTime(out.period.from)} → ${dateTime(out.period.to)}` : 'Loading…'}
      onClose={onClose}>
      {error ? <Failed error={error} /> : !out ? <div className="p-4 text-sm text-muted">Loading…</div>
        : !out.rows.length ? <Empty>No events in this period.</Empty> : (
          <Table head={
            <tr>{['When', 'What', 'Who', 'Vehicle', 'Source', 'Amount', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr>
          }>
            {out.rows.map((e) => (
              <tr key={e.id}
                className={e.mobile || e.visitor_id ? 'cursor-pointer hover:bg-shell/70' : ''}
                title={e.mobile || e.visitor_id ? "Open this person's journey" : undefined}
                onClick={() => (e.mobile ? navigate(`/journey?mobile=${e.mobile}`)
                  : e.visitor_id ? navigate(`/journey?visitor=${e.visitor_id}`) : null)}>
                <td className="td tabular text-2xs text-muted">{dateTime(e.occurred_at)}</td>
                <td className="td text-sm">{e.words}{e.page && e.channel === 'web' ? <span className="text-2xs text-muted"> · {e.page}</span> : null}</td>
                <td className="td text-2xs">
                  {e.person_name && <div className="font-semibold text-ink">{e.person_name}</div>}
                  <div className="text-muted">{e.mobile ? fmtMobile(e.mobile) : e.visitor_id ? `Visitor ${e.visitor_id.slice(-6)}` : '—'}</div>
                </td>
                <td className="td text-2xs">{e.reg_no || '—'}</td>
                <td className="td text-2xs">{[e.source, e.campaign].filter(Boolean).join(' · ') || '—'}</td>
                <td className="td tabular text-2xs">{e.amount_paise ? inr(e.amount_paise) : '—'}</td>
                <td className="td">
                  {e.status === 'failed' ? <Chip tone="wrong">{e.error_code || 'failed'}</Chip>
                    : e.duration_ms ? <span className="text-2xs text-muted">{e.duration_ms} ms</span> : null}
                </td>
              </tr>
            ))}
          </Table>
        )}
      {out && out.total > out.rows.length && (
        <p className="px-4 py-2 text-2xs text-muted">Showing the latest {count(out.rows.length)} of {count(out.total)}.</p>
      )}
    </Modal>
  );
}

/* ─────────────────────────────────────────── personalisation (phase 7) ── */

const BLOCKS = { live: 'Live now', kpis: 'KPI cards', flow: 'Journey & money' };
const PARTS = { live: 'Live now', kpis: 'KPI cards', journey: 'The customer journey', money: 'What is left' };
const DEFAULT_LAYOUT = { order: ['live', 'kpis', 'flow'], hidden: [], hiddenKpis: [] };
const LAYOUT_KEY = 'gp.cc.layout';

/** Which blocks show, in what order, and which KPI cards — per browser. */
function useLayout() {
  const [layout, set] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
      if (v && Array.isArray(v.order) && v.order.length === DEFAULT_LAYOUT.order.length) return { ...DEFAULT_LAYOUT, ...v };
    } catch { /* private window or an old value */ }
    return DEFAULT_LAYOUT;
  });
  const save = (v) => {
    set(v);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(v)); } catch { /* private window */ }
  };
  return [layout, save];
}

function Customize({ layout, setLayout, kpis, onClose }) {
  const toggle = (list, key) => (layout[list].includes(key) ? layout[list].filter((x) => x !== key) : [...layout[list], key]);
  const move = (i, d) => {
    const o = [...layout.order]; const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    setLayout({ ...layout, order: o });
  };
  return (
    <div className="card fade mb-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Customise this screen</h2>
        <div className="flex gap-2">
          <button className="btn-quiet !py-1 text-2xs" onClick={() => setLayout(DEFAULT_LAYOUT)}>Reset</button>
          <button className="btn-primary !py-1 text-2xs" onClick={onClose}>Done</button>
        </div>
      </div>
      <p className="mt-1 text-2xs text-muted">Saved in this browser. The period you pick is remembered too.</p>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted">Order</div>
          {layout.order.map((b, i) => (
            <div key={b} className="mt-1 flex items-center justify-between rounded border border-line px-2 py-1 text-sm">
              <span>{BLOCKS[b]}</span>
              <span className="flex gap-1">
                <button className="btn-quiet !px-1.5 !py-0 text-2xs" disabled={!i} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                <button className="btn-quiet !px-1.5 !py-0 text-2xs" disabled={i === layout.order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
              </span>
            </div>
          ))}
        </div>
        <div>
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted">Show</div>
          {Object.entries(PARTS).map(([k, l]) => (
            <label key={k} className="mt-1 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!layout.hidden.includes(k)} onChange={() => setLayout({ ...layout, hidden: toggle('hidden', k) })} /> {l}
            </label>
          ))}
        </div>
        <div>
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted">KPI cards</div>
          <div className="mt-1 grid grid-cols-2 gap-x-2">
            {kpis.map((k) => (
              <label key={k.key} className="flex items-center gap-1.5 text-2xs">
                <input type="checkbox" checked={!layout.hiddenKpis.includes(k.key)}
                  onChange={() => setLayout({ ...layout, hiddenKpis: toggle('hiddenKpis', k.key) })} /> {k.label}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* A phone gets the six numbers that matter first; the rest follows below. */
function MobileSummary({ data }) {
  const k = Object.fromEntries(data.kpis.map((x) => [x.key, x]));
  const num = (v) => (v == null ? '—' : count(v));
  const cells = [
    ['Revenue', inr(k.revenue_paise?.value)], ['Payments', num(k.paid?.value)],
    ['Reports', num(k.reports?.value)], ['Visitors', num(k.visitors?.value)],
    ['WhatsApp', num(k.chatting?.value)], ['Net', inr(k.net_paise?.value)],
  ];
  return (
    <div className="card mb-3 grid grid-cols-3 gap-2 p-3 md:hidden">
      {cells.map(([l, v]) => (
        <div key={l}>
          <div className="text-[10px] uppercase tracking-wider text-muted">{l}</div>
          <div className="tabular text-base font-bold text-ink">{v}</div>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────── exports ── */

const EXPORTS = [
  ['events', 'All events'], ['customers', 'Customers'], ['payments', 'Payments'],
  ['searches', 'Vehicle lookups'], ['api', 'API usage'], ['whatsapp', 'WhatsApp messages'],
];
/* IST calendar day of an instant, as YYYY-MM-DD. */
const istDay = (t) => new Date(new Date(t).getTime() + 330 * 60000).toISOString().slice(0, 10);

/** CSV for the period on screen. Every export is recorded in the audit trail. */
function ExportMenu({ range }) {
  const [busy, setBusy] = useState(false);
  const go = async (kind) => {
    if (!kind) return;
    setBusy(true);
    try {
      const { blob, filename } = await api.exportCsv(kind, {
        from: istDay(range.from), to: istDay(new Date(new Date(range.to).getTime() - 1)),
      });
      saveBlob(blob, filename);
    } catch (e) { alert(e.message || 'Export failed.'); }
    setBusy(false);
  };
  return (
    <select className="input !w-auto !py-1.5 text-sm" value="" disabled={busy}
      onChange={(e) => go(e.target.value)} title="Download a CSV for this period">
      <option value="">{busy ? 'Exporting…' : 'Export CSV…'}</option>
      {EXPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

/* A number that counts up to its new value — briefly, and only when it changes. */
function useCountUp(target, ms = 500) {
  // Motion system: counts up from 0 the first time, then from the old value to
  // the new one — never back to zero; instant for Reduced / Minimal motion.
  const still = motionLevel() !== 'full';
  const [v, setV] = useState(still ? target || 0 : 0);
  const from = useRef(still ? target || 0 : 0);
  useEffect(() => {
    const start = performance.now(); const a = from.current; const b = Number(target || 0);
    if (a === b) return undefined;
    if (motionLevel() !== 'full') { from.current = b; setV(b); return undefined; }
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / ms);
      const cur = Math.round(a + (b - a) * (1 - (1 - p) ** 3));
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
