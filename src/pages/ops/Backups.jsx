import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import Shell from '../../components/Shell.jsx';
import { Failed, SkeletonCards, Empty, Table, Banner, Chip } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { dateTime } from '../../lib/format';
import { Confirm } from '../vehicles/actions.jsx';

/**
 * BACKUP & RECOVERY (user, 2026-09-25) — the last backup, its age and size,
 * every backup of either kind (the owner's download, or a scheduled one on
 * the server), retention, and the database's health. There is no restore
 * button: restoring replaces the live database and is done on the server.
 */
const size = (b) => (b == null ? '—' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const STATE = { ok: ['Up to date', 'good'], stale: ['Stale', 'watch'], failed: ['Last attempt failed', 'wrong'], none: ['No backup on record', 'wrong'] };

export default function Backups() {
  const { can } = useSession();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [ask, setAsk] = useState(false);
  const load = useCallback(async () => { try { setError(null); setD(await api.backups()); } catch (e) { setError(e); } }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <Shell title="Backup & recovery" subtitle={d ? STATE[d.state][0] : ' '}
      actions={allowed(can, 'admins') && d?.scheduled.enabled && <button className="btn-quiet !py-1.5 text-2xs" onClick={() => setAsk(true)}>Back up on the server now</button>}>
      {error && !d ? <div className="card"><Failed error={error} onRetry={load} /></div> : !d ? <SkeletonCards n={4} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[['Status', <Chip key="s" tone={STATE[d.state][1]}>{STATE[d.state][0]}</Chip>], ['Last backup', d.last ? dateTime(d.last.at) : '—'],
              ['Age', d.age_hours == null ? '—' : `${d.age_hours} h (stale after ${d.stale_after_hours} h)`], ['Size', size(d.last?.size_bytes)]].map(([l, v]) => (
              <div key={l} className="card px-4 py-3"><div className="text-2xs font-semibold uppercase tracking-wider text-muted">{l}</div><div className="mt-1 text-sm font-semibold text-ink">{v}</div></div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card p-4 text-sm">
              <h2 className="mb-1 font-semibold text-ink">Scheduled backups on the server</h2>
              <p>{d.scheduled.enabled ? `On — daily, kept ${d.scheduled.retention_days} days (${d.scheduled.files_kept} file(s) now).` : 'Off.'}</p>
              <p className="mt-1 text-2xs text-muted">{d.notes.scheduled} Switch on with backup_scheduled_enabled in Settings.</p>
              {allowed(can, 'admins') && <Link to="/settings" className="mt-2 inline-block text-2xs text-brand hover:underline">Settings →</Link>}
            </div>
            <div className="card p-4 text-sm">
              <h2 className="mb-1 font-semibold text-ink">Database health</h2>
              {!d.database ? <p className="text-muted">Not available</p> : (
                <p>{d.database.size_mb} MB · {d.database.connections} connection(s) · {d.database.deadlocks} deadlock(s) · {d.database.rollbacks} rolled-back transaction(s) since statistics were reset</p>
              )}
            </div>
          </div>
          <Banner>{d.notes.restore}</Banner>
          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">History</div>
            {!d.history.length ? <Empty>No backup has been taken. The owner can download one from Maintenance.</Empty> : (
              <Table head={<tr>{['When', 'Kind', 'Status', 'Size', 'File', 'By', 'Error'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {d.history.map((h) => (
                  <tr key={h.id}>
                    <td className="td whitespace-nowrap">{dateTime(h.at)}</td><td className="td">{h.kind === 'download' ? 'Downloaded from the panel' : 'Scheduled (server)'}</td>
                    <td className="td"><Chip tone={h.status === 'success' ? 'good' : h.status === 'deleted' ? 'info' : 'wrong'}>{h.status === 'deleted' ? 'expired (retention)' : h.status}</Chip></td>
                    <td className="td tabular">{size(h.size_bytes)}</td><td className="td font-mono text-2xs">{h.file || '—'}</td><td className="td">{h.by || '—'}</td>
                    <td className="td text-2xs text-wrong-700">{h.error || ''}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}
      {ask && (
        <Confirm title="Back up the database on the server now?" action="Back up" onClose={() => setAsk(false)}
          onConfirm={async () => { const out = await api.runBackup(); snack(out.ok ? 'Backup written' : out.message, out.ok ? 'good' : 'wrong'); load(); }}>
          Writes a full copy of the database — every customer’s details — to the server’s backup folder, kept for the retention period. Logged against your name.
        </Confirm>
      )}
    </Shell>
  );
}
