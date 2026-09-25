import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Failed, SkeletonCards, Table, Hint, Chip } from '../../components/ui.jsx';
import { dateTime } from '../../lib/format';
import { num } from './common.jsx';

/**
 * INFRASTRUCTURE (user, 2026-09-25) — the server under GaadiPe: CPU, memory,
 * disk, network, this Node process, PM2's applications, nginx, Postgres, and
 * when the SSL certificate and the domain expire. A check that cannot run on
 * this server says "Not available". No credential is ever shown.
 */
const NA = <span className="text-muted">Not available</span>;
const bar = (p, warnAt = 80) => p == null ? NA : (
  <div className="flex items-center gap-2"><div className="h-2 w-28 rounded bg-shell"><div className={`h-2 rounded ${p >= 95 ? 'bg-wrong-500' : p >= warnAt ? 'bg-watch-500' : 'bg-brand'}`} style={{ width: `${Math.min(100, p)}%` }} /></div><span className="tabular text-sm">{p}%</span></div>
);

export default function Infrastructure() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.infrastructure()); } catch (e) { setError(e); } }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 30000);
  const card = (title, rows) => (
    <div className="card p-4">
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      <dl className="space-y-1.5">{rows.map(([k, v]) => <div key={k} className="flex items-center justify-between gap-3"><dt className="text-2xs text-muted">{k}</dt><dd className="text-right text-sm text-ink">{v ?? NA}</dd></div>)}</dl>
    </div>
  );
  return (
    <Shell title="Infrastructure" subtitle={d ? `${d.host} · ${d.platform} · as of ${dateTime(d.at)}` : ' '}>
      {error && !d ? <div className="card"><Failed error={error} onRetry={load} /></div> : !d ? <SkeletonCards n={6} /> : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {card('Server', [['Uptime', `${num(d.server_uptime_h)} h`], ['CPU', `${d.cpu.cores} cores`],
              ['Load (1 min)', d.cpu.load_pct == null ? NA : bar(d.cpu.load_pct, 70)], ['Load 1 / 5 / 15', d.cpu.load_1m == null ? NA : `${d.cpu.load_1m.toFixed(2)} / ${d.cpu.load_5m.toFixed(2)} / ${d.cpu.load_15m.toFixed(2)}`],
              ['Memory', bar(d.memory.used_pct, 85)], ['Memory used', `${num(d.memory.used_mb)} of ${num(d.memory.total_mb)} MB`]])}
            {card('Disk & network', [['Disk', d.disk ? bar(d.disk.used_pct) : NA], ['Free', d.disk ? `${d.disk.free_gb} of ${d.disk.total_gb} GB` : NA],
              ['Network interfaces', d.network.length ? d.network.map((n) => n.name).join(', ') : NA]])}
            {card('Node process', [['Version', d.node.version], ['Uptime', `${num(d.node.uptime_min)} min`], ['Memory (RSS)', `${d.node.rss_mb} MB`], ['Heap used', `${d.node.heap_mb} MB`]])}
            {card('Postgres', d.postgres ? [['Version', d.postgres.version], ['Connections', `${d.postgres.connections} of ${d.postgres.max_connections} (${d.postgres.active} active)`],
              ['Database size', `${num(d.postgres.size_mb)} MB`], ['Up for', `${Math.round(d.postgres.uptime_s / 3600)} h`]] : [['Status', NA]])}
            {card('Web server & certificates', [['nginx', d.nginx ? <Chip tone={d.nginx === 'active' ? 'good' : 'wrong'}>{d.nginx}</Chip> : NA],
              ['SSL certificate', d.ssl ? <Hint note={`${d.ssl.issuer || ''} · until ${dateTime(d.ssl.valid_to)}`}><span className={d.ssl.days_left <= 14 ? 'text-wrong-700' : ''}>{d.ssl.days_left} days left</span></Hint> : NA],
              ['Domain registration', d.domain ? <span className={d.domain.days_left <= 30 ? 'text-wrong-700' : ''}>{d.domain.days_left} days left ({String(d.domain.expires).slice(0, 10)})</span> : NA]])}
          </div>
          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">PM2 applications</div>
            {!d.pm2 ? <p className="px-4 py-3 text-sm text-muted">Not available — PM2 is not installed or not reachable from the app on this server.</p> : (
              <Table head={<tr>{['Application', 'Status', 'Uptime', 'Restarts', 'Memory', 'CPU'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {d.pm2.map((p) => (
                  <tr key={p.name}><td className="td font-mono">{p.name}</td><td className="td"><Chip tone={p.status === 'online' ? 'good' : 'wrong'}>{p.status}</Chip></td>
                    <td className="td tabular">{p.uptime_min == null ? '—' : `${num(p.uptime_min)} min`}</td><td className="td tabular">{p.restarts ?? '—'}</td>
                    <td className="td tabular">{p.memory_mb == null ? '—' : `${p.memory_mb} MB`}</td><td className="td tabular">{p.cpu_pct == null ? '—' : `${p.cpu_pct}%`}</td></tr>
                ))}
              </Table>
            )}
          </div>
          <p className="text-2xs text-muted">{d.notes.unavailable} Alerts for disk, memory, SSL and domain use the thresholds in Settings.</p>
        </div>
      )}
    </Shell>
  );
}
