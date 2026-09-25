import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Failed, Skeleton, Empty, Table } from '../../components/ui.jsx';
import { rs, num, pct } from './common.jsx';
import { ms } from '../vehicles/common.jsx';

/**
 * API PROVIDERS (user, 2026-09-25) — VAHAN, eChallan and FASTag (through
 * ULIP) side by side, then operation by operation: calls, success, failure,
 * timeouts, retries, latency, cost and cost per successful lookup. Filter by
 * operation, vehicle type and state. The request-by-request log is one click
 * away. No credential is ever shown.
 */
export default function ApiProviders() {
  const [params, controls, key] = usePeriod('api-providers', { defaultRange: '7d', withCompare: false });
  const [f, setF] = useState({ operation: '', state: '', vclass: '' });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    try { setError(null); setD(await api.apiProviders({ ...params, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) })); } catch (e) { setError(e); }
  }, [key, f]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const table = (rows, first) => (
    <Table head={<tr>{[first, 'Calls', 'Success', 'Failures', 'Timeouts', 'Retries', 'Avg latency', 'P95', 'Cost', 'Cost / success', 'Error rate', 'Cached'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
      {rows.map((x) => (
        <tr key={x.provider || x.operation}>
          <td className="td font-mono text-ink">{x.provider || x.operation}</td><td className="td tabular">{num(x.calls)}</td>
          <td className="td tabular">{pct(x.success_pct)}</td><td className={`td tabular ${x.failure ? 'text-wrong-700' : ''}`}>{num(x.failure)}</td>
          <td className="td tabular">{num(x.timeouts)}</td><td className="td tabular">{num(x.retries)}</td>
          <td className="td tabular">{ms(x.avg_ms)}</td><td className="td tabular">{ms(x.p95_ms)}</td>
          <td className="td tabular">{rs(x.cost_paise)}</td><td className="td tabular">{x.cost_per_success_paise == null ? '—' : rs(x.cost_per_success_paise)}</td>
          <td className="td tabular">{pct(x.error_pct)}</td><td className="td tabular text-muted">{num(x.cached)}</td>
        </tr>
      ))}
    </Table>
  );
  return (
    <Shell title="API providers" subtitle={d?.range.label || ' '} actions={<>{controls}<Link to="/vehicles/api-logs" className="btn-quiet !py-1.5 text-2xs">Request log →</Link></>}>
      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <select className="input !w-auto !py-1.5 text-sm" value={f.operation} onChange={(e) => setF((x) => ({ ...x, operation: e.target.value }))}>
          <option value="">Every operation</option>{(d?.filters.operations || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <input className="input !w-28 !py-1.5" placeholder="State (KA)" value={f.state} onChange={(e) => setF((x) => ({ ...x, state: e.target.value }))} />
        <input className="input !w-44 !py-1.5" placeholder="Vehicle type (Motor car)" value={f.vclass} onChange={(e) => setF((x) => ({ ...x, vclass: e.target.value }))} />
      </div>
      {error && !d ? <div className="card"><Failed error={error} onRetry={load} /></div> : !d ? <div className="card"><Skeleton rows={6} /></div> : (
        <div className="space-y-4">
          <div className="card overflow-hidden"><div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Providers</div>
            {!d.providers.length ? <Empty>No calls in this period.</Empty> : table(d.providers, 'Provider')}</div>
          <div className="card overflow-hidden"><div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Operations</div>
            {!d.operations.length ? <Empty>No calls in this period.</Empty> : table(d.operations, 'Operation')}</div>
          <div className="space-y-0.5 text-2xs text-muted"><p>{d.notes.retries}</p><p>{d.notes.cached}</p></div>
        </div>
      )}
    </Shell>
  );
}
