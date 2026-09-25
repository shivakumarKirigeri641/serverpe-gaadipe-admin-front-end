import { Link } from 'react-router-dom';
import { Hint } from '../../components/ui.jsx';
import { AnimatedNumber } from '../../lib/motion.jsx';

/*
 * Pieces the operations screens share (user, 2026-09-25): rupees, the change
 * against the previous period said honestly — an arrow and a percentage, or
 * "New" / "No previous-period data" when a percentage would mislead — and the
 * metric card every KPI sits in. The server decides every figure; these only
 * draw them.
 */

export const NO_DATA = <span className="text-muted">No data available</span>;
export const rs = (p, d = 2) => (p == null ? '—' : `${p < 0 ? '−' : ''}₹${(Math.abs(Number(p)) / 100).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })}`);
export const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
export const pct = (v) => (v == null ? '—' : `${v}%`);
export const fmtValue = (m) => (m.money ? rs(m.value) : num(m.value));

/** ↑ 18.4% vs ₹1,052 — or "New", "No previous-period data", "Previous period was a loss". */
export function Change({ m, money = m?.money, compact = false }) {
  if (!m || m.trend === 'none') return <span className="text-2xs text-muted">No comparison</span>;
  const tone = m.good == null ? 'text-muted' : m.good ? 'text-good-700' : 'text-wrong-700';
  const arrow = m.trend === 'up' ? '▲' : m.trend === 'down' ? '▼' : '■';
  const prev = money ? rs(m.previous) : num(m.previous);
  const abs = m.abs == null ? '' : `${m.abs > 0 ? '+' : m.abs < 0 ? '−' : '±'}${money ? rs(Math.abs(m.abs)) : num(Math.abs(m.abs))}`;
  return (
    <span className="text-2xs">
      <span className={`font-semibold ${tone}`}>{arrow} {m.pct != null ? `${Math.abs(m.pct)}%` : m.note}</span>
      {!compact && <span className="text-muted"> · {abs} · was {prev}</span>}
    </span>
  );
}

/* A KPI's tooltip: what it is, how it is worked out, which period, against what. */
function kpiNote(m, period) {
  return (
    <span className="block max-w-xs space-y-1">
      <span className="block">{m.about}</span>
      {m.formula && <span className="block whitespace-pre-line font-mono text-[10px]">{m.formula}</span>}
      {period && <span className="block text-[10px] opacity-80">Period: {period.label}{period.compare ? ` · compared ${period.compare}` : ''}</span>}
      {m.previous != null && <span className="block text-[10px] opacity-80">Previous: {m.money ? rs(m.previous) : num(m.previous)}</span>}
    </span>
  );
}

export function MetricCard({ m, delay = 0, period }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted">{m.label}</span>
      </div>
      <div className="tabular mt-1 text-2xl font-semibold text-ink">
        {m.value == null ? '—' : <AnimatedNumber value={m.value} worseUp={m.worse_up} format={(v) => (m.money ? rs(Math.round(v)) : num(Math.round(v)))} />}
      </div>
      <div className="mt-0.5"><Change m={m} /></div>
    </>
  );
  return (
    <Hint note={kpiNote(m, period)}>
      {m.to ? (
        <Link to={m.to} className={`card rise lift m-press block px-4 py-3 hover:shadow-pop ${delay ? `rise-${delay}` : ''}`}>{body}</Link>
      ) : <div className="card rise px-4 py-3">{body}</div>}
    </Hint>
  );
}

export const LEVEL = {
  operational: ['✓', 'text-good-700', 'Operational'], warning: ['!', 'text-watch-700', 'Warning'],
  degraded: ['!', 'text-watch-700', 'Degraded'], down: ['✕', 'text-wrong-700', 'Down'], unknown: ['?', 'text-muted', 'Unknown'],
};
