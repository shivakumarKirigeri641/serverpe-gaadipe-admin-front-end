import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import Shell from '../components/Shell.jsx';
import { Failed, Empty, Chip, Spinner, Banner } from '../components/ui.jsx';
import { dateTime, ago, count } from '../lib/format';

/**
 * ALERT CENTER (user, 2026-09-25, command center phase 6).
 *
 * What the checker found — the records API failing or slow, WhatsApp
 * deliveries failing, payments failing, a paid report missing, a job gone
 * quiet, email failing, a traffic spike, the revenue target met — raised when
 * a rule trips and resolved when it clears. Acknowledge to say "seen", resolve
 * by hand when it is dealt with. Thresholds: Settings → Alerts.
 */

const SEVERITY = {
  critical: ['🔴 Critical', 'wrong'], warning: ['🟠 Warning', 'watch'], info: ['🔵 Info', 'info'], success: ['🟢 Good news', 'good'],
};
const STATUS = { open: ['Open', 'wrong'], acknowledged: ['Acknowledged', 'watch'], resolved: ['Resolved', 'good'] };

export default function Alerts() {
  const [status, setStatus] = useState('active');
  const [severity, setSeverity] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { setRows((await api.alerts({ status, severity: severity || undefined })).rows); setError(null); } catch (e) { setError(e); }
  }, [status, severity]);
  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => { const t = setInterval(() => { if (!document.hidden) load(); }, 30000); return () => clearInterval(t); }, [load]);

  const act = async (fn, id) => { setBusy(id); try { await fn(); await load(); } catch (e) { alert(e.message); } setBusy(null); };

  return (
    <Shell title="Alerts" subtitle={rows ? `${count(rows.length)} ${status === 'active' ? 'open or acknowledged' : status}` : ' '}
      actions={
        <>
          <select className="input !w-auto !py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Open & acknowledged</option><option value="resolved">Resolved</option><option value="all">Everything</option>
          </select>
          <select className="input !w-auto !py-1.5 text-sm" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">Every severity</option>
            {Object.entries(SEVERITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </>
      }>
      {error && !rows ? <Failed error={error} onRetry={load} /> : !rows ? <Spinner /> : !rows.length ? (
        status === 'active'
          ? <Banner tone="good">Nothing needs attention. Alerts appear here the moment a check trips, and close themselves when it clears.</Banner>
          : <Empty>No alerts.</Empty>
      ) : (
        <div className="space-y-2">
          {rows.map((a) => {
            const [sev, sevTone] = SEVERITY[a.severity] || SEVERITY.info;
            const [st, stTone] = STATUS[a.status] || STATUS.open;
            return (
              <div key={a.id} className={`card rise px-5 py-4 ${a.status === 'open' && a.severity === 'critical' ? 'border-wrong-500/40' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip tone={sevTone}>{sev}</Chip>
                      <span className="text-sm font-semibold text-ink">{a.title}</span>
                      <Chip tone={stTone}>{st}</Chip>
                    </div>
                    {a.description && <p className="mt-1 max-w-3xl text-sm text-body">{a.description}</p>}
                    <p className="mt-1 text-2xs text-muted">
                      {String(a.source).replace(/_/g, ' ')} · raised {dateTime(a.created_at)}
                      {a.seen_count > 1 ? ` · still true ${ago(a.last_seen_at)} (checked ${count(a.seen_count)} times)` : ''}
                      {a.acknowledged_at ? ` · acknowledged by ${a.acknowledged_by_name || 'an admin'} ${ago(a.acknowledged_at)}` : ''}
                      {a.resolved_at ? ` · resolved ${a.resolved_by_name ? `by ${a.resolved_by_name}` : 'by itself'} ${ago(a.resolved_at)}${a.resolution ? ` — ${a.resolution}` : ''}` : ''}
                    </p>
                  </div>
                  {a.status !== 'resolved' && (
                    <div className="flex gap-2">
                      {a.status === 'open' && (
                        <button className="btn-quiet !py-1.5 text-2xs" disabled={busy === a.id}
                          onClick={() => act(() => api.ackAlert(a.id), a.id)}>Acknowledge</button>
                      )}
                      <button className="btn-primary !py-1.5 text-2xs" disabled={busy === a.id}
                        onClick={() => { const note = prompt('How was it resolved? (optional)') ?? null; if (note !== null) act(() => api.resolveAlert(a.id, note), a.id); }}>
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
