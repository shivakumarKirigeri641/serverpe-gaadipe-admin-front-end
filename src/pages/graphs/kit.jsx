import { useCallback, useEffect, useState } from 'react';
import { ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import { chartAnim } from '../../lib/motion.jsx';
import { count, rupees, date } from '../../lib/format';
import { Failed, Skeleton, Modal } from '../../components/ui.jsx';

/*
 * THE GRAPHS SECTION'S KIT (user, 2026-10-03). Every chart here is drawn with
 * these pieces, so they all look and behave the same:
 *
 *   SERIES   the categorical colours, in a fixed order — validated for colour
 *            blindness on the white surface (dataviz validator, all pass); three
 *            light ones are under 3:1, so every chart has a Table view.
 *   STATUS   good / failed, reserved — never a series colour.
 *   useGraph the page's data for the chosen days, kept current by the
 *            panel's Realtime setting (Live: every few seconds).
 *   Card     title, one line of what it shows, Chart / Table switch.
 *   Drill    the panel a clicked mark opens: the next level down.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
export const STATUS = { ok: '#12a150', failed: '#d92d20', neutral: '#94a3b8' };
export const AXIS = { fontSize: 11, fill: '#6b8380' };
export const GRID = { stroke: '#eef3f2', vertical: false };
export const anim = () => chartAnim();

export const inr = (paise) => rupees(paise, { decimals: false });
export const rupeeAxis = (paise) => {
  const v = Math.round(Number(paise || 0) / 100);
  return v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${v}`;
};
export const dayLabel = (d) => {
  const x = new Date(`${d}T00:00:00`);
  return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** The data for a page, re-read on the Realtime pace and when the range changes. */
export function useGraph(page) {
  const [days, setDays] = useState(() => { try { return Number(localStorage.getItem('gp.graphs.days')) || 30; } catch { return 30; } });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.graph(page, { days })
    .then((d) => { setData(d); setError(null); }).catch(setError), [page, days]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);
  const pick = (n) => { setDays(n); try { localStorage.setItem('gp.graphs.days', String(n)); } catch { /* private window */ } };
  return { data, error, days, setDays: pick, reload: load };
}

export const drill = (page, params) => api.graphDrill(page, params);

/** 7 / 30 / 90 days — one row, above the charts. */
export function Range({ days, setDays }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Period">
      {[7, 30, 90].map((n) => (
        <button key={n} type="button" onClick={() => setDays(n)} aria-pressed={days === n}
          className={`rounded-md px-3 py-1 text-2xs font-semibold ${days === n ? 'bg-brand text-white' : 'text-body hover:bg-shell'}`}>
          {n} days
        </button>
      ))}
    </div>
  );
}

/** The page body while it loads or if it failed. */
export function Body({ data, error, reload, children }) {
  if (error && !data) return <Failed error={error} onRetry={reload} />;
  if (!data) return <Skeleton rows={8} />;
  return children;
}

/**
 * A chart card. `table` = { columns: [[key, label, fmt?]], rows } gives the
 * Table view; `legend` = [[label, colour]] when there are two or more series.
 */
export function Card({ title, note, height = 260, legend, table, right, children, className = '' }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={`card cv-rise p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {note && <p className="text-2xs text-muted">{note}</p>}
        </div>
        <div className="flex items-center gap-2">
          {right}
          {table && (
            <div className="inline-flex rounded-md border border-line p-0.5 text-[10px] font-semibold">
              {['Chart', 'Table'].map((v) => (
                <button key={v} type="button" onClick={() => setAsTable(v === 'Table')}
                  className={`rounded px-2 py-0.5 ${(v === 'Table') === asTable ? 'bg-shell text-ink' : 'text-muted'}`}>{v}</button>
              ))}
            </div>
          )}
        </div>
      </div>
      {legend && legend.length > 1 && !asTable && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {legend.map(([label, colour]) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-2xs text-body">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colour }} aria-hidden="true" />{label}
            </span>
          ))}
        </div>
      )}
      {asTable && table ? <DataTable {...table} /> : (
        <div className="mt-3" style={{ width: '100%', height }}>
          <ResponsiveContainer>{children}</ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function DataTable({ columns, rows }) {
  return (
    <div className="mt-3 max-h-80 overflow-auto rounded-lg border border-line">
      <table className="w-full text-2xs">
        <thead className="sticky top-0 bg-shell"><tr>
          {columns.map(([k, l]) => <th key={k} className="px-3 py-1.5 text-left font-semibold text-muted">{l}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line/60">
              {columns.map(([k, , fmt]) => <td key={k} className="px-3 py-1 tabular text-ink">{fmt ? fmt(r[k], r) : r[k]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The tooltip every chart uses: a title and one line per series, values in ink. */
export function Tip({ active, payload, label, title, fmt = count, total }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter((p) => p.value != null && !p.hide);
  const sum = items.reduce((a, p) => a + Number(p.value || 0), 0);
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2 text-2xs shadow-lg">
      <div className="mb-1 font-semibold text-ink">{title ? title(label, payload) : label}</div>
      {items.map((p) => (
        <div key={p.name || String(p.dataKey)} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color || p.fill }} aria-hidden="true" />
          <span className="text-body">{p.name}</span>
          <b className="ml-auto pl-4 tabular text-ink">{(p.payload?.__fmt?.[p.dataKey] || fmt)(p.value)}</b>
        </div>
      ))}
      {total && items.length > 1 && (
        <div className="mt-1 flex border-t border-line pt-1 text-body"><span>{total}</span><b className="ml-auto pl-4 tabular text-ink">{fmt(sum)}</b></div>
      )}
    </div>
  );
}

/**
 * The details of a tapped mark, in a popup over the page (user, 2026-10-03:
 * "on tap, a details popup"): the next level down. Esc, Close or a tap outside
 * closes it; a popup opened from inside another (state → RTO → vehicles) sits
 * on top of it.
 */
export function Drill({ title, subtitle, onClose, loading, children }) {
  return (
    <Modal wide title={title} subtitle={subtitle} onClose={onClose}>
      {loading ? <Skeleton rows={4} /> : children}
    </Modal>
  );
}

/** People in a drill-down: name, masked number, when — each opens their journey. */
export function People({ rows, when = 'at', extra }) {
  if (!rows?.length) return <p className="text-2xs text-muted">Nobody here.</p>;
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-line">
      <table className="w-full text-2xs">
        <tbody>
          {rows.map((p, i) => (
            <tr key={i} className="border-t border-line/60 first:border-0">
              <td className="px-3 py-1.5 text-ink">{p.name || 'Unknown'}</td>
              <td className="px-3 py-1.5 tabular text-muted">{p.masked}</td>
              {extra && <td className="px-3 py-1.5 text-body">{extra(p)}</td>}
              <td className="px-3 py-1.5 text-muted">{p[when] ? date(p[when]) : ''}</td>
              <td className="px-3 py-1.5 text-right">{p.mobile && <Link className="text-brand hover:underline" to={`/journey?mobile=${p.mobile}`}>Journey →</Link>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Headline numbers above the charts. */
export function Stats({ items }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {items.map(([label, value, sub]) => (
        <div key={label} className="card px-3 py-2">
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</div>
          <div className="tabular text-xl font-semibold text-ink">{value}</div>
          {sub && <div className="text-2xs text-muted">{sub}</div>}
        </div>
      ))}
    </div>
  );
}

/** Speedometers in one card, above the charts (user, 2026-10-03). */
export function Gauges({ children }) {
  return <section className="card cv-rise mb-4 flex flex-wrap items-start justify-around gap-6 p-4">{children}</section>;
}

export const sumOf = (rows, key) => (rows || []).reduce((a, r) => a + Number(r[key] || 0), 0);
