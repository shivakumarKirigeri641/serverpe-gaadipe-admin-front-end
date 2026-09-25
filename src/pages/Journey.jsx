import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { EntityNotes } from './ops/Notes.jsx';
import { api } from '../lib/api';
import Shell from '../components/Shell.jsx';
import { Hint, Failed, Empty, Chip, Skeleton } from '../components/ui.jsx';
import { count, dateTime, date, mobile as fmtMobile, ago } from '../lib/format';

/**
 * CUSTOMER JOURNEY (user, 2026-09-25, command center phase 3).
 *
 * One person, start to finish: the website visits their browsers made, each
 * WhatsApp message both ways, every step, lookup, API call, payment and
 * report — in order, with where they first and last came from and what
 * converted. Opened from the Command Center, Customers, or by searching here.
 */

const FILTERS = [
  ['all', 'Everything'], ['steps', 'Steps only'], ['messages', 'Messages only'],
  ['web', 'Website'], ['money', 'Payments & reports'], ['problems', 'Problems'],
];
const inr = (p) => `₹${(Number(p || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/* What each kind of moment looks like on the line. */
function look(i) {
  if (i.status === 'failed') return { dot: 'bg-wrong-500', icon: '!', tone: 'wrong' };
  if (i.kind === 'message') return i.direction === 'in'
    ? { dot: 'bg-brand', icon: '💬', tone: 'info' } : { dot: 'bg-line', icon: '↩', tone: 'info' };
  if (i.channel === 'web') return { dot: 'bg-watch-500', icon: '🌐', tone: 'watch' };
  if (/payment_success|report_delivered/.test(i.name)) return { dot: 'bg-good-500', icon: '✓', tone: 'good' };
  if (/payment|report/.test(i.name)) return { dot: 'bg-good-500', icon: '₹', tone: 'good' };
  if (/api/.test(i.name)) return { dot: 'bg-line', icon: '⚙', tone: 'info' };
  return { dot: 'bg-brand', icon: '•', tone: 'info' };
}

export default function Journey() {
  const [sp, setSp] = useSearchParams();
  const who = { mobile: sp.get('mobile') || undefined, user: sp.get('user') || undefined, visitor: sp.get('visitor') || undefined };
  const [typed, setTyped] = useState(who.mobile || '');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!who.mobile && !who.user && !who.visitor) { setData(null); return; }
    setData(undefined); setError(null);
    api.journey(who).then(setData).catch(setError);
  }, [sp.toString()]); // eslint-disable-line react-hooks/exhaustive-deps

  const find = (e) => {
    e.preventDefault();
    const d = typed.replace(/\D/g, '').slice(-10);
    if (d.length === 10) setSp({ mobile: d });
  };

  const items = useMemo(() => (data?.items || []).filter((i) => ({
    all: true,
    steps: i.kind === 'event' && i.channel !== 'web' && !/api/.test(i.name),
    messages: i.kind === 'message',
    web: i.channel === 'web',
    money: /payment|report/.test(i.name || ''),
    problems: i.status === 'failed',
  })[filter]), [data, filter]);

  const p = data?.profile;
  return (
    <Shell title="Customer journey"
      subtitle={p ? `${p.name || 'Unknown'} · ${p.mobile ? fmtMobile(p.mobile) : 'website visitor'} · ${count(data.items.length)} moments` : 'One person, start to finish'}
      actions={
        <form onSubmit={find} className="flex gap-2">
          <input className="input !w-44 !py-1.5 text-sm" placeholder="Mobile number" value={typed}
            onChange={(e) => setTyped(e.target.value)} inputMode="numeric" />
          <button className="btn-primary !py-1.5 text-2xs">Open</button>
        </form>
      }>

      {error ? <Failed error={error} /> : data === null ? (
        <Empty>Type a mobile number above, or open someone from the Command Center or Customers.</Empty>
      ) : data === undefined ? <Skeleton rows={8} /> : !data.found ? (
        <Empty>GaadiPe has never heard from this number.</Empty>
      ) : (
        <>
          {/* ─────────────────────────────── who ── */}
          <div className="grid gap-3 md:grid-cols-4">
            <div className="card p-4 md:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-bold text-ink">{p.name || 'Unknown'}</span>
                {p.mobile && <span className="tabular text-sm text-muted">{fmtMobile(p.mobile)}</span>}
                {p.opted_out ? <Chip tone="wrong">Replied STOP</Chip>
                  : p.in_window ? <Chip tone="good">In the 24-hour window</Chip> : p.mobile ? <Chip tone="info">WhatsApp quiet</Chip> : null}
                {p.spent_paise > 0 && <Chip tone="good">Paid</Chip>}
                {p.unfinished > 0 && <Chip tone="watch">{p.unfinished} unfinished payment{p.unfinished === 1 ? '' : 's'}</Chip>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-2xs text-body sm:grid-cols-3">
                <span>First seen <b className="text-ink">{p.first_seen ? date(p.first_seen) : '—'}</b></span>
                <span>Last active <b className="text-ink">{p.last_active ? ago(p.last_active) : '—'}</b></span>
                <span>Where <b className="text-ink">{[p.place?.city, p.place?.region].filter(Boolean).join(', ') || '—'}</b></span>
                <span>Device <b className="text-ink">{[p.device?.device_type, p.device?.os, p.device?.browser].filter(Boolean).join(' · ') || '—'}</b></span>
                <span>Bot state <b className="text-ink">{p.state || '—'}</b></span>
                <span>Browsers <b className="text-ink">{p.visitors.length || 'none linked'}</b></span>
              </div>
              {/* Lifetime (operations module, 2026-09-25). */}
              {p.searches != null && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted">
                  <span>Searches <b className="text-ink">{count(p.searches)}</b> ({count(p.unique_vehicles)} different)</span>
                  <span>Days active <b className="text-ink">{count(p.days_active)}</b></span>
                  <span>Payment failures <b className={p.payment_failures ? 'text-wrong-700' : 'text-ink'}>{count(p.payment_failures)}</b></span>
                  <span>Last vehicle <b className="text-ink">{p.last_vehicle ? <Link className="text-brand-deep hover:underline" to={`/vehicles/${p.last_vehicle}`}>{p.last_vehicle}</Link> : '—'}</b></span>
                  <span>Last channel <b className="text-ink">{p.last_channel === 'web' ? 'Website' : p.last_channel === 'whatsapp' ? 'WhatsApp' : '—'}</b></span>
                </div>
              )}
            </div>
            <Stat label="Spent" value={inr(p.spent_paise)} sub={`${count(p.payments)} payment${p.payments === 1 ? '' : 's'}`} />
            <Stat label="Vehicles · reports" value={`${count(p.vehicles)} · ${count(p.reports)}`} sub="checked · full reports" />
          </div>

          {/* ─────────────────────────────── where from ── */}
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Touch title="First touch" note="Where they came from the very first time." t={data.attribution.first_touch} />
            <Touch title="Last touch" note="The most recent place they came from." t={data.attribution.last_touch} />
            <Touch title="Converted" note="The first payment, and the channel it happened in."
              t={data.attribution.conversion && { at: data.attribution.conversion.at, channel: data.attribution.conversion.channel, source: 'paid' }}
              empty="Not paid yet" />
          </div>

          {/* Team notes on this customer (operations module). */}
          {p.user_id && (
            <div className="card mt-3 p-4">
              <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold text-ink">Team notes</h2>
                <Link className="text-2xs text-brand hover:underline" to={`/tasks?new=1&type=customer&id=${p.user_id}`}>Add a task →</Link></div>
              <EntityNotes type="customer" id={String(p.user_id)} />
            </div>
          )}

          {/* ─────────────────────────────── the timeline ── */}
          <div className="card mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Everything, in order</h2>
              <div className="flex flex-wrap gap-1">
                {FILTERS.map(([k, l]) => (
                  <button key={k} onClick={() => setFilter(k)}
                    className={`rounded-full border px-2.5 py-1 text-2xs ${filter === k ? 'border-brand bg-brand text-white' : 'border-line text-body hover:border-brand/40'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {!items.length ? <Empty>Nothing of this kind.</Empty> : (
              <ol className="relative px-4 py-3">
                <span className="absolute bottom-3 left-[27px] top-3 w-px bg-line" aria-hidden="true" />
                {items.map((i, n) => <Moment key={`${i.at}-${n}`} i={i} n={n} prev={items[n - 1]} />)}
              </ol>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="card p-4">
      <div className="text-2xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold text-ink">{value}</div>
      {sub && <div className="text-2xs text-muted">{sub}</div>}
    </div>
  );
}

function Touch({ title, note, t, empty = 'No data' }) {
  return (
    <Hint note={note} className="block">
      <div className="card p-3">
        <div className="text-2xs uppercase tracking-wider text-muted">{title}</div>
        {!t ? <div className="mt-1 text-sm italic text-muted">{empty}</div> : (
          <>
            <div className="mt-1 text-sm font-semibold text-ink">
              {String(t.source || t.channel).replace(/_/g, ' ')}{t.campaign ? ` · ${t.campaign}` : ''}
            </div>
            <div className="text-2xs text-muted">
              {String(t.channel).replace(/_/g, ' ')}{t.medium ? ` · ${t.medium}` : ''}{t.landing ? ` · ${t.landing}` : ''}
              {t.at ? ` · ${dateTime(t.at)}` : ''}
            </div>
          </>
        )}
      </div>
    </Hint>
  );
}

/* One moment on the line. A new day gets its own heading. */
function Moment({ i, n, prev }) {
  const l = look(i);
  const day = new Date(i.at).toDateString();
  const newDay = !prev || new Date(prev.at).toDateString() !== day;
  const details = [
    i.reg_no && `Vehicle ${i.reg_no}`,
    i.amount_paise ? inr(i.amount_paise) : null,
    i.payment_status && `payment ${i.payment_status}`,
    i.razorpay_payment_id && `Razorpay ${i.razorpay_payment_id}`,
    i.duration_ms != null && `${i.duration_ms} ms`,
    i.meta?.dataset && `${i.meta.dataset}${i.meta.cache_hit ? ' (cached)' : ''}`,
    i.page && i.channel === 'web' && i.page,
    i.source && i.channel === 'web' && [i.source, i.campaign].filter(Boolean).join(' · '),
    i.meta?.device && i.meta.device,
    i.meta?.place && i.meta.place,
    i.meta?.report_number,
    i.error_code && `Error: ${i.error_code}`,
  ].filter(Boolean);
  return (
    <>
      {newDay && (
        <li className="relative mb-1 mt-2 pl-10 text-2xs font-semibold uppercase tracking-wider text-muted first:mt-0">
          {new Date(i.at).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
        </li>
      )}
      <li className={`fade relative flex gap-3 py-1.5 ${n < 30 ? '' : ''}`} style={{ animationDelay: `${Math.min(n, 20) * 15}ms` }}>
        <span className={`relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] text-white ${l.dot}`}>
          {l.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="tabular text-2xs text-muted">{new Date(i.at).toLocaleTimeString('en-IN', { hour12: false })}</span>
            <span className={`text-sm ${i.status === 'failed' ? 'text-wrong-700' : 'text-ink'}`}>{i.words}</span>
            <span className="text-2xs text-muted">{i.channel}</span>
          </div>
          {i.body && (
            <div className={`mt-0.5 max-w-2xl whitespace-pre-wrap rounded-lg px-3 py-1.5 text-2xs ${
              i.direction === 'in' ? 'bg-brand/5 text-ink' : 'bg-shell text-body'}`}>
              {String(i.body).length > 400 ? `${String(i.body).slice(0, 400)}…` : i.body}
            </div>
          )}
          {details.length > 0 && <div className="mt-0.5 text-2xs text-muted">{details.join(' · ')}</div>}
        </div>
      </li>
    </>
  );
}
