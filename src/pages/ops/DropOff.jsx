import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Failed, Skeleton, Table, Hint } from '../../components/ui.jsx';
import { Funnel, Drill } from '../CommandCenter.jsx';
import { num } from './common.jsx';

/**
 * CONVERSION DROP-OFF (user, 2026-09-25) — the journey stage by stage: how
 * many reached each, what share of the stage before, how many stopped, and
 * the same against the previous period. Any stage opens its records. The
 * stages and their counts are the Command Center's own (one definition).
 */
export default function DropOff() {
  const [params, controls, key] = usePeriod('dropoff', { defaultRange: '7d' });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [drill, setDrill] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.commandOverview(params)); } catch (e) { setError(e); } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setD(null); load(); }, [load]);
  const open = (s) => s.drill && setDrill({ what: s.drill, title: s.label });
  const stages = d?.funnel || [];
  const change = (s) => {
    if (s.n == null) return <span className="text-muted">No data</span>;
    if (s.previous == null) return <span className="text-muted">—</span>;
    if (!s.previous) return <span className="text-muted">{s.n ? 'New' : 'No previous-period data'}</span>;
    const p = Math.round(((s.n - s.previous) / s.previous) * 1000) / 10;
    return <span className={p > 0 ? 'text-good-700' : p < 0 ? 'text-wrong-700' : 'text-muted'}>{p > 0 ? '▲' : p < 0 ? '▼' : '■'} {Math.abs(p)}%</span>;
  };
  return (
    <Shell title="Conversion drop-off" subtitle={d ? `${d.range.label}${d.compare ? ` · ${d.compare.label}` : ''}` : ' '} actions={controls}>
      {error && !d ? <div className="card"><Failed error={error} onRetry={load} /></div> : !d ? <div className="card"><Skeleton rows={10} /></div> : (
        <div className="space-y-4">
          <div className="card overflow-hidden"><Funnel stages={stages} compare={d.compare} onOpen={open} /></div>
          <div className="card overflow-hidden">
            <Table head={<tr>{['Stage', 'Users', 'Conversion', 'Drop-off', 'Previous period', 'Change', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
              {stages.map((s) => (
                <tr key={s.key} className={s.drill ? 'cursor-pointer hover:bg-shell/60' : ''} onClick={() => open(s)}>
                  <td className="td text-ink">{s.label}</td>
                  <td className="td tabular">{s.n == null ? <Hint note={s.unavailable}><span className="text-muted">No data</span></Hint> : num(s.n)}</td>
                  <td className="td tabular">{s.conversion_pct == null ? '—' : <Hint note={`Of “${s.from_stage}”.`}><span>{s.conversion_pct}%</span></Hint>}</td>
                  <td className="td tabular">{s.drop_pct == null ? '—' : <span className={s.drop_pct > 0 ? 'text-wrong-700' : ''}>{s.drop_pct}%</span>}</td>
                  <td className="td tabular">{s.previous == null ? '—' : num(s.previous)}</td>
                  <td className="td tabular text-2xs">{change(s)}</td>
                  <td className="td text-2xs text-brand">{s.drill ? 'Records →' : ''}</td>
                </tr>
              ))}
            </Table>
          </div>
          <p className="text-2xs text-muted">Conversion is from the nearest earlier stage with people in it. Website vehicle search is not a stage any more — the website sends people to WhatsApp.</p>
        </div>
      )}
      {drill && <Drill drill={drill} params={params} onClose={() => setDrill(null)} />}
    </Shell>
  );
}
