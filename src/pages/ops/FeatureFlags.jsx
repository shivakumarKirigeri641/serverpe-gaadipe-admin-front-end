import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Chip, Banner } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { Confirm } from '../vehicles/actions.jsx';

/**
 * FEATURE FLAGS (user, 2026-09-25) — switch parts of GaadiPe off and on for
 * customers. Each switch says exactly what turning it changes; every change
 * is confirmed and logged. Enforced on the server (src/util/flags.js), so a
 * switch works whatever screen a customer is on. Referral is not here — the
 * programme is off.
 */
export default function FeatureFlags() {
  const { can } = useSession();
  const may = allowed(can, 'settings.manage');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [ask, setAsk] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.flags()); } catch (e) { setError(e); } }, []);
  useEffect(() => { load(); }, [load]);
  const maint = d?.rows.find((r) => r.name === 'maintenance_mode')?.on;
  return (
    <Shell title="Feature flags" subtitle="What customers can use right now">
      {maint && <Banner tone="wrong" className="mb-3"><b>Maintenance mode is on.</b> Customers are told GaadiPe is under maintenance; no new payment can start.</Banner>}
      <div className="card divide-y divide-line">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : d.rows.map((f) => {
          const working = f.name === 'maintenance_mode' ? !f.on : f.on;
          return (
            <div key={f.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="text-sm font-semibold text-ink">{f.label}</span>
                  <Chip tone={working ? 'good' : 'wrong'}>{f.on ? 'Enabled' : 'Disabled'}</Chip></div>
                <p className="mt-0.5 text-2xs text-muted">{f.about}</p>
              </div>
              {may && (
                <button className={f.on === (f.name === 'maintenance_mode') ? 'btn-quiet !py-1.5 text-2xs' : 'btn-danger !py-1.5 text-2xs'}
                  onClick={() => setAsk(f)}>{f.on ? (f.name === 'maintenance_mode' ? 'Turn off maintenance' : 'Disable') : (f.name === 'maintenance_mode' ? 'Turn on maintenance' : 'Enable')}</button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-2xs text-muted">A change takes effect within about 15 seconds. Referral is not listed — GaadiPe has no referral programme for now.</p>
      {ask && (
        <Confirm title={`${ask.on ? (ask.name === 'maintenance_mode' ? 'Turn off' : 'Disable') : (ask.name === 'maintenance_mode' ? 'Turn on' : 'Enable')} “${ask.label}”?`}
          action="Yes, change it" tone={(ask.name === 'maintenance_mode') !== ask.on ? 'danger' : 'primary'} onClose={() => setAsk(null)}
          onConfirm={async () => { await api.setFlag(ask.name, !ask.on); snack(`${ask.label}: ${!ask.on ? 'enabled' : 'disabled'} — logged`); load(); }}>
          <p>{ask.about}</p>
          <p className="mt-2 text-2xs text-muted">Logged against your name with before and after.</p>
        </Confirm>
      )}
    </Shell>
  );
}
