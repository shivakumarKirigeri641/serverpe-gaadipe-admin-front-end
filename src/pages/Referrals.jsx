import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSession, allowed } from '../lib/session';
import { mobile as fmtMobile, dateTime, count } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Chip, Empty, Failed, Modal, Spinner, Stat, Table, saveBlob } from '../components/ui.jsx';

/**
 * QuizPe referrals (user, 2026-09-21): who referred whom, who joined QuizPe
 * premium, which free reports were earned and used — and the customers who
 * agreed that QuizPe may message them (exportable for QuizPe).
 */
const TONE = { pending: 'watch', rewarded: 'good', expired: 'info', not_eligible: 'info', revoked: 'wrong' };
const LABEL = { pending: 'Waiting', rewarded: 'Rewarded', expired: 'Expired', not_eligible: 'Not eligible', revoked: 'Revoked' };

export default function Referrals() {
  const { can } = useSession();
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [consents, setConsents] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.referrals({ status: status || undefined }).then(setData).catch(setError);
  }, [status]);
  useEffect(load, [load]);

  const exportConsents = async () => {
    const out = await api.quizpeConsents();
    setConsents(out.rows);
    const csv = ['mobile,name,consent_at,consent_text',
      ...out.rows.map((r) => [r.mobile, `"${String(r.name || '').replace(/"/g, '""')}"`, r.quizpe_consent_at,
        `"${String(r.quizpe_consent_text || '').replace(/"/g, '""')}"`].join(','))].join('\n');
    saveBlob(new Blob([csv], { type: 'text/csv' }), `quizpe-consents-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const t = data?.totals;
  return (
    <Shell title="Referrals" subtitle="Refer QuizPe to a parent → a free GaadiPe full report. Nothing is ever sent to the parent."
      actions={
        <>
          <select className="input !w-40 !py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-quiet !py-1.5 text-2xs" onClick={exportConsents}>Export QuizPe consents (CSV)</button>
        </>
      }>
      {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <>
          {!data.quizpe_connected && (
            <Banner tone="watch" className="mb-4">
              QuizPe read-only access is not configured on this server (QUIZPE_RO_*), so referrals are recorded but not yet checked.
            </Banner>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Referrals" value={count(t.referrals)} sub={`${count(t.referrers)} referrers`} />
            <Stat label="Waiting" value={count(t.pending)} tone="watch" />
            <Stat label="Joined premium" value={count(t.rewarded)} tone="good"
              sub={t.referrals ? `${Math.round((t.rewarded / t.referrals) * 100)}% conversion` : null} />
            <Stat label="QuizPe revenue from referrals" value={`₹${Number(t.quizpe_revenue || 0).toLocaleString('en-IN')}`}
              sub={`${count(t.credits_used)} free reports used`} />
          </div>

          <div className="card mt-4">
            {!data.rows.length ? <Empty>No referrals yet.</Empty> : (
              <Table head={<tr>{['Referrer', 'Parent', 'Status', 'QuizPe payment', 'Free report', 'When', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {data.rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="td"><div className="font-semibold text-ink">{r.referrer_name || '—'}</div>
                      <div className="tabular text-2xs text-muted">{fmtMobile(r.referrer_mobile)}</div></td>
                    <td className="td"><div className="text-ink">{r.parent_name}</div>
                      <div className="tabular text-2xs text-muted">{r.mobile_masked}</div></td>
                    <td className="td"><Chip tone={TONE[r.status]}>{LABEL[r.status] || r.status}</Chip>
                      {r.status_reason && <div className="mt-0.5 text-2xs text-muted">{r.status_reason}</div>}</td>
                    <td className="td text-2xs text-muted">{r.quizpe_payment ? <>{r.quizpe_payment}<br />₹{r.quizpe_amount}</> : '—'}</td>
                    <td className="td text-2xs">{!r.credit_id ? '—' : r.revoked_at ? 'Revoked'
                      : r.used_at ? <>Used on <b>{r.used_reg_no}</b></> : <span className="text-good-700">Available</span>}</td>
                    <td className="td text-2xs text-muted">{dateTime(r.created_at)}</td>
                    <td className="td">
                      {r.credit_id && !r.used_at && !r.revoked_at && allowed(can, 'settings') && (
                        <button className="btn-quiet !px-2 !py-1 text-2xs text-wrong-700" onClick={() => setRevoking(r)}>Revoke</button>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
          {consents && <p className="mt-3 text-2xs text-muted">{count(consents.length)} customers have agreed that QuizPe may message them (exported).</p>}
        </>
      )}
      {revoking && <RevokeCredit r={revoking} onClose={() => setRevoking(null)} onDone={() => { setRevoking(null); load(); }} />}
    </Shell>
  );
}

function RevokeCredit({ r, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const go = async () => {
    setBusy(true); setError(null);
    try { await api.revokeReferralCredit(r.credit_id, reason); onDone(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Revoke this free report?" subtitle={`${r.referrer_name || fmtMobile(r.referrer_mobile)} · referred ${r.parent_name}`}
      onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn-primary !bg-wrong-700" disabled={busy || reason.trim().length < 3} onClick={go}>Revoke</button></>}>
      <p className="text-sm text-body">Use this only for abuse. The customer loses the unused free report. Recorded in the audit trail.</p>
      <textarea className="input mt-3 min-h-[70px]" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <Banner tone="wrong" className="mt-3">{error}</Banner>}
    </Modal>
  );
}
