import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Empty, Table, Chip, Hint, Modal, Field } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { rupees, date, ago, count } from '../../lib/format';
import { STATUS, daysLeft } from './common.jsx';

/**
 * FLEETS (user, 2026-09-29) — businesses with 5+ vehicles, served by email.
 * An owner emails support@gaadipe.in; you create the fleet here, send the
 * quotation, and approve it once paid. Every step is on the fleet's timeline.
 */
export default function Fleets() {
  const { can } = useSession();
  const manage = allowed(can, 'settings');
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const status = sp.get('status') || '';
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try { setError(null); setD(await api.fleets({ status: status || undefined })); } catch (e) { setError(e); }
  }, [status]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 30000);

  const counts = d?.counts || {};
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const tile = (key, label, note) => (
    <Hint key={key || 'all'} note={note}>
      <button type="button" onClick={() => setSp(key ? { status: key } : {})}
        className={`card w-full px-3 py-2 text-left lift ${status === key ? 'ring-2 ring-brand/40' : ''} ${key === 'paid' && counts.paid ? 'bg-good-50/70' : ''}`}>
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</div>
        <div className="tabular text-xl font-semibold text-ink">{count(key ? counts[key] || 0 : total)}</div>
      </button>
    </Hint>
  );

  return (
    <Shell title="Fleets" subtitle="Businesses with 5+ vehicles — daily Excel report by email"
      actions={manage && <button className="btn-primary !py-1.5 text-sm" onClick={() => setCreating(true)}>+ New fleet</button>}>
      <div className="mb-3 grid grid-cols-3 gap-2 md:grid-cols-6">
        {tile('', 'All', 'Every fleet.')}
        {tile('paid', 'Paid — approve', STATUS.paid[2])}
        {tile('quoted', 'Quoted', STATUS.quoted[2])}
        {tile('active', 'Active', STATUS.active[2])}
        {tile('expired', 'Expired', STATUS.expired[2])}
        {tile('draft', 'Draft', STATUS.draft[2])}
      </div>

      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={5} /> : !d.rows.length ? (
          <Empty action={manage && <button className="btn-primary text-sm" onClick={() => setCreating(true)}>+ New fleet</button>}>
            {status ? 'No fleet with this status.' : 'No fleets yet. When an owner emails support@gaadipe.in, create their fleet here.'}
          </Empty>
        ) : (
          <Table head={<tr>{[
            ['Fleet', 'Company, contact and the email the daily report goes to.'],
            ['Vehicles', 'Vehicles on the fleet now. Below: how many were checked successfully.'],
            ['Status', 'Where the fleet is: Draft → Quoted → Paid (approve) → Active. Expired means the period ended unpaid.'],
            ['Monitoring', 'The current 28-day period, and days left.'],
            ['Last report', 'The last evening Excel email that went out.'],
            ['Paid so far', 'Everything this fleet has paid, GST included.'],
            ['Latest payment link', 'The newest quotation or renewal link and whether it was paid.'],
          ].map(([h, n]) => <th key={h} className="th"><Hint note={n}><span className="border-b border-dotted border-muted/50">{h}</span></Hint></th>)}</tr>}>
            {d.rows.map((f) => {
              const left = daysLeft(f.ends_at);
              const lp = f.last_payment;
              return (
                <tr key={f.id} className={`cursor-pointer hover:bg-shell/60 ${f.status === 'paid' ? 'bg-good-50/60' : ''}`} onClick={() => navigate(`/fleets/${f.id}`)}>
                  <td className="td">
                    <div className="font-semibold text-ink">{f.company}</div>
                    <div className="text-2xs text-muted">{[f.contact_name, f.email].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className="td tabular">{count(f.vehicles)}<div className="text-2xs text-muted">{f.status === 'active' ? `${count(f.checked_ok)} checked` : ''}</div></td>
                  <td className="td"><Chip tone={STATUS[f.status]?.[1]} note={STATUS[f.status]?.[2]}>{STATUS[f.status]?.[0] || f.status}</Chip></td>
                  <td className="td text-2xs">{f.ends_at ? <>
                    <div>{date(f.starts_at)} – {date(f.ends_at)}</div>
                    <div className={left <= 3 ? 'font-semibold text-watch-700' : 'text-muted'}>{left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : 'ended'}</div>
                  </> : <span className="text-muted">—</span>}</td>
                  <td className="td text-2xs text-muted">{f.last_report ? date(f.last_report) : '—'}</td>
                  <td className="td tabular">{f.paid_paise ? rupees(f.paid_paise) : <span className="text-muted">—</span>}</td>
                  <td className="td text-2xs">{lp ? <>
                    <div>{lp.kind === 'renewal' ? 'Renewal' : 'Quotation'} · {rupees(lp.amount_paise)}</div>
                    <div className="text-muted">{lp.status === 'paid' ? `paid ${ago(lp.paid_at)}` : lp.status === 'created' ? `sent ${ago(lp.created_at)}` : lp.status}</div>
                  </> : <span className="text-muted">—</span>}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </div>
      {creating && <NewFleet onClose={() => setCreating(false)} onDone={(id) => navigate(`/fleets/${id}`)} />}
    </Shell>
  );
}

/* Create a fleet from the owner's email. */
export function FleetForm({ initial = {}, withVehicles = true, onSubmit, busy, submitLabel }) {
  const [f, setF] = useState({ company: '', contact_name: '', email: '', cc_emails: '', mobile: '', gstin: '', notes: '', vehicles: '', ...initial });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const lines = f.vehicles.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).length;
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(f); }} className="grid gap-3 sm:grid-cols-2">
      <Field label="Company name"><input className="input" value={f.company} onChange={set('company')} required /></Field>
      <Field label="Contact name"><input className="input" value={f.contact_name || ''} onChange={set('contact_name')} /></Field>
      <Field label="Email for the daily report" hint="Quotation, invoices and every evening's Excel go here."><input className="input" type="email" value={f.email} onChange={set('email')} required /></Field>
      <Field label="More emails (optional)" hint="Comma-separated — e.g. a fleet manager."><input className="input" value={f.cc_emails || ''} onChange={set('cc_emails')} /></Field>
      <Field label="Mobile (optional)"><input className="input" value={f.mobile || ''} onChange={set('mobile')} inputMode="numeric" /></Field>
      <Field label="GSTIN (optional)" hint="Printed on their GST invoice; its first two digits set the place of supply."><input className="input uppercase" value={f.gstin || ''} onChange={set('gstin')} maxLength={15} /></Field>
      {withVehicles && (
        <Field label={`Vehicle numbers${lines ? ` · ${lines}` : ''}`} hint="Paste from their email — one per line, or separated by commas. Invalid numbers are listed back." className="sm:col-span-2">
          <textarea className="input min-h-[140px] font-mono text-sm uppercase" value={f.vehicles} onChange={set('vehicles')} placeholder={'KA01AB1234\nKA01AB5678'} />
        </Field>
      )}
      <Field label="Notes (only you see these)" className="sm:col-span-2"><textarea className="input min-h-[60px]" value={f.notes || ''} onChange={set('notes')} /></Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}

function NewFleet({ onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const submit = async (f) => {
    setBusy(true);
    try {
      const out = await api.createFleet(f);
      snack(`Fleet created with ${out.vehicles} vehicle${out.vehicles === 1 ? '' : 's'}${out.invalid?.length ? ` — ${out.invalid.length} number(s) not valid` : ''}`, out.invalid?.length ? 'watch' : 'good');
      onDone(out.id);
    } catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
  };
  return (
    <Modal title="New fleet" subtitle="From the owner's email to support@gaadipe.in" onClose={onClose} wide busy={busy}>
      <FleetForm onSubmit={submit} busy={busy} submitLabel="Create fleet" />
    </Modal>
  );
}
