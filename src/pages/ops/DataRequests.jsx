import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Modal } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { ago, dateTime } from '../../lib/format';
import { useSession, allowed } from '../../lib/session';

/**
 * DATA REQUESTS (user, 2026-10-03; DPDP Act 2023). Customers who wrote
 * "delete my data". Delete personal data erases their name, chats, feedback,
 * website visits, devices and the vehicles they checked — and keeps payments,
 * GST invoices, the reports they bought and their consent, as the law
 * requires. It cannot be undone. Back end: src/admin/dataRequests.js.
 */
const STATUS = { pending: ['Waiting', 'bg-watch-50 text-watch-700'], done: ['Deleted', 'bg-good-50 text-good-700'], rejected: ['Rejected', 'bg-shell text-muted'] };

export default function DataRequests() {
  const { can } = useSession();
  const canAct = allowed(can, 'settings');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.dataRequests().then((x) => { setD(x); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const erase = async () => {
    setBusy(true);
    try {
      const r = await api.eraseDataRequest(confirm.id);
      const n = Object.values(r.erased || {}).reduce((a, b) => a + b, 0);
      snack(`Deleted — ${n} record${n === 1 ? '' : 's'} erased`); setConfirm(null); load();
    } catch (e) { snack(e.message || 'Could not delete', 'wrong'); } finally { setBusy(false); }
  };
  const reject = async (r) => {
    const note = window.prompt('Why is this request rejected? (kept in the audit log)', '');
    if (note === null) return;
    try { await api.rejectDataRequest(r.id, note); snack('Rejected'); load(); } catch (e) { snack(e.message, 'wrong'); }
  };

  return (
    <Shell title="Data requests" subtitle="Customers who asked for their personal data to be deleted (DPDP Act)">
      <div className="card mb-4 p-4 text-2xs leading-relaxed text-body">
        <b className="text-ink">Deleted:</b> name, email, WhatsApp name, every chat message's text, feedback, contact messages, website visits, sign-in IPs and devices,
        the vehicles they checked, monitoring, owner claims, the waiting list. GaadiPe stops messaging them.
        <br /><b className="text-ink">Kept, as the law requires:</b> payments, GST invoices, which reports were bought, their recorded consent, and the mobile number
        (so the deletion and a STOP can still be honoured). The customer is told on WhatsApp when it is done, if their window is open.
      </div>
      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={5} /> : !d.rows.length ? (
        <div className="card p-8 text-center text-sm text-muted">No requests yet. A customer asks by writing “delete my data” on WhatsApp.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-2xs text-muted">
              <th className="px-4 py-2">Customer</th><th className="px-3 py-2">Asked</th><th className="px-3 py-2">Their words</th>
              <th className="px-3 py-2">Paid</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
            </tr></thead>
            <tbody>
              {d.rows.map((r) => {
                const [label, tone] = STATUS[r.status] || [r.status, ''];
                return (
                  <tr key={r.id} className="border-b border-line/60 last:border-0 align-top">
                    <td className="px-4 py-2">{r.name || 'Unknown'} <span className="tabular text-2xs text-muted">{r.masked}</span></td>
                    <td className="px-3 py-2 text-2xs text-muted">{ago(r.created_at)}</td>
                    <td className="max-w-xs px-3 py-2 text-2xs text-body">{r.said ? `“${r.said}”` : '—'}</td>
                    <td className="px-3 py-2 text-2xs">{r.payments ? `${r.payments}× (kept)` : 'No'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold ${tone}`}>{label}</span>
                      {r.done_at && <div className="mt-1 text-[10px] text-muted">{dateTime(r.done_at)}{r.done_by_name ? ` · ${r.done_by_name}` : ''}</div>}
                      {r.note && <div className="text-[10px] text-muted">{r.note}</div>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {r.status === 'pending' && canAct && (
                        <span className="inline-flex gap-1">
                          <button type="button" className="btn-quiet !py-1 text-2xs text-wrong-700" onClick={() => setConfirm(r)}>Delete personal data</button>
                          <button type="button" className="btn-quiet !py-1 text-2xs" onClick={() => reject(r)}>Reject</button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {confirm && (
        <Modal title="Delete this customer's personal data?" subtitle={`${confirm.name || 'Unknown'} · ${confirm.masked}`} onClose={() => setConfirm(null)} busy={busy}
          footer={<>
            <button type="button" className="btn-quiet" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
            <button type="button" className="btn-primary !bg-wrong-500" onClick={erase} disabled={busy}>{busy ? 'Deleting…' : 'Delete — cannot be undone'}</button>
          </>}>
          <p className="text-sm text-body">Their name, chats, feedback, website visits and the vehicles they checked are erased for good. Payments and GST invoices stay. This cannot be undone.</p>
        </Modal>
      )}
    </Shell>
  );
}
