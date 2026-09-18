import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { dateTime, ago, mobile as fmtMobile } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Chip, Empty, Failed, Hint, Modal, Pager, PAGE_SIZE, Spinner } from '../components/ui.jsx';

/**
 * Every sign-in step on the website (user, 2026-09-18): each code asked for,
 * each refusal, each wrong code, each sign-in, sign-out and lapsed session —
 * with the network and the device behind it.
 *
 * Tap a device id or an IP to see everything else it has touched: one phone
 * signing in to many numbers, or one number from many phones, is the pattern
 * worth noticing, and it is one tap away rather than a query.
 */
export const EVENTS = {
  code_requested: ['Code requested', 'info'],
  code_refused: ['Code refused', 'watch'],
  sign_in_failed: ['Sign-in failed', 'wrong'],
  signed_in: ['Signed in', 'good'],
  signed_out: ['Signed out', 'info'],
  session_expired: ['Session expired', 'info'],
};
export const OUTCOMES = {
  wrong_code: 'wrong code', code_expired: 'code expired', too_many_attempts: 'too many wrong codes',
  too_many: 'too many codes this hour', wait: 'asked again too soon', blocked: 'number blocked',
  not_allowed: 'not an allowed test number', bad_mobile: 'not a valid number',
  new_customer: 'new customer', reactivated: 'account reactivated',
};

export default function SignIns() {
  const [q, setQ] = useState('');
  const [event, setEvent] = useState('');
  const [filter, setFilter] = useState(null);          // { device_id } or { ip }
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => { setPage(1); }, [q, event, filter]);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.signIns({ q, event, ...(filter || {}), limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }));
    } catch (e) { setError(e); }
  }, [q, event, filter, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useAutoRefresh(load);

  const s = data?.summary;

  return (
    <Shell title="Sign-ins" subtitle="Every sign-in step on gaadipe.in, with the device and network behind it"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <input className="input !w-56 !py-1.5 text-sm" placeholder="Number, IP, device, model…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input !w-auto !py-1.5 text-sm" value={event} onChange={(e) => setEvent(e.target.value)}>
            <option value="">Every step</option>
            {Object.entries(EVENTS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
      }>

      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
          {[['Signed in, 24h', s.sign_ins_today], ['Failed or refused, 24h', s.failures_today, s.failures_today ? 'text-wrong-700' : ''],
            ['Open sessions', s.open_sessions], ['Devices seen', s.devices], ['IP addresses', s.ips]].map(([k, v, tone], i) => (
            <div key={k} className="card cv-rise cv-tile px-4 py-3" style={{ animationDelay: `${i * 30}ms` }}>
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{k}</div>
              <div className={`tabular mt-1 text-2xl font-semibold ${tone || 'text-ink'}`}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {filter && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Only</span>
          <span className="chip bg-brand/10 font-mono text-brand-deep">{filter.device_id ? `device ${filter.device_id}` : `IP ${filter.ip}`}</span>
          <button type="button" className="btn-quiet !px-2.5 !py-1 text-2xs" onClick={() => setFilter(null)}>Show everything</button>
        </div>
      )}

      <div className="card">
        {error ? <Failed error={error} onRetry={load} />
          : !data ? <Spinner />
          : !data.rows.length ? <Empty>No sign-in activity{q || event || filter ? ' matches' : ' yet'}.</Empty>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="border-b border-line bg-shell/60">
                  <tr>
                    <th className="th">When</th><th className="th">Step</th><th className="th">Customer</th>
                    <th className="th">Device</th><th className="th">Place</th><th className="th">IP</th><th className="th">Device id</th><th className="th"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.rows.map((r, i) => <Row key={r.id} r={r} i={i} onOpen={() => setOpen(r)} onFilter={setFilter} />)}
                </tbody>
              </table>
            </div>
          )}
        {data && <Pager page={page} total={data.total} onPage={setPage} />}
      </div>

      {open && <Detail r={open} onClose={() => setOpen(null)} onFilter={(f) => { setFilter(f); setOpen(null); }} />}
    </Shell>
  );
}

export function Row({ r, i = 0, onOpen, onFilter, showNumber = true }) {
  const [label, tone] = EVENTS[r.event] || [r.event, 'info'];
  return (
    <tr className="cv-row cursor-pointer transition hover:bg-shell/50" style={{ animationDelay: `${Math.min(i, 14) * 18}ms` }} onClick={onOpen}>
      <td className="td whitespace-nowrap">
        <Hint note={dateTime(r.created_at)}><span className="text-2xs text-body">{ago(r.created_at)}</span></Hint>
      </td>
      <td className="td">
        <Chip tone={tone}>{label}</Chip>
        {r.outcome && <div className="mt-0.5 text-2xs text-muted">{OUTCOMES[r.outcome] || r.outcome}</div>}
      </td>
      {showNumber && (
        <td className="td">
          <div className={r.name ? 'font-medium text-ink' : 'text-2xs italic text-muted'}>{r.name || 'No name given'}</div>
          <div className="tabular text-2xs text-muted">{r.mobile ? fmtMobile(r.mobile) : '—'}</div>
        </td>
      )}
      <td className="td">
        <Hint note={<DeviceNote r={r} />}>
          <span className="border-b border-dotted border-muted/40 text-body">{r.described || 'Unknown device'}</span>
        </Hint>
      </td>
      <td className="td text-2xs">
        {r.place || <span className="text-muted">Unknown</span>}
      </td>
      <td className="td">
        {r.ip ? (
          <button type="button" className="font-mono text-2xs text-brand-deep hover:underline"
            onClick={(e) => { e.stopPropagation(); onFilter?.({ ip: r.ip }); }}>{r.ip}</button>
        ) : '—'}
      </td>
      <td className="td">
        {r.device_id ? (
          <button type="button" className="font-mono text-2xs text-brand-deep hover:underline" title={r.device_id}
            onClick={(e) => { e.stopPropagation(); onFilter?.({ device_id: r.device_id }); }}>{r.device_id.slice(0, 11)}…</button>
        ) : <span className="text-2xs text-muted">—</span>}
      </td>
      <td className="td text-right text-2xs text-brand-deep">Details ›</td>
    </tr>
  );
}

function DeviceNote({ r }) {
  return (
    <span className="block space-y-0.5">
      <b className="block text-ink">{r.described || 'Unknown device'}</b>
      {r.screen && <span className="block">Screen {r.screen} · window {r.viewport || '—'}</span>}
      {r.timezone && <span className="block">Time zone {r.timezone}</span>}
      {r.languages && <span className="block">Languages {r.languages}</span>}
      {r.connection && <span className="block">Network {r.connection}</span>}
      <span className="block break-all text-muted">{r.user_agent || 'No user agent'}</span>
    </span>
  );
}

/** Every field recorded for one step. */
export function Detail({ r, onClose, onFilter }) {
  const [label, tone] = EVENTS[r.event] || [r.event, 'info'];
  let client = null;
  try { client = typeof r.client === 'string' ? JSON.parse(r.client) : r.client; } catch { client = r.client; }
  const rows = [
    ['When', dateTime(r.created_at)],
    ['Step', <Chip key="s" tone={tone}>{label}</Chip>],
    ['Outcome', r.outcome ? (OUTCOMES[r.outcome] || r.outcome) : null],
    ['Name', r.name || 'No name given'],
    ['Number', r.mobile ? fmtMobile(r.mobile) : null],
    ['Customer id', r.user_id],
    ['Session id', r.session_id],
    ['Device id', r.device_id],
    ['IP address', r.ip],
    ['Proxy chain', r.ip_chain],
    ['Place (from IP, approximate)', r.place || [r.city, r.region, r.country].filter(Boolean).join(', ') || null],
    ['Device', [r.device_type, r.device_vendor, r.device_model].filter(Boolean).join(' · ') || null],
    ['Operating system', [r.os, r.os_version].filter(Boolean).join(' ') || null],
    ['Browser', [r.browser, r.browser_version].filter(Boolean).join(' ') || null],
    ['Platform', r.platform],
    ['Screen', r.screen],
    ['Window', r.viewport],
    ['Touch points', r.touch_points],
    ['CPU cores', r.cpu_cores],
    ['Memory', r.memory_gb != null ? `${r.memory_gb} GB` : null],
    ['Network', r.connection],
    ['Time zone', r.timezone],
    ['Languages', r.languages],
    ['Came from', r.referrer],
    ['Page', r.page],
    ['User agent', r.user_agent],
  ];
  return (
    <Modal wide title={`${label} · ${r.mobile ? fmtMobile(r.mobile) : 'no number'}`} subtitle={r.described || ''} onClose={onClose}
      footer={
        <>
          {r.device_id && onFilter && <button type="button" className="btn-quiet" onClick={() => onFilter({ device_id: r.device_id })}>Everything from this device</button>}
          {r.ip && onFilter && <button type="button" className="btn-quiet" onClick={() => onFilter({ ip: r.ip })}>Everything from this IP</button>}
          <button type="button" className="btn-primary" onClick={onClose}>Close</button>
        </>
      }>
      <dl className="grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-2">
        {rows.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line/60 pb-1.5">
            <dt className="shrink-0 text-muted">{k}</dt>
            <dd className="min-w-0 break-all text-right font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      {client && (
        <details>
          <summary className="cursor-pointer text-2xs font-semibold text-muted">What the browser reported</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-ink/95 p-3 text-2xs text-white">{JSON.stringify(client, null, 2)}</pre>
        </details>
      )}
    </Modal>
  );
}
