import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Hint } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { ago, dateTime } from '../../lib/format';
import { useSession, allowed } from '../../lib/session';

/**
 * OWNER CLAIMS (user, 2026-10-01, back end src/owners/verify.js). Customers
 * proving on WhatsApp that a vehicle is theirs — chassis number plus policy or
 * engine number from the RC. Every finished try is a row; what they typed is
 * never kept, only which parts matched. Approve one by hand (after an RC photo
 * by email), reject or revoke a badge, or unlock a number that ran out of tries.
 */
const STATUS = {
  verified: ['✅ Verified', 'bg-good-50 text-good-700'],
  pending: ['⏳ In progress', 'bg-shell text-body'],
  review: ['📸 Photo to check', 'bg-watch-50 text-watch-700'],
  failed: ['✕ Did not match', 'bg-watch-50 text-watch-700'],
  locked: ['🔒 Locked', 'bg-wrong-50 text-wrong-700'],
  rejected: ['⛔ Rejected', 'bg-wrong-50 text-wrong-700'],
  revoked: ['↩ Revoked', 'bg-shell text-muted'],
};
const PART = { chassis: 'Chassis', policy: 'Policy', engine: 'Engine' };

function Checks({ c }) {
  const parts = ['chassis', 'policy', 'engine'].filter((k) => typeof c?.[k] === 'boolean');
  if (!parts.length) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map((k) => (
        <span key={k} className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${c[k] ? 'bg-good-50 text-good-700' : 'bg-wrong-50 text-wrong-700'}`}>
          {c[k] ? '✓' : '✕'} {PART[k]}
        </span>
      ))}
    </span>
  );
}

export default function OwnerClaims() {
  const { can } = useSession();
  const canAct = allowed(can, 'block');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const load = useCallback(() => api.ownerClaims({ status: status || undefined, q: q || undefined })
    .then((x) => { setD(x); setError(null); }).catch(setError), [status, q]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const act = async (row, action) => {
    const ask = { approve: `Mark ${row.reg_no} as verified for ${row.masked}?`, reject: `Reject this claim on ${row.reg_no}?`,
      revoke: `Take the Owner verified badge for ${row.reg_no} away from ${row.masked}? A hidden vehicle becomes visible again.`,
      unlock: `Let ${row.masked} try ${row.reg_no} again now?` }[action];
    const note = action === 'unlock' ? '' : window.prompt(`${ask}\n\nA note for the record (optional):`, '');
    if (note === null || (action === 'unlock' && !window.confirm(ask))) return;
    setBusy(`${row.id}:${action}`);
    try {
      await api.ownerClaimAction(row.id, action, note || undefined);
      snack({ approve: 'Marked verified', reject: 'Claim rejected', revoke: 'Badge revoked', unlock: 'Unlocked — they can try again' }[action]);
      load();
    } catch (e) {
      snack(e.message || 'That did not work', 'wrong');
    } finally { setBusy(null); }
  };

  const t = d?.totals || {};
  return (
    <Shell title="Owner claims" subtitle="Customers proving a vehicle is theirs with their RC — verified owners get a badge and can hide the vehicle">
      {d && !d.enabled && (
        <div className="mb-4 rounded-xl border border-watch-500/40 bg-watch-50 px-4 py-3 text-sm text-body">
          <b className="text-ink">Owner verification is off.</b> Customers are not offered it. Switch on <b>Owner verification</b> in{' '}
          <Link to="/flags" className="font-semibold text-brand hover:underline">Feature flags</Link> when you are ready.
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[['Verified owners', t.verified || 0, 'verified'], ['Hidden by owner', d ? d.rows.filter((r) => r.status === 'verified' && r.hidden_at).length : 0, 'verified'],
          ['Did not match', (t.failed || 0), 'failed'], ['Locked now', d ? d.rows.filter((r) => r.status === 'locked' && r.locked_until && new Date(r.locked_until) > new Date()).length : 0, 'locked']]
          .map(([label, n, s]) => (
            <button key={label} type="button" onClick={() => setStatus(status === s ? '' : s)}
              className={`card m-press p-3 text-left ${status === s ? 'ring-2 ring-brand' : ''}`}>
              <div className="text-2xs text-muted">{label}</div>
              <div className="text-xl font-bold text-ink">{n}</div>
            </button>
          ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input !w-56 !py-1.5 text-sm" placeholder="Vehicle or last digits" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-auto !py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Every status</option>
          {Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : (
        <div className="card overflow-x-auto">
          {!d.rows.length ? <p className="p-6 text-center text-sm text-muted">No claims yet.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-2xs text-muted">
                <th className="px-4 py-2">Vehicle</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">What matched</th><th className="px-4 py-2">When</th><th className="px-4 py-2" />
              </tr></thead>
              <tbody>
                {d.rows.map((r) => {
                  const [label, tone] = STATUS[r.status] || [r.status, 'bg-shell text-body'];
                  const lockedNow = r.locked_until && new Date(r.locked_until) > new Date();
                  return (
                    <tr key={r.id} className="border-b border-line/60 last:border-0 align-top">
                      <td className="whitespace-nowrap px-4 py-2 font-mono font-semibold text-ink">{r.reg_no}
                        {r.status === 'verified' && r.hidden_at && <Hint note={`Hidden from other people's checks since ${dateTime(r.hidden_at)}`}><span className="ml-1.5 rounded bg-ink px-1.5 py-0.5 font-sans text-[10px] text-white">🙈 hidden</span></Hint>}
                      </td>
                      <td className="px-4 py-2">{r.name || 'Unknown'}<div className="whitespace-nowrap text-2xs text-muted">{r.masked}</div></td>
                      <td className="px-4 py-2">
                        <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold ${tone}`}>{label}</span>
                        {lockedNow && <div className="mt-1 text-[10px] text-muted">until {dateTime(r.locked_until)}</div>}
                        {!r.counted && r.status !== 'verified' && <div className="mt-1 text-[10px] text-muted">{r.note === 'not finished' ? 'left unfinished' : 'unlocked'} · not counted</div>}
                        {r.reviewed_by_name && <div className="mt-1 text-[10px] text-muted">by {r.reviewed_by_name}{r.note ? ` — ${r.note}` : ''}</div>}
                      </td>
                      <td className="px-4 py-2"><Checks c={r.checks} /></td>
                      <td className="px-4 py-2 text-2xs text-muted"><Hint note={dateTime(r.created_at)}><span>{ago(r.verified_at || r.created_at)}</span></Hint></td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        {canAct && (
                          <span className="inline-flex gap-1">
                            {['failed', 'locked', 'rejected', 'revoked'].includes(r.status) && <button className="btn-quiet !py-1 text-2xs" disabled={busy} onClick={() => act(r, 'approve')}>Approve</button>}
                            {r.status === 'locked' && lockedNow && <button className="btn-quiet !py-1 text-2xs" disabled={busy} onClick={() => act(r, 'unlock')}>Unlock</button>}
                            {r.status === 'verified' && <button className="btn-quiet !py-1 text-2xs text-wrong-700" disabled={busy} onClick={() => act(r, 'revoke')}>Revoke</button>}
                            {r.status === 'pending' && <button className="btn-quiet !py-1 text-2xs text-wrong-700" disabled={busy} onClick={() => act(r, 'reject')}>Reject</button>}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
      <p className="mt-3 text-2xs text-muted">
        How it works: on WhatsApp, More → <i>I own a vehicle</i> (or typing <i>verify</i>). Step 1 the chassis number, step 2 the insurance
        policy or engine number — compared with the Government record; nothing typed is stored. 3 misses lock that vehicle for that number for 24 hours.
      </p>
    </Shell>
  );
}
