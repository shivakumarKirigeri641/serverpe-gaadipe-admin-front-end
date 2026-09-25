import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { mobile as fmtMobile, dateTime } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Table, Chip, Spinner, Failed, Modal, Field, Banner, Hint } from '../components/ui.jsx';
import { useSession } from '../lib/session';

/**
 * Who may open this panel.
 *
 * ROLES ARE DESCRIBED BY WHAT THEY MAY DO, not by their names, because "admin"
 * and "finance" mean nothing to the person choosing between them at the moment
 * they add somebody.
 *
 * Switching someone off ends their session immediately — "disabled" that only
 * takes effect when they close the tab is not disabled.
 */
const ROLES = [
  ['owner', 'Owner (super admin)', 'Everything, including adding and removing panel users.'],
  ['admin', 'Admin', 'Everything except managing panel users.'],
  ['operations', 'Operations', 'Runs the service: settings, blocking, vehicle checks, the whole Vehicles module. No money.'],
  ['finance', 'Finance', "Money, invoices and reports; can view and export vehicles. Customers' mobiles are masked."],
  ['support', 'Support', 'Helps customers: reads everything, checks a vehicle, reveals a number, adds vehicle notes and tags.'],
  ['viewer', 'Read only', "Read-only, customers' mobiles masked. Cannot change anything or look a vehicle up."],
];

export default function People() {
  const { me } = useSession();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setError(null); setRows((await api.admins()).rows); } catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (row) => {
    const turningOff = row.is_active;
    if (turningOff && !window.confirm(`Sign ${row.name} out and stop their access?`)) return;
    try { await api.setAdminActive(row.id, !row.is_active); await load(); }
    catch (e) { window.alert(e.message); }
  };

  return (
    <Shell title="Panel users" subtitle="Who may open the admin panel"
      actions={<button className="btn-primary !py-1.5 text-2xs" onClick={() => setAdding(true)}>Add someone</button>}>

      <div className="card mb-4 px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">What each role may do</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {ROLES.map(([key, label, note]) => (
            <div key={key} className="flex gap-2 border-b border-line/60 py-1">
              <dt className="w-20 shrink-0 text-2xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
              <dd className="text-2xs text-body">{note}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card">
        {error ? <Failed error={error} onRetry={load} /> : !rows ? <Spinner /> : (
          <Table head={
            <tr>
              <th className="th">Name</th><th className="th">Mobile</th><th className="th">Role</th>
              <th className="th">Last signed in</th><th className="th">State</th><th className="th"></th>
            </tr>
          }>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="td">
                  <span className="font-semibold text-ink">{r.name}</span>
                  {String(r.id) === String(me?.id) && <span className="ml-2 text-2xs text-muted">(you)</span>}
                </td>
                <td className="td tabular">{fmtMobile(r.mobile)}</td>
                <td className="td capitalize">{r.role}</td>
                <td className="td text-2xs text-muted">
                  {r.last_login_at ? <Hint note={dateTime(r.last_login_at)}><span>{dateTime(r.last_login_at)}</span></Hint> : 'Never'}
                </td>
                <td className="td">
                  {r.is_active ? <Chip tone="good">Active</Chip> : <Chip tone="info">Disabled</Chip>}
                </td>
                <td className="td">
                  {String(r.id) !== String(me?.id) && (
                    <button className="btn-quiet !px-2.5 !py-1 text-2xs" onClick={() => toggle(r)}>
                      {r.is_active ? 'Disable' : 'Enable'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <p className="mt-3 text-2xs text-muted">
        Sign-in is by a code sent to the person's own number — there are no passwords to set or reset.
      </p>

      {adding && <AddPerson onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </Shell>
  );
}

function AddPerson({ onClose, onDone }) {
  const [mobile, setMobile] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('admin');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setBusy(true); setError(null);
    try { await api.addAdmin({ mobile, name, role }); onDone(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <Modal title="Add a panel user" busy={busy} onClose={onClose}
      footer={
        <>
          <button className="btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn-primary" disabled={busy || name.trim().length < 2 || mobile.replace(/\D/g, '').length < 10}
            onClick={save}>{busy ? 'Adding…' : 'Add'}</button>
        </>
      }>
      <Field label="Mobile number" hint="They sign in with this. No password is created.">
        <input className="input tabular" autoFocus value={mobile} placeholder="98765 43210"
          onChange={(e) => setMobile(e.target.value)} />
      </Field>
      <Field label="Name" hint="Shown against everything they do in the audit trail.">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Role">
        <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map(([key, label, note]) => <option key={key} value={key}>{label} — {note}</option>)}
        </select>
      </Field>
      {error && <Banner tone="wrong">{error.message}</Banner>}
    </Modal>
  );
}
