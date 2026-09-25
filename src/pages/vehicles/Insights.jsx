import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Chip, Failed, Skeleton, Empty, Table, Banner } from '../../components/ui.jsx';
import { count, dateTime, ago } from '../../lib/format';
import { inr, ms, CHANNEL } from './common.jsx';

/**
 * WHAT THE VEHICLES SAY (user, 2026-09-25): three tabs.
 *
 *  Patterns — the most searched vehicles, RTOs, makers and models; vehicles
 *             searched again and again; one person with many vehicles; one
 *             vehicle with many people.
 *  Signals  — patterns worth a look, each with its reason and threshold.
 *             They are signals, not findings: nothing is blocked, banned or
 *             deleted because of them.
 *  Live     — vehicle events as they happen.
 */

const TABS = [['patterns', 'Search patterns'], ['signals', 'Risk signals'], ['live', 'Live vehicle events']];

export default function Insights() {
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some(([k]) => k === sp.get('tab')) ? sp.get('tab') : 'patterns';
  return (
    <Shell title="Vehicle intelligence" subtitle="Patterns, signals and the live stream"
      tabs={
        <nav className="flex gap-1">
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setSp({ tab: k })}
              className={`border-b-2 px-3 py-2.5 text-sm ${tab === k ? 'border-brand font-semibold text-brand-deep' : 'border-transparent text-body hover:text-ink'}`}>{l}</button>
          ))}
        </nav>
      }>
      {tab === 'patterns' && <Patterns />}
      {tab === 'signals' && <Signals />}
      {tab === 'live' && <LiveStream />}
    </Shell>
  );
}

const V = ({ reg, display }) => <Link to={`/vehicles/${reg}`} className="font-mono font-semibold text-brand-deep hover:underline">{display || reg}</Link>;

function Ranked({ title, rows, render, empty = 'Nothing in this period.' }) {
  const top = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">{title}</div>
      {!rows.length ? <Empty>{empty}</Empty> : (
        <ul className="divide-y divide-line">
          {rows.map((r, i) => (
            <li key={i} className="relative px-4 py-2 text-sm">
              <span className="absolute inset-y-0 left-0 bg-brand/5" style={{ width: `${(r.n / top) * 100}%` }} />
              <span className="relative flex items-center justify-between gap-2">{render(r)}<span className="tabular font-semibold text-ink">{count(r.n)}</span></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Patterns() {
  const [params, controls, key] = usePeriod('vehicle-intel', { defaultRange: '30d', withCompare: false });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.vehicleIntel(params)); } catch (e) { setError(e); } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <div className="mb-3 flex items-center justify-between"><span className="text-2xs text-muted">{d?.range.label}</span>{controls}</div>
      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          <Ranked title="Most searched vehicles" rows={d.most_searched} render={(r) => <span><V reg={r.reg_no} display={r.display} /> <span className="text-2xs text-muted">· {r.people} {r.people === 1 ? 'person' : 'people'}</span></span>} />
          <Ranked title="Most searched RTOs" rows={d.rtos} render={(r) => <Link to={`/vehicles?rto=${r.name}`} className="hover:underline">{r.name}</Link>} />
          <Ranked title="Most searched manufacturers" rows={d.makers} render={(r) => <span className="truncate">{r.name}</span>} />
          <Ranked title="Most searched models" rows={d.models} render={(r) => <span className="truncate">{r.name}</span>} />
          <Ranked title="Searched again and again" rows={d.repeated} render={(r) => <V reg={r.reg_no} display={r.display} />} empty="No vehicle was searched twice." />
          <Ranked title="Same vehicle, several people" rows={d.vehicle_many_people.map((x) => ({ ...x, n: x.people }))}
            render={(r) => <span><V reg={r.reg_no} display={r.display} /> <span className="text-2xs text-muted">· {r.n} people</span></span>} empty="No vehicle was searched by more than one person." />
          <div className="card overflow-hidden lg:col-span-2 xl:col-span-3">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Same person, several vehicles</div>
            {!d.person_many_vehicles.length ? <Empty>Nobody searched more than one vehicle.</Empty> : (
              <Table head={<tr>{['Customer', 'Vehicles', 'Lookups', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {d.person_many_vehicles.map((x, i) => (
                  <tr key={i}><td className="td font-mono">{x.customer}</td><td className="td tabular">{x.vehicles}</td><td className="td tabular">{x.n}</td>
                    <td className="td text-right">{x.ref?.startsWith('u') && <Link className="btn-quiet !px-2 !py-1 text-2xs" to={`/journey?user=${x.ref.slice(1)}`}>View customer</Link>}</td></tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}
      <p className="mt-3 text-2xs text-muted">These are patterns in who searched what — not accusations. Customer numbers are masked.</p>
    </>
  );
}

const SIGNAL_TONE = { person_many_vehicles: 'watch', vehicle_repeated: 'watch', device_many_mobiles: 'watch', payment_failures: 'wrong', api_heavy: 'wrong' };

function Signals() {
  const [params, controls, key] = usePeriod('vehicle-signals', { defaultRange: '7d', withCompare: false });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.vehicleSignals(params)); } catch (e) { setError(e); } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <Banner className="mb-3">Signals are patterns worth a look, not findings. Nothing is blocked, banned or deleted because of them — any action stays a person’s decision.</Banner>
      <div className="mb-3 flex items-center justify-between"><span className="text-2xs text-muted">{d?.range.label}</span>{controls}</div>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={5} /> : !d.rows.length ? <Empty>No signal in this period.</Empty> : (
          <Table head={<tr>{['When', 'Signal', 'Reason', 'Customer', 'Vehicle', 'Payment'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
            {d.rows.map((r, i) => (
              <tr key={i}>
                <td className="td whitespace-nowrap">{dateTime(r.at)}</td>
                <td className="td"><Chip tone={SIGNAL_TONE[r.kind]}>{r.signal}</Chip></td>
                <td className="td text-sm">{r.reason}{r.device ? <span className="text-2xs text-muted"> · browser {r.device}</span> : null}</td>
                <td className="td font-mono">{r.ref?.startsWith('u') ? <Link className="hover:underline" to={`/journey?user=${r.ref.slice(1)}`}>{r.customer}</Link> : r.customer || '—'}</td>
                <td className="td">{r.vehicle ? <V reg={r.vehicle} /> : '—'}{r.vehicles?.length > 1 ? <span className="text-2xs text-muted"> +{r.vehicles.length - 1}</span> : null}</td>
                <td className="td font-mono text-2xs">{r.payment ? `#${r.payment}` : '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      {d && (
        <p className="mt-2 text-2xs text-muted">
          Thresholds (Settings): {d.thresholds.vehicles_per_person_day} vehicles per person a day · {d.thresholds.lookups_per_vehicle_hour} lookups of one vehicle an hour ·
          {' '}{d.thresholds.mobiles_per_device} numbers per browser · {d.thresholds.payment_failures_day} failed payments a day · {d.thresholds.api_calls_per_person_hour} API calls per person an hour.
          Referral-loop signals are left out: GaadiPe has no referral programme for now.
        </p>
      )}
    </>
  );
}

const LIVE_TONE = { payment_success: 'good', report_delivered: 'good', report_generated: 'good', vehicle_search_failed: 'watch', vehicle_api_failed: 'wrong', payment_failed: 'wrong' };

function LiveStream() {
  const [rows, setRows] = useState(null);
  const [fresh, setFresh] = useState(new Set());
  const cursor = useRef(null);
  const tick = useCallback(async () => {
    if (document.hidden) return;
    try {
      const out = await api.vehicleLive(cursor.current || undefined);
      if (cursor.current && out.rows.length) {
        setFresh(new Set(out.rows.map((r) => r.id)));
        setRows((old) => [...out.rows, ...(old || [])].slice(0, 200));
      } else if (!cursor.current) setRows(out.rows);
      cursor.current = out.cursor;
    } catch { /* next tick */ }
  }, []);
  useEffect(() => { tick(); const t = setInterval(tick, 4000); return () => clearInterval(t); }, [tick]);
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm">
        <span className="relative flex h-2.5 w-2.5"><span className="m-dot m-dot-live h-2.5 w-2.5 bg-good-500" /></span>
        <b className="text-ink">Live</b><span className="text-2xs text-muted">· the last 24 hours, newest first · every 4 seconds</span>
      </div>
      {!rows ? <Skeleton rows={6} /> : !rows.length ? <Empty>No vehicle event in the last 24 hours.</Empty> : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-sm transition-colors duration-1000 ${fresh.has(r.id) ? 'm-row-new' : ''}`}>
              <span className="tabular w-20 shrink-0 text-2xs text-muted" title={dateTime(r.at)}>{new Date(r.at).toLocaleTimeString('en-IN', { hour12: false })}</span>
              <Chip tone={LIVE_TONE[r.name] || 'info'}>{r.label}</Chip>
              {r.reg_no ? <V reg={r.reg_no} display={r.display} /> : <span className="text-muted">—</span>}
              <span className="text-2xs text-muted">{[CHANNEL[r.channel], r.customer, r.duration_ms != null && ms(r.duration_ms), r.amount_paise != null && inr(r.amount_paise)].filter(Boolean).join(' · ')}</span>
              <span className="ml-auto text-2xs text-muted">{ago(r.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
