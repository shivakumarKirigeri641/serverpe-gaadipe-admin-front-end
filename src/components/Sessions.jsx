import { dateTime, ago, duration, mobile as fmtMobile } from '../lib/format';
import { Hint } from './ui.jsx';

/*
 * A website visit: when it began, how long it lasted, how it ended and how much
 * was done in it (user, 2026-09-18). Used on the Sign-ins screen and inside a
 * customer.
 */
export const STATES = {
  online: ['Online now', 'bg-good-500 text-white'],
  idle: ['Signed in, idle', 'bg-good-50 text-good-700'],
  signed_out: ['Signed out', 'bg-shell text-body'],
  expired: ['Expired', 'bg-watch-50 text-watch-700'],
  deactivated: ['Account closed', 'bg-wrong-50 text-wrong-700'],
  ended: ['Ended', 'bg-shell text-muted'],
};

export function StateChip({ state }) {
  const [label, cls] = STATES[state] || STATES.ended;
  return (
    <span className={`chip ${cls}`}>
      {state === 'online' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />}
      {label}
    </span>
  );
}

/* How it ended, in words, with when. */
function ending(r) {
  if (r.state === 'online') return 'still active';
  if (r.state === 'idle') return `last active ${ago(r.last_used_at)}`;
  if (r.ended_reason === 'signed_out') return `signed out ${dateTime(r.ended_at)}`;
  if (r.ended_reason === 'expired') return `lapsed after ${dateTime(r.last_used_at)}`;
  if (r.ended_reason === 'deactivated') return `closed ${dateTime(r.ended_at)}`;
  return r.ended_at ? `ended ${dateTime(r.ended_at)}` : '—';
}

export function SessionsTable({ rows, showCustomer = false }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="border-b border-line bg-shell/60">
          <tr>
            {showCustomer && <th className="th">Customer</th>}
            <th className="th">Signed in</th><th className="th">Ended</th><th className="th">Stayed</th>
            <th className="th">Activity</th><th className="th">Device</th><th className="th">Place · IP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={r.id} className="cv-row hover:bg-shell/40" style={{ animationDelay: `${Math.min(i, 14) * 18}ms` }}>
              {showCustomer && (
                <td className="td">
                  <div className={r.name ? 'font-medium text-ink' : 'text-2xs italic text-muted'}>{r.name || 'No name given'}</div>
                  <div className="tabular text-2xs text-muted">{fmtMobile(r.mobile)}</div>
                </td>
              )}
              <td className="td whitespace-nowrap">
                <div className="text-ink">{dateTime(r.created_at)}</div>
                <div className="text-2xs text-muted">{ago(r.created_at)}</div>
              </td>
              <td className="td">
                <StateChip state={r.state} />
                <div className="mt-0.5 text-2xs text-muted">{ending(r)}</div>
              </td>
              <td className="td tabular font-semibold text-ink">{duration(r.seconds)}</td>
              <td className="td tabular">
                <Hint note={`${r.request_count} request${r.request_count === 1 ? '' : 's'} to GaadiPe while signed in — each page, check or download counts.`}>
                  <span className="border-b border-dotted border-muted/40">{r.request_count} req</span>
                </Hint>
              </td>
              <td className="td text-2xs text-body">
                {r.described || 'Unknown device'}
                {r.device_id && <div className="font-mono text-muted">{r.device_id.slice(0, 14)}…</div>}
              </td>
              <td className="td text-2xs">
                <div>{r.place || 'Unknown'}</div>
                <div className="font-mono text-muted">{r.ip}{r.last_ip && r.last_ip !== r.ip ? ` → ${r.last_ip}` : ''}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* The figures people ask first, as tiles. */
export function VisitSummary({ v }) {
  if (!v) return null;
  const tiles = [
    ['Times signed in', v.sign_ins, v.online_now ? 'Online now' : null],
    ['Time on the site', duration(v.seconds_total), `average ${duration(v.seconds_average)} · longest ${duration(v.seconds_longest)}`],
    ['Last signed in', v.last_sign_in_at ? ago(v.last_sign_in_at) : '—', v.last_sign_in_at ? dateTime(v.last_sign_in_at) : null],
    ['Last signed out', v.last_sign_out_at ? ago(v.last_sign_out_at) : 'Never', v.last_sign_out_at ? dateTime(v.last_sign_out_at) : 'always left signed in'],
    ['Activity', v.requests_total, `requests · ${v.devices} device${v.devices === 1 ? '' : 's'}`],
    ['Sessions', `${v.signed_out} out · ${v.expired} expired`, `${v.open_sessions} still open`],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map(([k, val, sub], i) => (
        <div key={k} className="cv-rise rounded-xl border border-line bg-white px-3 py-2.5" style={{ animationDelay: `${i * 25}ms` }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">{k}</div>
          <div className="tabular mt-0.5 text-base font-semibold text-ink">{val}</div>
          {sub && <div className={`text-2xs ${sub === 'Online now' ? 'font-semibold text-good-700' : 'text-muted'}`}>{sub}</div>}
        </div>
      ))}
    </div>
  );
}
