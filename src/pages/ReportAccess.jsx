import { useState } from 'react';
import { api } from '../lib/api';
import { mobile as fmtMobile, date, dateTime } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Chip, Empty, Modal, Table } from '../components/ui.jsx';

/**
 * REPORT ACCESS (user, 2026-09-21) — the owner's switch for ONE customer's ONE
 * vehicle. Rare, and dangerous both ways:
 *
 *   Grant   a free full report — GaadiPe loses the Rs.19 it would have earned
 *   Revoke  the report, its daily updates and alerts stop now; if it was paid
 *           for, the refund policy says the customer is owed a refund
 *
 * Each needs a typed confirmation and a reason, and is written to the audit
 * trail. The page itself can be hidden (Settings → admin_report_access_enabled).
 */
export default function ReportAccess() {
  const [mobile, setMobile] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState(null);   // { kind: 'grant'|'revoke', vehicle }
  const [done, setDone] = useState(null);

  const find = async (e) => {
    e?.preventDefault();
    setBusy(true); setError(null); setDone(null);
    try { setData(await api.reportAccess(mobile)); } catch (err) { setData(null); setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Shell title="Report access" subtitle="Grant or take away one customer's full report for one vehicle — rare, and audited.">
      <Banner tone="wrong" className="mb-4">
        <b>Danger zone.</b> Granting gives a ₹19 report away free. Revoking stops a customer's report, daily updates and
        alerts at once — if they paid, a refund is due under the refund policy. Use only when really needed.
      </Banner>

      <form className="flex flex-wrap gap-2" onSubmit={find}>
        <input className="input !w-56" inputMode="numeric" placeholder="Customer mobile" value={mobile}
          onChange={(e) => setMobile(e.target.value)} />
        <button className="btn-primary" disabled={busy}>{busy ? 'Finding…' : 'Find customer'}</button>
      </form>
      {error && <Banner tone="wrong" className="mt-4">{error}</Banner>}
      {done && <Banner tone="good" className="mt-4">{done}</Banner>}

      {data && (
        <div className="card mt-4">
          <div className="border-b border-line px-4 py-3">
            <div className="font-semibold text-ink">{data.customer.name || 'No name'} · <span className="tabular">{fmtMobile(data.customer.mobile)}</span></div>
            <div className="text-2xs text-muted">{data.customer.email || 'no email'} · customer since {date(data.customer.created_at)}
              {data.customer.deactivated_at && ' · account closed'}</div>
          </div>
          {!data.vehicles.length ? <Empty>This customer has not checked any vehicle.</Empty> : (
            <Table head={<tr>{['Vehicle', 'Full report', 'Valid / alerts until', 'Last checked', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
              {data.vehicles.map((v) => (
                <tr key={v.reg_no} className="align-top">
                  <td className="td"><div className="tabular font-semibold text-ink">{v.reg_no}</div>
                    <div className="text-2xs text-muted">{[v.maker, v.model].filter(Boolean).join(' ')}</div></td>
                  <td className="td">{v.access === 'none' ? <Chip>None</Chip>
                    : <Chip tone={v.access === 'paid' ? 'good' : 'brand'}>{v.access === 'paid' ? `Paid ₹${Math.round((v.amount_paise || 0) / 100)}` : v.access}</Chip>}
                    {v.report_number && <div className="mt-0.5 text-2xs text-muted">{v.report_number}</div>}</td>
                  <td className="td text-2xs text-muted">{v.valid_until ? `download ${date(v.valid_until)}` : '—'}
                    {v.alerts_until && <><br />alerts {date(v.alerts_until)}</>}</td>
                  <td className="td text-2xs text-muted">{v.last_checked_at ? dateTime(v.last_checked_at) : '—'}</td>
                  <td className="td text-right">
                    {v.access === 'none'
                      ? <button className="btn-quiet !px-3 !py-1.5 text-2xs" onClick={() => setActing({ kind: 'grant', v })}>Grant full report</button>
                      : <button className="btn-quiet !px-3 !py-1.5 text-2xs text-wrong-700" onClick={() => setActing({ kind: 'revoke', v })}>Revoke</button>}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {acting && <Confirm acting={acting} customer={data.customer} onClose={() => setActing(null)}
        onDone={(msg) => { setActing(null); setDone(msg); find(); }} />}
    </Shell>
  );
}

function Confirm({ acting, customer, onClose, onDone }) {
  const grant = acting.kind === 'grant';
  const word = grant ? 'GRANT' : 'REVOKE';
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const paid = acting.v.access === 'paid';

  const go = async () => {
    setBusy(true); setError(null);
    try {
      const body = { user_id: customer.id, reg_no: acting.v.reg_no, reason, confirm: typed };
      if (grant) {
        const out = await api.grantReport(body);
        onDone(out.already ? `${acting.v.reg_no} already had a full report.` : `Free full report issued for ${acting.v.reg_no}.`);
      } else {
        const out = await api.revokeReport(body);
        onDone(`Report for ${acting.v.reg_no} revoked (${out.reports} report, ${out.watches} watch stopped).`
          + (out.paid_paise ? ` It was paid ₹${Math.round(out.paid_paise / 100)} — refund it in Razorpay.` : ''));
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={grant ? '⚠️ Give a full report free?' : '⚠️ Take this report away?'}
      subtitle={`${customer.name || fmtMobile(customer.mobile)} · ${acting.v.reg_no}`} onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary !bg-wrong-700" onClick={go}
          disabled={busy || typed !== word || reason.trim().length < 5}>{busy ? 'Working…' : grant ? 'Grant free report' : 'Revoke report'}</button></>}>
      <Banner tone="wrong">
        {grant
          ? <>GaadiPe <b>loses ₹19</b>: this customer gets the full record, the PDF and 28 days of daily updates without paying. No invoice is issued.</>
          : <>The customer <b>loses access now</b>: the report download, alerts and daily emails stop.
             {paid ? <> They <b>paid</b> for it — under the refund policy a refund is due unless they broke the terms.</> : null}</>}
      </Banner>
      <label className="mt-3 block text-sm text-body">Reason (kept in the audit trail)
        <textarea className="input mt-1 min-h-[70px]" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <label className="mt-3 block text-sm text-body">Type <b>{word}</b> to confirm
        <input className="input mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      {error && <Banner tone="wrong" className="mt-3">{error}</Banner>}
    </Modal>
  );
}
