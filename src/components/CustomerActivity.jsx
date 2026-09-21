import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { mobile as fmtMobile, ago, dateTime, count } from '../lib/format';
import { Chip, Empty, Failed, Modal, Spinner, Table, saveBlob } from './ui.jsx';

/**
 * EVERY CUSTOMER, THEIR OWN TABLE (user, 2026-09-21) — on the Live page.
 *
 * One row per signed-in customer active in the chosen days: visits, pages,
 * clicks, actions, the last thing they did, online now. Tap a row for their
 * table — every page opened, every click and every action, newest first,
 * across all their visits — filterable, pageable, downloadable.
 */
export default function CustomerActivity({ tick }) {
  const [days, setDays] = useState(7);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    api.liveCustomers({ days, q: q || undefined }).then((d) => setRows(d.rows)).catch(setError);
  }, [days, q]);
  useEffect(load, [load, tick]);

  return (
    <div className="card mt-4">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="mr-auto text-sm font-semibold text-ink">Customers — every page, click and action</h2>
        <input className="input !w-44 !py-1.5 text-sm" placeholder="Mobile or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-32 !py-1.5 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[1, 7, 30, 90].map((d) => <option key={d} value={d}>{d === 1 ? 'Today' : `${d} days`}</option>)}
        </select>
      </div>
      {error && !rows ? <Failed error={error} onRetry={load} /> : !rows ? <Spinner /> : !rows.length ? <Empty>No signed-in customer activity in this period.</Empty> : (
        <Table head={<tr>{['Customer', 'Visits', 'Pages', 'Clicks', 'Actions', 'Vehicles', 'Last', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
          {rows.map((r) => (
            <tr key={r.id} className="cursor-pointer align-top hover:bg-shell/70" onClick={() => setOpen(r)}>
              <td className="td"><div className="flex items-center gap-2 font-semibold text-ink">
                {r.online && <span className="h-2 w-2 animate-pulse rounded-full bg-good-500" title="Online now" />}{r.name || '—'}</div>
                <div className="tabular text-2xs text-muted">{fmtMobile(r.mobile)}</div></td>
              <td className="td">{count(r.visits)}</td>
              <td className="td">{count(r.pages)}</td>
              <td className="td font-semibold">{count(r.clicks)}</td>
              <td className="td">{count(r.actions)}</td>
              <td className="td">{count(r.vehicles)}</td>
              <td className="td text-2xs text-muted"><div className="max-w-[16rem] truncate text-ink">{r.last_what}</div>{ago(r.last_at)}</td>
              <td className="td text-right"><span className="text-2xs font-semibold text-brand-deep">Open table →</span></td>
            </tr>
          ))}
        </Table>
      )}
      {open && <CustomerTable customer={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

const KIND_TONE = { click: 'brand', page: 'info', action: 'good' };

const what = (r) => r.kind === 'click'
  ? <>Clicked <b>“{r.detail?.label || r.detail?.href || '—'}”</b> <span className="text-muted">({r.detail?.el || 'button'})</span>
      {r.detail?.href && r.detail?.label && <span className="block text-2xs text-muted">→ {r.detail.href}</span>}</>
  : r.kind === 'page' ? <>Opened <b>{r.page}</b></>
  : <><b>{r.action}</b>{r.detail?.number ? ` · ${r.detail.number}` : ''}</>;

function CustomerTable({ customer, onClose }) {
  const [kind, setKind] = useState('');
  const [rows, setRows] = useState(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (before = null) => {
    try {
      const d = await api.liveCustomerActivity(customer.id, { kind: kind || undefined, before: before || undefined, limit: 200 });
      setRows((prev) => (before && prev ? [...prev, ...d.rows] : d.rows));
      setMore(d.rows.length === 200);
    } catch (e) { setError(e); }
  }, [customer.id, kind]);
  useEffect(() => { setRows(null); load(); }, [load]);

  const csv = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ['time,visit,kind,page,what,vehicle,ip', ...(rows || []).map((r) => [
      r.created_at, r.session_id, r.kind, r.page,
      r.kind === 'click' ? `Clicked ${r.detail?.label || ''} ${r.detail?.href ? `-> ${r.detail.href}` : ''}` : r.kind === 'page' ? 'Opened' : r.action,
      r.reg_no, r.ip].map(esc).join(','))];
    saveBlob(new Blob([lines.join('\n')], { type: 'text/csv' }), `activity-${customer.mobile}.csv`);
  };

  return (
    <Modal wide title={`${customer.name || 'Customer'} · ${fmtMobile(customer.mobile)}`}
      subtitle={`${count(customer.visits)} visits · ${count(customer.pages)} pages · ${count(customer.clicks)} clicks · ${count(customer.actions)} actions`}
      onClose={onClose}
      footer={<><button className="btn-quiet" onClick={csv} disabled={!rows?.length}>Download CSV</button>
        <button className="btn-primary" onClick={onClose}>Close</button></>}>
      <div className="mb-3 flex flex-wrap gap-2">
        {['', 'click', 'page', 'action'].map((k) => (
          <button key={k || 'all'} className={`chip border ${kind === k ? 'border-brand bg-brand/10 text-brand-deep' : 'border-line bg-white text-body'}`}
            onClick={() => setKind(k)}>{k ? `${k}s` : 'Everything'}</button>
        ))}
      </div>
      {error ? <Failed error={error} /> : !rows ? <Spinner /> : !rows.length ? <Empty>Nothing recorded.</Empty> : (
        <div className="max-h-[60vh] overflow-y-auto">
          <Table head={<tr>{['When', 'Kind', 'What', 'Vehicle', 'Visit'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
            {rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="td whitespace-nowrap text-2xs text-muted">{dateTime(r.created_at)}</td>
                <td className="td"><Chip tone={KIND_TONE[r.kind] || 'info'}>{r.kind}</Chip></td>
                <td className="td text-sm">{what(r)}{r.kind !== 'page' && r.page && <span className="block text-2xs text-muted">on {r.page}</span>}</td>
                <td className="td tabular text-2xs">{r.reg_no || '—'}</td>
                <td className="td tabular text-2xs text-muted">#{r.session_id}</td>
              </tr>
            ))}
          </Table>
          {more && <button className="btn-quiet mt-3 w-full" onClick={() => load(rows[rows.length - 1].id)}>Load older</button>}
        </div>
      )}
    </Modal>
  );
}
