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
              <Table head={<tr>{['Referrer', 'Parent (masked) · link', 'Status', 'QuizPe payment', 'Free report', 'Opened QuizPe', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {data.rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="td"><div className="font-semibold text-ink">{r.referrer_name || '—'}</div>
                      <div className="tabular text-2xs text-muted">{fmtMobile(r.referrer_mobile)}</div></td>
                    <td className="td"><div className="tabular text-ink">{r.mobile_masked}</div>
                      <div className="text-2xs text-muted">{r.code ? `GP-${r.code}` : r.parent_name}</div></td>
                    <td className="td"><Chip tone={TONE[r.status]}>{LABEL[r.status] || r.status}</Chip>
                      {r.status_reason && <div className="mt-0.5 text-2xs text-muted">{r.status_reason}</div>}</td>
                    <td className="td text-2xs text-muted">{r.quizpe_payment ? <>{r.quizpe_payment}<br />₹{r.quizpe_amount}</> : '—'}</td>
                    <td className="td text-2xs">{!r.credit_id ? '—' : r.revoked_at ? 'Revoked'
                      : r.used_at ? <>Used on <b>{r.used_reg_no}</b></> : <span className="text-good-700">Available</span>}</td>
                    <td className="td text-2xs text-muted">{dateTime(r.tapped_at || r.created_at)}</td>
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
          <Links canEdit={allowed(can, 'settings')} />

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
    <Modal title="Revoke this free report?" subtitle={`${r.referrer_name || fmtMobile(r.referrer_mobile)} · ${r.mobile_masked}`}
      onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn-primary !bg-wrong-700" disabled={busy || reason.trim().length < 3} onClick={go}>Revoke</button></>}>
      <p className="text-sm text-body">Use this only for abuse. The customer loses the unused free report. Recorded in the audit trail.</p>
      <textarea className="input mt-3 min-h-[70px]" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <Banner tone="wrong" className="mt-3">{error}</Banner>}
    </Modal>
  );
}

/* Every referral link — reset (the old link stops) or switch off, audited. */
function Links({ canEdit }) {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => { api.referralLinks().then((d) => setRows(d.rows)).catch(() => setRows([])); }, []);
  useEffect(load, [load]);
  const act = async (r, action) => {
    const reason = action === 'disable' ? window.prompt('Why switch this link off?') : null;
    if (action === 'disable' && !reason) return;
    if (action === 'reset' && !window.confirm(`Reset GP-${r.code}? The old link stops working at once.`)) return;
    await api.referralLinkAction(r.user_id, action, reason); load();
  };
  if (!rows) return <Spinner />;
  return (
    <div className="card mt-4">
      <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Referral links</div>
      {!rows.length ? <Empty>No customer has joined the referral programme yet.</Empty> : (
        <Table head={<tr>{['Customer', 'Link', 'Opened', 'Parents', 'Rewarded', 'State', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
          {rows.map((r) => (
            <tr key={r.user_id}>
              <td className="td"><div className="font-semibold text-ink">{r.name || '—'}</div><div className="tabular text-2xs text-muted">{fmtMobile(r.mobile)}</div></td>
              <td className="td tabular text-2xs">GP-{r.code}</td>
              <td className="td">{count(r.opened)}</td>
              <td className="td">{count(r.taps)}</td>
              <td className="td">{count(r.rewarded)}</td>
              <td className="td">{r.is_active ? (r.quizpe_consent_at ? <Chip tone="good">Active</Chip> : <Chip tone="watch">Consent withdrawn</Chip>)
                : <Chip tone="wrong">Off{r.disabled_reason ? ` · ${r.disabled_reason}` : ''}</Chip>}</td>
              <td className="td text-right">{canEdit && (
                <span className="flex justify-end gap-1">
                  <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => act(r, 'reset')}>Reset</button>
                  <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => act(r, r.is_active ? 'disable' : 'enable')}>{r.is_active ? 'Switch off' : 'Switch on'}</button>
                </span>)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
