import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Empty, Table, Chip, Hint, Modal, Field, Stat, saveBlob, openBlob, CopyButton } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { rupees, date, dateTime, ago, count } from '../../lib/format';
import { STATUS, STEPS, stepIndex, DOC_TONE, VEH_STATE, daysLeft } from './common.jsx';
import { FleetForm } from './Fleets.jsx';

const DOCS = [['Insurance', 'Insurance'], ['PUC', 'PUC (emission test)'], ['Road tax', 'Road tax'], ['Fitness', 'Fitness'], ['Permit', 'Permit'], ['Registration', 'Registration']];
const EVENT_ICON = { created: '🆕', edited: '✏️', vehicles: '🚚', quoted: '📨', renewal_sent: '🔁', paid: '💰', renewed: '💰', invoice: '🧾',
  approved: '✅', report: '📊', report_failed: '⚠️', paused: '⏸️', active: '▶️', expired: '⌛', cancelled: '✖️', note: '📝', renewal_failed: '⚠️' };

export default function FleetDetail() {
  const { id } = useParams();
  const { can } = useSession();
  const manage = allowed(can, 'settings');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { try { setError(null); setD(await api.fleetAccount(id)); } catch (e) { setError(e); } }, [id]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 30000);

  const act = async (fn, ok) => {
    setBusy(true);
    try { const out = await fn(); snack(typeof ok === 'function' ? ok(out) : ok); setDialog(null); await load(); }
    catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
  };
  const excel = async () => { try { const { blob, filename } = await api.fleetExcel(id); saveBlob(blob, filename); } catch (e) { snack(e.message, 'wrong'); } };
  const invoice = async (invId) => { try { const { blob } = await api.invoicePdf(invId); openBlob(blob); } catch (e) { snack(e.message, 'wrong'); } };

  if (error && !d) return <Shell title="Fleet"><Failed error={error} onRetry={load} /></Shell>;
  if (!d) return <Shell title="Fleet"><Skeleton rows={8} /></Shell>;

  const f = d.fleet;
  const live = d.vehicles.filter((v) => !v.removed_at);
  const need = live.filter((v) => ['attention', 'expired'].includes(v.status?.state)).length;
  const pending = live.reduce((n, v) => n + (v.status?.pending || 0), 0);
  const paid = d.payments.filter((p) => p.status === 'paid').reduce((n, p) => n + p.amount_paise, 0);
  const left = daysLeft(f.ends_at);
  const step = stepIndex(f.status);
  const stepAt = (s) => d.events.slice().reverse().find((e) => ({ draft: 'created', quoted: 'quoted', paid: 'paid', active: 'approved' }[s] === e.kind))?.at;
  const openLink = d.payments.find((p) => p.status === 'created');
  const renewal = ['active', 'expired', 'paused'].includes(f.status);

  return (
    <Shell title={f.company} subtitle={<span><Link to="/fleets" className="text-brand-deep hover:underline">Fleets</Link> · {[f.contact_name, f.email].filter(Boolean).join(' · ')}</span>}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={STATUS[f.status]?.[1]} note={STATUS[f.status]?.[2]}>{STATUS[f.status]?.[0]}</Chip>
          {manage && f.status === 'paid' && <button className="btn-primary !py-1.5 text-sm" onClick={() => setDialog('approve')}>Approve</button>}
          {manage && ['draft', 'quoted'].includes(f.status) && <button className="btn-primary !py-1.5 text-sm" onClick={() => setDialog('quote')}>{f.status === 'quoted' ? 'Resend quotation' : 'Send quotation'}</button>}
          {manage && renewal && <button className="btn-quiet !py-1.5 text-sm" onClick={() => setDialog('quote')}>Send renewal link</button>}
          {manage && f.status === 'active' && <button className="btn-quiet !py-1.5 text-sm" disabled={busy} onClick={() => act(() => api.fleetSendReport(id), 'Report emailed')}>Send report now</button>}
          <button className="btn-quiet !py-1.5 text-sm" onClick={excel}>Excel</button>
          {manage && <button className="btn-quiet !py-1.5 text-sm" onClick={() => setDialog('edit')}>Edit</button>}
          {manage && f.status === 'active' && <button className="btn-quiet !py-1.5 text-sm" onClick={() => act(() => api.fleetStatus(id, 'paused'), 'Paused')}>Pause</button>}
          {manage && f.status === 'paused' && <button className="btn-quiet !py-1.5 text-sm" onClick={() => act(() => api.fleetStatus(id, 'active'), 'Resumed')}>Resume</button>}
          {manage && f.status !== 'cancelled' && <button className="btn-quiet !py-1.5 text-sm text-wrong-700" onClick={() => setDialog('cancel')}>Cancel</button>}
        </div>
      }>

      {/* where it is */}
      <div className="card mb-3 p-4">
        {f.status === 'cancelled' ? <p className="text-sm text-muted">This fleet is cancelled.</p> : (
          <ol className="grid grid-cols-4 gap-2">
            {STEPS.map(([s, label], i) => (
              <li key={s} className="min-w-0">
                <div className={`h-1.5 rounded-full ${i <= step ? 'bg-good-500' : 'bg-line'} ${i === step + 1 ? 'animate-pulse bg-watch-500' : ''}`} />
                <div className={`mt-1.5 text-2xs font-semibold ${i <= step ? 'text-ink' : 'text-muted'}`}>{i <= step ? '✓ ' : ''}{label}</div>
                <div className="text-[10px] text-muted">{stepAt(s) ? dateTime(stepAt(s)) : i === step + 1 ? 'next' : ''}</div>
              </li>
            ))}
          </ol>
        )}
        {f.status === 'paid' && <p className="mt-3 rounded-lg bg-good-50 px-3 py-2 text-sm text-good-700"><b>Paid.</b> Check the vehicle list below, then press <b>Approve</b> — the fleet gets a confirmation email and tonight's report.</p>}
        {openLink && <p className="mt-3 text-2xs text-muted">Payment link waiting ({rupees(openLink.amount_paise)}, until {date(openLink.expires_at)}): <a className="text-brand-deep underline" href={openLink.link_url} target="_blank" rel="noreferrer">{openLink.link_url}</a> <CopyButton value={openLink.link_url} /></p>}
        {f.status === 'expired' && <p className="mt-3 rounded-lg bg-wrong-50 px-3 py-2 text-sm text-wrong-700">The period ended without a paid renewal — no checks or emails. Send a renewal link to restart.</p>}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Vehicles" value={count(live.length)} note="Vehicles on the fleet now." />
        <Stat label="Need attention" value={count(need)} tone={need ? 'watch' : 'good'} note="Vehicles with a document expired or due within 30 days, challans, or a blacklist." />
        <Stat label="Pending challans" value={count(pending)} tone={pending ? 'wrong' : 'good'} note="Across all vehicles, from the last check." />
        <Stat label="Days left" value={f.ends_at ? (left > 0 ? left : 'Ended') : '—'} tone={left != null && left <= 3 ? 'watch' : 'info'} note={f.ends_at ? `Monitoring ${date(f.starts_at)} – ${date(f.ends_at)}` : 'Starts on approval.'} />
        <Stat label="Paid so far" value={paid ? rupees(paid) : '—'} note="Everything paid, GST included." />
      </div>

      {/* vehicles */}
      <div className="card mb-3 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="text-sm font-semibold text-ink">Vehicles ({live.length})</div>
          {manage && <button className="btn-quiet !py-1 text-2xs" onClick={() => setDialog('add')}>+ Add vehicles</button>}
        </div>
        {!live.length ? <Empty>No vehicles yet.</Empty> : (
          <Table head={<tr>
            <th className="th">Vehicle</th>
            {DOCS.map(([k, n]) => <th key={k} className="th">{n}</th>)}
            <th className="th">Challans</th><th className="th">Status</th><th className="th">Last checked</th>{manage && <th className="th" />}
          </tr>}>
            {live.map((v) => {
              const s = v.status;
              return (
                <tr key={v.id}>
                  <td className="td"><Link to={`/vehicles/${v.reg_no}`} className="font-mono text-sm font-semibold text-brand-deep hover:underline">{v.reg_no}</Link>
                    <div className="text-2xs text-muted">{s?.title || ''}</div></td>
                  {DOCS.map(([k]) => {
                    const c = s?.docs?.[k];
                    return <td key={k} className="td whitespace-nowrap">{s?.checked && c ? <Chip tone={DOC_TONE[c.state]}>{c.text}</Chip> : <span className="text-2xs text-muted">—</span>}</td>;
                  })}
                  <td className="td tabular">{s?.pending == null ? <span className="text-2xs text-muted">—</span> : s.pending ? <Chip tone="wrong">{s.pending} · {rupees(s.pending_paise)}</Chip> : <Chip tone="good">0</Chip>}</td>
                  <td className="td"><Chip tone={VEH_STATE[s?.state || 'unchecked'][1]}>{VEH_STATE[s?.state || 'unchecked'][0]}</Chip>
                    {v.last_error && <div className="mt-0.5 text-[10px] text-watch-700">{v.last_error}</div>}</td>
                  <td className="td whitespace-nowrap text-2xs text-muted">{v.last_checked_at ? ago(v.last_checked_at) : 'not yet'}</td>
                  {manage && <td className="td"><button className="btn-quiet !px-2 !py-1 text-2xs" title="Remove from the fleet (kept in history)"
                    onClick={() => window.confirm(`Remove ${v.reg_no} from ${f.company}?`) && act(() => api.fleetVehicles(id, { remove: [v.reg_no] }), `${v.reg_no} removed`)}>Remove</button></td>}
                </tr>
              );
            })}
          </Table>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* payments */}
        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Quotations & payments</div>
          {!d.payments.length ? <Empty>No quotation yet.</Empty> : (
            <Table head={<tr>{['Sent', 'Kind', 'Amount', 'Status', 'Invoice'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
              {d.payments.map((p) => (
                <tr key={p.id}>
                  <td className="td whitespace-nowrap text-2xs">{dateTime(p.created_at)}</td>
                  <td className="td text-2xs">{p.kind === 'renewal' ? 'Renewal' : 'Quotation'} · {p.vehicles} veh · {p.period_days} d</td>
                  <td className="td tabular">{rupees(p.amount_paise)}</td>
                  <td className="td"><Chip tone={{ paid: 'good', created: 'watch', expired: 'info', cancelled: 'info' }[p.status]}>{p.status === 'created' ? 'waiting' : p.status}</Chip>
                    {p.paid_at && <div className="text-[10px] text-muted">{dateTime(p.paid_at)}</div>}</td>
                  <td className="td text-2xs">{p.invoice_id ? <button className="text-brand-deep hover:underline" onClick={() => invoice(p.invoice_id)}>{p.invoice_number}</button> : '—'}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>

        {/* reports */}
        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Daily reports</div>
          {!d.reports.length ? <Empty>{f.status === 'active' ? 'The first report goes out this evening.' : 'Reports start once the fleet is active.'}</Empty> : (
            <Table head={<tr>{['Day', 'Status', 'Vehicles', 'Sent to'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
              {d.reports.map((r) => (
                <tr key={r.id}>
                  <td className="td whitespace-nowrap text-2xs">{date(r.ist_date)}</td>
                  <td className="td"><Chip tone={{ sent: 'good', failed: 'wrong', sending: 'watch' }[r.status]}>{r.status}</Chip>{r.error && <div className="text-[10px] text-wrong-700">{r.error}</div>}</td>
                  <td className="td tabular">{r.vehicles ?? '—'}</td>
                  <td className="td max-w-[200px] truncate text-2xs text-muted" title={r.sent_to || ''}>{r.sent_to || '—'}</td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </div>

      {/* timeline */}
      <div className="card mt-3 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold text-ink">Timeline</div>
        </div>
        <NoteBox onAdd={(t) => act(() => api.fleetNote(id, t), 'Note added')} />
        <ol className="mt-3 space-y-2">
          {d.events.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="w-5 shrink-0 text-center">{EVENT_ICON[e.kind] || '•'}</span>
              <div className="min-w-0 flex-1">
                <div className={`text-ink ${e.kind === 'note' ? 'whitespace-pre-wrap rounded-lg bg-shell px-3 py-2' : ''}`}>{e.text}</div>
                <div className="text-[10px] text-muted">{dateTime(e.at)}{e.admin_name ? ` · ${e.admin_name}` : e.kind === 'note' ? '' : ' · automatic'}
                  {e.detail?.invalid?.length ? ` · not valid: ${e.detail.invalid.map((x) => x.input).join(', ')}` : ''}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {dialog === 'quote' && <QuoteDialog d={d} renewal={renewal} busy={busy} onClose={() => setDialog(null)}
        onSend={(paise) => act(() => api.quoteFleet(id, paise), (o) => (o.emailed ? 'Quotation emailed with the payment link' : `Link created, but the email failed: ${o.email_error}`))} />}
      {dialog === 'approve' && (
        <Modal title={`Approve ${f.company}?`} onClose={() => setDialog(null)} busy={busy}
          footer={<><button className="btn-quiet" onClick={() => setDialog(null)}>Not yet</button>
            <button className="btn-primary" disabled={busy} onClick={() => act(() => api.approveFleet(id), 'Approved — confirmation emailed')}>Approve & switch on</button></>}>
          <p className="text-sm text-body">Monitoring starts now for <b>{live.length} vehicles</b>, for {d.suggest.period_days} days. {f.email} gets a confirmation email, and the first Excel report this evening.</p>
        </Modal>
      )}
      {dialog === 'cancel' && (
        <Modal title={`Cancel ${f.company}?`} onClose={() => setDialog(null)} busy={busy}
          footer={<><button className="btn-quiet" onClick={() => setDialog(null)}>Keep it</button>
            <button className="btn-primary !bg-wrong-500" disabled={busy} onClick={() => act(() => api.fleetStatus(id, 'cancelled'), 'Cancelled')}>Cancel fleet</button></>}>
          <p className="text-sm text-body">No more checks or emails, and any unpaid payment link stops counting. Payments already made are not refunded by this.</p>
        </Modal>
      )}
      {dialog === 'edit' && (
        <Modal title="Edit fleet" onClose={() => setDialog(null)} wide busy={busy}>
          <FleetForm initial={f} withVehicles={false} busy={busy} submitLabel="Save" onSubmit={(v) => act(() => api.updateFleet(id, v), 'Saved')} />
        </Modal>
      )}
      {dialog === 'add' && <AddVehicles busy={busy} onClose={() => setDialog(null)}
        onAdd={(text) => act(() => api.fleetVehicles(id, { add: text }), (o) => `${o.added.length} added${o.invalid?.length ? ` · not valid: ${o.invalid.map((x) => x.input).join(', ')}` : ''}`)} />}
    </Shell>
  );
}

function QuoteDialog({ d, renewal, busy, onClose, onSend }) {
  const live = d.vehicles.filter((v) => !v.removed_at).length;
  const [rs, setRs] = useState(String(Math.round(d.suggest.amount_paise / 100)));
  const short = live < d.suggest.min_vehicles;
  return (
    <Modal title={renewal ? 'Send a renewal link' : 'Send the quotation'} subtitle={`${live} vehicles × ₹${d.suggest.price_per_vehicle_paise / 100} suggested · ${d.suggest.period_days} days`}
      onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || short || !(Number(rs) > 0)} onClick={() => onSend(Math.round(Number(rs) * 100))}>Email quotation & payment link</button></>}>
      <Field label="Amount, GST included (₹)" hint="Pre-filled as vehicles × ₹19. Change it for a special price.">
        <input className="input tabular" inputMode="decimal" value={rs} onChange={(e) => setRs(e.target.value.replace(/[^\d.]/g, ''))} />
      </Field>
      {short && <p className="mt-2 text-sm text-wrong-700">A fleet needs at least {d.suggest.min_vehicles} vehicles — add more first.</p>}
      <p className="mt-2 text-2xs text-muted">Emailed to {d.fleet.email}{d.fleet.cc_emails ? `, ${d.fleet.cc_emails}` : ''} with a Razorpay link that works for 7 days. An earlier unpaid link stops counting.</p>
    </Modal>
  );
}

function AddVehicles({ busy, onClose, onAdd }) {
  const [t, setT] = useState('');
  return (
    <Modal title="Add vehicles" onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy || !t.trim()} onClick={() => onAdd(t)}>Add</button></>}>
      <Field label="Vehicle numbers" hint="One per line or comma-separated. They are checked from the next pass and appear in the next report.">
        <textarea className="input min-h-[120px] font-mono uppercase" value={t} onChange={(e) => setT(e.target.value)} />
      </Field>
    </Modal>
  );
}

function NoteBox({ onAdd }) {
  const [t, setT] = useState('');
  return (
    <div className="flex gap-2">
      <input className="input !py-1.5 text-sm" value={t} onChange={(e) => setT(e.target.value)} placeholder="Add a note — a call, what they asked, a promise made…"
        onKeyDown={(e) => { if (e.key === 'Enter' && t.trim()) { onAdd(t); setT(''); } }} />
      <button className="btn-quiet !py-1.5 text-2xs" disabled={!t.trim()} onClick={() => { onAdd(t); setT(''); }}>Add note</button>
    </div>
  );
}
