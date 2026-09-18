import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { dateTime, ago, mobile as fmtMobile } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Table, Chip, Spinner, Failed, Empty, Hint, Pager, PAGE_SIZE } from '../components/ui.jsx';

/**
 * Everything anyone did here.
 *
 * INCLUDING LOOKING. Opening a customer's file, reading a conversation and
 * downloading an invoice are recorded alongside the changes, because the
 * question after a data complaint is "who saw this", and an audit trail that
 * only records writes cannot answer it.
 */
const LABELS = {
  sign_in: ['Signed in', 'info'],
  sign_out: ['Signed out', 'info'],
  code_requested: ['Asked for a sign-in code', 'info'],
  code_wrong: ['Wrong sign-in code', 'watch'],
  view_customer: ['Opened a customer', 'info'],
  view_thread: ['Read a conversation', 'info'],
  view_vehicle: ['Opened a vehicle', 'info'],
  admin_check: ['Looked a vehicle up', 'brand'],
  block: ['Blocked', 'wrong'],
  unblock: ['Unblocked', 'good'],
  pause_customer: ['Paused a customer', 'watch'],
  resume_customer: ['Resumed a customer', 'good'],
  settings_changed: ['Changed settings', 'watch'],
  plan_changed: ['Changed a plan price', 'wrong'],
  policy_changed: ['Edited policy text', 'wrong'],
  policy_added: ['Added a policy clause', 'watch'],
  admin_added: ['Added a panel user', 'wrong'],
  admin_active_changed: ['Enabled or disabled a panel user', 'wrong'],
  download_vehicle_reports: ['Downloaded a report', 'info'],
  download_invoices: ['Downloaded an invoice', 'info'],
};

export default function Audit() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => { setPage(1); }, [action]);

  const load = useCallback(async () => {
    try {
      setError(null);
      const out = await api.audit({ action, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
      setRows(out.rows); setTotal(out.total || 0);
    } catch (e) { setError(e); }
  }, [action, page]);
  useEffect(() => { load(); }, [load]);

  return (
    <Shell title="Audit trail" subtitle="Every change, and every customer record opened"
      actions={
        <select className="input !w-auto !py-1.5 text-sm" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="">Everything</option>
          {Object.entries(LABELS).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
        </select>
      }>
      <div className="card">
        {error ? <Failed error={error} onRetry={load} />
          : !rows ? <Spinner />
          : !rows.length ? <Empty>Nothing recorded yet.</Empty>
          : (
            <Table head={
              <tr>
                <th className="th">When</th><th className="th">Who</th>
                <th className="th">What</th><th className="th">Details</th><th className="th">From</th>
              </tr>
            }>
              {rows.map((r) => {
                const [label, tone] = LABELS[r.action] || [r.action, 'info'];
                return (
                  <tr key={r.id}>
                    <td className="td text-2xs text-muted">
                      <Hint note={dateTime(r.created_at)}><span>{ago(r.created_at)}</span></Hint>
                    </td>
                    <td className="td">
                      <div className="text-ink">{r.name || 'Unknown'}</div>
                      <div className="tabular text-2xs text-muted">{fmtMobile(r.mobile)}</div>
                    </td>
                    <td className="td"><Chip tone={tone}>{label}</Chip></td>
                    <td className="td max-w-md">
                      <Detail detail={r.detail} />
                    </td>
                    <td className="td tabular text-2xs text-muted">{r.ip || '—'}</td>
                  </tr>
                );
              })}
            </Table>
          )}
        {rows && <Pager page={page} total={total} onPage={setPage} />}
      </div>
    </Shell>
  );
}

/**
 * What changed, in a sentence where one is possible.
 *
 * A settings change carries both values, so it is shown as "key: was → now" —
 * the whole point of recording the old value is being able to read it back
 * without opening a JSON blob.
 */
function Detail({ detail }) {
  if (!detail || typeof detail !== 'object') return <span className="text-muted">—</span>;

  if (detail.changes && detail.was) {
    return (
      <ul className="space-y-0.5">
        {Object.entries(detail.changes).map(([key, now]) => (
          <li key={key} className="text-2xs">
            <span className="font-mono text-body">{key}</span>{' '}
            <span className="text-muted">{String(detail.was[key])}</span>
            {' → '}
            <span className="font-semibold text-ink">{String(now)}</span>
          </li>
        ))}
      </ul>
    );
  }

  const plain = Object.entries(detail)
    .filter(([, v]) => v !== null && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${v}`);

  return plain.length
    ? (
      <Hint note={JSON.stringify(detail, null, 2)}>
        <span className="text-2xs text-body">{plain.join(' · ')}</span>
      </Hint>
    )
    : <span className="text-muted">—</span>;
}
