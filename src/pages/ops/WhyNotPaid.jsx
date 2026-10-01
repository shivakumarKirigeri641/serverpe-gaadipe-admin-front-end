import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Hint } from '../../components/ui.jsx';
import { ago } from '../../lib/format';

/**
 * WHY DIDN'T THEY PAY? (user, 2026-10-01). Everyone shown a free check on
 * WhatsApp, split by what that check showed — nothing wrong, one thing, two or
 * more — and how far each group got: tapped ₹19, got the payment link, paid.
 * Which free check converts says what message sells. Below, the latest people
 * who did not pay and where they stopped, each a tap from their journey.
 */
const TONE = { clear: 'from-good-500 to-emerald-400', one: 'from-amber-500 to-yellow-400', more: 'from-rose-600 to-orange-400' };
const ICON = { clear: '✅', one: '⚠️', more: '🚨' };

export default function WhyNotPaid() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.whyNotPaid({ days }).then((x) => { setD(x); setError(null); }).catch(setError), [days]);
  useEffect(() => { load(); }, [load]);

  return (
    <Shell title="Why didn't they pay?" subtitle="Free checks on WhatsApp, by what they showed, and how far each person got"
      actions={
        <select className="input !w-auto !py-1.5 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90].map((n) => <option key={n} value={n}>Last {n} days</option>)}
        </select>
      }>
      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={8} /> : (
        <>
          <p className="mb-3 text-sm text-body">
            <b className="text-ink">{d.total}</b> people saw a free check · <b className="text-ink">{d.paid}</b> paid
            {d.total ? ` (${Math.round((d.paid / d.total) * 1000) / 10}%)` : ''}
            {d.challans.shown ? ` · with pending challans: ${d.challans.paid} of ${d.challans.shown} paid` : ''}
          </p>
          <div className="mb-5 grid gap-3 md:grid-cols-3">
            {d.groups.map((g) => (
              <div key={g.key} className="card overflow-hidden">
                <div className={`bg-gradient-to-r ${TONE[g.key]} px-4 py-2 text-sm font-semibold text-white`}>{ICON[g.key]} {g.label}</div>
                <div className="space-y-2 p-4">
                  {[['Saw the free check', g.shown], ['Tapped ₹19', g.tapped], ['Got the payment link', g.link], ['Paid', g.paid]].map(([l, v], i) => (
                    <div key={l}>
                      <div className="flex justify-between text-2xs"><span className="text-body">{l}</span><b className="text-ink">{v}</b></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-shell">
                        <div className={`h-full rounded-full bg-gradient-to-r ${TONE[g.key]}`}
                          style={{ width: `${g.shown ? Math.max(v ? 3 : 0, (v / g.shown) * 100) : 0}%`, transition: `width .9s cubic-bezier(.2,.8,.2,1) ${i * 0.1}s` }} />
                      </div>
                    </div>
                  ))}
                  <div className="pt-1 text-right text-sm"><Hint note="Paid ÷ saw the free check"><span className="font-bold text-ink">{g.paid_pct == null ? '—' : `${g.paid_pct}%`}</span></Hint> <span className="text-2xs text-muted">paid</span></div>
                </div>
              </div>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Didn’t pay — latest first</div>
            {!d.stuck.length ? <p className="p-4 text-sm text-muted">Everyone who saw a free check paid. 🎉</p> : (
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-2">Customer</th><th className="px-3 py-2">Vehicle</th><th className="px-3 py-2">Free check showed</th><th className="px-3 py-2">Got as far as</th><th className="px-3 py-2">When</th><th />
                </tr></thead>
                <tbody>
                  {d.stuck.map((r) => (
                    <tr key={`${r.mobile}-${r.reg_no}`} className="border-b border-line/60">
                      <td className="px-4 py-2">{r.name || 'Unknown'} <span className="text-2xs text-muted">{r.masked}</span></td>
                      <td className="px-3 py-2 font-mono text-2xs">{r.reg_no}</td>
                      <td className="px-3 py-2 text-2xs">{ICON[r.group]} {r.expired ? `${r.expired} expired` : ''}{r.expired && r.challans ? ' · ' : ''}{r.challans ? `${r.challans} challan${r.challans === 1 ? '' : 's'}` : ''}{!r.expired && !r.challans ? 'All clear' : ''}</td>
                      <td className="px-3 py-2 text-2xs">{r.reached}</td>
                      <td className="px-3 py-2 text-2xs text-muted">{ago(r.at)}</td>
                      <td className="px-3 py-2 text-right"><Link to={`/journey?mobile=${r.mobile}`} className="text-2xs font-semibold text-brand-deep hover:underline">Journey →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
