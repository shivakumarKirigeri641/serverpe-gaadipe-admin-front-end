import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { mobile as fmtMobile, dateTime, count } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Chip, Empty, Failed, Spinner, Stat, Table } from '../components/ui.jsx';

/**
 * REFER A FRIEND WHO ALSO HAS A VEHICLE (user, 2026-09-23).
 *
 * Every referral, and how far it got: opened the link, signed in, paid. Only
 * the last of those earns anything, so "Waiting" is the number worth watching —
 * people who came through a link and have not bought yet.
 *
 * Numbers are masked on both sides. This screen answers "is the programme
 * working, and is anyone gaming it", not "who can I ring".
 */
const TONE = { tapped: 'info', signed_up: 'watch', rewarded: 'good', expired: 'info', not_eligible: 'wrong' };
const LABEL = { tapped: 'Opened', signed_up: 'Signed in, not bought', rewarded: 'Rewarded',
                expired: 'Too late', not_eligible: 'Not counted' };

export default function GpReferrals() {
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.gpReferrals({ status: status || undefined }).then(setData).catch(setError);
  }, [status]);
  useEffect(load, [load]);

  const t = data?.totals;
  const rupees = (paise) => `₹${((paise || 0) / 100).toFixed(2)}`;

  return (
    <Shell title="Referrals" subtitle="Refer a friend who buys a report → your next report is free."
      actions={
        <select className="input !w-52 !py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      }>
      {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <>
          {!data.enabled && (
            <Banner tone="watch">
              <b>Referrals are switched off.</b> Existing credits stay usable; no new ones are granted.
            </Banner>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Came through a link" value={count(t.referrals)} sub={`${count(t.referrers)} referrer(s)`} />
            <Stat label="Signed in, not bought" value={count(t.waiting)} />
            <Stat label="Rewarded" value={count(t.rewarded)} sub={`${count(t.credits_used)} used · ${count(t.credits_waiting)} waiting`} />
            <Stat label="Revenue they brought" value={rupees(t.revenue_paise)} sub={`cap ${data.monthly_cap}/month`} />
          </div>

          <p className="mt-3 text-2xs text-muted">
            A referral counts only when the referred person's payment is confirmed. It lapses after {data.window_days} days
            without a purchase, and a free report must be used within {data.credit_valid_days} days. If the payment is
            refunded, an unused credit is withdrawn automatically.
          </p>

          <div className="card mt-4">
            <Table head={<tr>{['Referrer', 'Who came', 'Stage', 'Paid', 'Their free report', 'When'].map((h) =>
              <th key={h} className="th">{h}</th>)}</tr>}>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="td">
                    <div className="font-semibold text-ink">{r.referrer_name || '—'}</div>
                    <div className="text-2xs text-muted">{fmtMobile(r.referrer_mobile)} · {r.code}</div>
                  </td>
                  <td className="td">
                    <div className="text-sm text-ink">{r.mobile_masked || '—'}</div>
                    {r.device_id && <div className="text-2xs text-muted">device {String(r.device_id).slice(0, 8)}</div>}
                  </td>
                  <td className="td">
                    <Chip tone={TONE[r.status] || 'info'}>{LABEL[r.status] || r.status}</Chip>
                    {r.status_reason && <div className="mt-0.5 text-2xs text-muted">{r.status_reason}</div>}
                  </td>
                  <td className="td text-sm">{r.amount_paise ? rupees(r.amount_paise) : '—'}</td>
                  <td className="td text-2xs">
                    {!r.credit_id ? <span className="text-muted">—</span>
                      : r.revoked_at ? <span className="text-wrong-700">Withdrawn — {r.revoked_reason}</span>
                      : r.used_at ? <span className="text-good-700">Used on {r.used_reg_no}</span>
                      : <span className="text-body">Waiting · until {dateTime(r.credit_expires_at)}</span>}
                  </td>
                  <td className="td text-2xs text-muted">
                    {r.rewarded_at ? dateTime(r.rewarded_at)
                      : r.signed_up_at ? dateTime(r.signed_up_at) : dateTime(r.created_at)}
                  </td>
                </tr>
              ))}
            </Table>
            {data.rows.length === 0 && <Empty>No referrals yet.</Empty>}
          </div>
        </>
      )}
    </Shell>
  );
}
