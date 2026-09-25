import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Table } from '../../components/ui.jsx';

/**
 * PERMISSIONS (user, 2026-09-25) — who may do what, read from the same table
 * the server enforces on every request (src/admin/auth.js ROLES). Hiding a
 * menu item protects nothing; the server refuses. Roles are given to people
 * on Panel users.
 */
const ROLE = { owner: 'Super admin (owner)', admin: 'Admin', operations: 'Operations', finance: 'Finance', support: 'Support', technical: 'Technical', viewer: 'Read only' };
const ABOUT = {
  'dashboard.view': 'Business Health, Command Center, analytics', 'customers.view': 'Customers, journeys, retention, attribution',
  'customers.view_sensitive': 'Full mobile numbers', pii: 'Full mobile numbers (older name)', 'vehicles.view': 'Vehicle Explorer and profiles',
  'vehicles.view_sensitive': 'Reveal a number or RC owner (logged)', 'vehicles.export': 'Export vehicle records', 'vehicles.refresh': 'Fresh records-API lookup',
  'vehicles.notes': 'Vehicle notes', 'vehicles.tags': 'Vehicle tags, lists, assignment', 'vehicles.api_logs': 'API history and stored responses',
  'payments.view': 'Payments, reconciliation, abandoned', 'payments.refund': 'Reserved — no refunds from the panel', 'finance.view': 'Profitability, ledger',
  'finance.export': 'GST / accounting export', 'api.view': 'API monitor, providers, data quality', 'api.manage': 'API settings',
  'system.view': 'Health, jobs, infrastructure, backups', 'system.manage': 'Run or pause a job', 'settings.manage': 'Configuration, flags, alert rules',
  settings: 'Prices & settings (older name)', 'audit.view': 'Audit log, this page', 'tasks.manage': 'Tasks and notes', money: 'Money screens (older name)',
  block: 'Block a number or vehicle', lookup: 'Check a vehicle', admins: 'Panel users, backups, GST rate', read: 'Sign in and read', report_access: 'Owner’s report switch',
};

export default function Permissions() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.permissions().then(setD).catch(setError); }, []);
  const roles = d ? Object.keys(d.roles) : [];
  const caps = d ? [...new Set(Object.values(d.roles).flat())].sort((a, b) => a.localeCompare(b)) : [];
  return (
    <Shell title="Permissions" subtitle="Enforced by the server on every request" actions={<Link to="/people" className="btn-quiet !py-1.5 text-2xs">Panel users →</Link>}>
      <div className="card overflow-hidden">
        {error ? <Failed error={error} /> : !d ? <Skeleton rows={12} /> : (
          <Table head={<tr><th className="th">Permission</th>{roles.map((r) => <th key={r} className="th text-center">{ROLE[r] || r}</th>)}</tr>}>
            {caps.map((c) => (
              <tr key={c}>
                <td className="td"><div className="font-mono text-2xs text-ink">{c}</div><div className="text-2xs text-muted">{ABOUT[c] || ''}</div></td>
                {roles.map((r) => <td key={r} className="td text-center">{d.roles[r].includes(c) ? <span className="font-bold text-good-700">✓</span> : <span className="text-muted">—</span>}</td>)}
              </tr>
            ))}
          </Table>
        )}
      </div>
      <p className="mt-2 text-2xs text-muted">Referral permissions do not exist — GaadiPe has no referral programme for now. Customers’ numbers are masked for any role without customers.view_sensitive.</p>
    </Shell>
  );
}
