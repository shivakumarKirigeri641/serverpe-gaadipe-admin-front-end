import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Chip, Failed, Skeleton, Empty, Table, Pager, Modal, Field, Banner } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { dateTime, ago } from '../../lib/format';
import { rs, num } from './common.jsx';

/**
 * PAYMENT RECONCILIATION (user, 2026-09-25) — GaadiPe's payment records
 * against Razorpay's. A run is server-side and compares only: no payment is
 * changed from here. It runs by itself once a day; "Run reconciliation"
 * starts one now. Anything that does not match can be marked reviewed, with a
 * note, and that is logged.
 */
const RESULT = {
  matched: ['Matched', 'good'], pending: ['Pending (unpaid both sides)', 'info'], missing_from_gateway: ['Missing from gateway', 'wrong'],
  missing_internally: ['Missing internally', 'wrong'], amount_mismatch: ['Amount mismatch', 'wrong'], status_mismatch: ['Status mismatch', 'wrong'],
  webhook_missing: ['Webhook missing', 'watch'], refund_mismatch: ['Refund mismatch', 'wrong'], requires_review: ['Requires review', 'watch'],
};
const SIZE = 50;

export default function Reconciliation() {
  const [runs, setRuns] = useState(null);
  const [run, setRun] = useState('');
  const [filter, setFilter] = useState('problems');
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [days, setDays] = useState(7);
  const [review, setReview] = useState(null);

  const loadRuns = useCallback(async () => { try { setRuns((await api.reconRuns()).rows); } catch { /* shown below */ } }, []);
  const load = useCallback(async () => {
    try {
      setError(null);
      setD(await api.reconItems({ run: run || undefined, ...(filter === 'problems' ? { problems: '1' } : filter ? { result: filter } : {}), limit: SIZE, offset: (page - 1) * SIZE }));
    } catch (e) { setError(e); }
  }, [run, filter, page]);
  useEffect(() => { loadRuns(); }, [loadRuns]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [run, filter]);
  const running = runs?.some((r) => r.status === 'running');
  useAutoRefresh(() => { loadRuns(); if (running) load(); }, running ? 4000 : 30000);

  const start = async () => {
    try { await api.reconRun(days); snack('Reconciliation started'); loadRuns(); } catch (e) { snack(e.message, 'wrong'); }
  };
  const s = d?.run?.summary;
  return (
    <Shell title="Payment reconciliation" subtitle={d?.run ? `Run #${d.run.id} · ${dateTime(d.run.range_from)} → ${dateTime(d.run.range_to)}` : 'GaadiPe against Razorpay'}
      actions={<>
        <select className="input !w-auto !py-1.5 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[1, 2, 7, 30, 90].map((n) => <option key={n} value={n}>Last {n} day{n === 1 ? '' : 's'}</option>)}
        </select>
        <button className="btn-primary !py-1.5 text-2xs" onClick={start} disabled={running}>{running ? 'Running…' : 'Run reconciliation'}</button>
      </>}>
      <Banner className="mb-3">Comparing only: a run reads both sides and changes nothing. Settlement status is not part of a payment’s record at Razorpay, so it is not shown.</Banner>
      {s && (
        <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-6">
          {[['Total transactions', s.total, ''], ['Matched', s.matched, 'matched'], ['Mismatched', s.mismatched, 'amount_mismatch'], ['Missing', s.missing, 'missing_internally'],
            ['Pending', s.pending, 'pending'], ['Refund issues', s.refund_issues, 'refund_mismatch']].map(([l, v, f]) => (
            <button key={l} onClick={() => setFilter(f)} className={`card px-3 py-2 text-left ${filter === f ? 'ring-2 ring-brand/30' : ''}`}>
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{l}</div><div className="tabular text-xl font-semibold text-ink">{num(v)}</div>
            </button>
          ))}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input !w-auto !py-1.5 text-sm" value={run} onChange={(e) => setRun(e.target.value)}>
          <option value="">Latest completed run</option>
          {(runs || []).map((r) => <option key={r.id} value={r.id}>#{r.id} · {dateTime(r.started_at)} · {r.admin} · {r.status}</option>)}
        </select>
        <select className="input !w-auto !py-1.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="problems">Needs attention</option><option value="">Everything</option>
          {Object.entries(RESULT).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {runs?.[0]?.status === 'failed' && <span className="text-2xs text-wrong-700">Last run failed: {runs[0].error}</span>}
        {running && <span className="text-2xs text-muted">A run is in progress — this page updates by itself.</span>}
      </div>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : !d.run ? <Empty>No reconciliation has run yet. Start one above.</Empty> : !d.rows.length ? (
          <Empty>{filter === 'problems' ? 'Nothing needs attention in this run.' : 'Nothing in this filter.'}</Empty>
        ) : (
          <>
            <Table head={<tr>{['Result', 'Internal ID', 'Order', 'Gateway payment', 'Customer', 'Vehicle', 'Amount', 'Gateway amount', 'Status (ours / theirs)', 'Refund', 'Webhook', 'Created', 'Reviewed', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
              {d.rows.map((x) => (
                <tr key={x.id}>
                  <td className="td"><Chip tone={RESULT[x.result]?.[1]} note={x.detail?.note}>{RESULT[x.result]?.[0] || x.result}</Chip></td>
                  <td className="td font-mono text-2xs">{x.payment_row_id ? `#${x.payment_row_id}` : '—'}</td>
                  <td className="td font-mono text-2xs">{x.order_id || '—'}</td>
                  <td className="td font-mono text-2xs">{x.gateway_payment_id || '—'}</td>
                  <td className="td font-mono">{x.mobile || '—'}</td>
                  <td className="td font-mono">{x.reg_no ? <Link className="text-brand-deep hover:underline" to={`/vehicles/${x.reg_no}#payments`}>{x.reg_no}</Link> : '—'}</td>
                  <td className="td tabular">{x.internal_amount == null ? '—' : rs(x.internal_amount)}</td>
                  <td className={`td tabular ${x.result === 'amount_mismatch' ? 'font-semibold text-wrong-700' : ''}`}>{x.gateway_amount == null ? '—' : rs(x.gateway_amount)}</td>
                  <td className="td text-2xs">{x.internal_status || '—'} / {x.gateway_status || '—'}</td>
                  <td className="td text-2xs">{x.refund_status || '—'}</td>
                  <td className="td text-2xs">{x.webhook_seen == null ? '—' : x.webhook_seen ? 'Received' : 'Not received'}</td>
                  <td className="td whitespace-nowrap text-2xs">{dateTime(x.p_created || x.detail?.captured_at)}</td>
                  <td className="td text-2xs">{x.reviewed_at ? <span title={x.review_note || ''}>{x.reviewed_by_name} · {ago(x.reviewed_at)}</span> : '—'}</td>
                  <td className="td">{!['matched', 'pending'].includes(x.result) && !x.reviewed_at && <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => setReview(x)}>Review</button>}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={d.total} size={SIZE} onPage={setPage} />
          </>
        )}
      </div>
      {review && <ReviewDialog item={review} onClose={() => setReview(null)} onDone={load} />}
    </Shell>
  );
}

function ReviewDialog({ item, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.reconReview(item.id, note); snack('Marked reviewed'); onDone(); onClose(); } catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
  };
  return (
    <Modal title="Mark as reviewed" subtitle={`${RESULT[item.result]?.[0]} · ${item.gateway_payment_id || item.order_id || `#${item.payment_row_id}`}`} onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy || !note.trim()}>Mark reviewed</button></>}>
      {item.detail?.note && <p className="text-sm text-body">{item.detail.note}</p>}
      <Field label="What you found or did" hint="Kept with the item and in the audit log. Nothing is changed at Razorpay or in GaadiPe by this.">
        <textarea className="input min-h-[90px]" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>
    </Modal>
  );
}
