import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Empty, Table, Pager, saveBlob } from '../../components/ui.jsx';
import { count, date } from '../../lib/format';

/**
 * VEHICLE CATALOGUE (user, 2026-10-25: "distinct vehicle details — one separate panel to show make, model,
 * variant, type, fuel and all vehicle details from the DB, only for me to see").
 *
 * Every vehicle GaadiPe has seen, one row each, with every RC detail on record — or grouped by make and
 * model to see what people drive. The server sends it all once (owner only: vehicles.catalogue); search,
 * filters, sorting, grouping and the CSV are worked out here.
 */
const COLS = [
  ['reg_no', 'Vehicle'], ['maker', 'Make'], ['model', 'Model / variant'], ['fuel', 'Fuel'],
  ['vehicle_class', 'Class'], ['vehicle_category', 'Category'], ['body_type', 'Body type'], ['colour', 'Colour'],
  ['cc', 'cc', true], ['cylinders', 'Cyl.', true], ['seats', 'Seats', true], ['norms', 'Emission norms'],
  ['manufactured', 'Made'], ['reg_date', 'Registered', 'date'], ['reg_upto', 'Reg. valid till', 'date'],
  ['registered_at', 'RTO'], ['owner_serial', 'Owner no.', true], ['financer', 'Financer'],
  ['insurance_company', 'Insurer'], ['insurance_upto', 'Insurance till', 'date'], ['pucc_upto', 'PUC till', 'date'],
  ['fitness_upto', 'Fitness till', 'date'], ['tax_upto', 'Tax till', 'date'], ['permit_type', 'Permit'],
  ['permit_upto', 'Permit till', 'date'], ['blacklist_status', 'Blacklist'], ['rc_status', 'RC status'],
  ['unladen_weight', 'Unladen kg', true], ['gross_weight', 'Gross kg', true], ['wheelbase', 'Wheelbase', true],
  ['source', 'From'], ['customers', 'Customers', true], ['reported', 'Report'],
];
const FILTERS = [['fuel', 'Fuel'], ['body_type', 'Body type'], ['vehicle_class', 'Class'], ['maker', 'Make']];
const SIZE = 100;

const text = (v) => (v == null || v === '' ? '' : String(v).trim());
const show = (r, [k, , kind]) => {
  if (k === 'reported') return r.reported ? 'Yes' : '';
  const v = text(r[k]);
  if (!v) return '';
  return kind === 'date' ? date(v) : v;
};
const sortValue = (r, k, kind) => {
  const v = r[k];
  if (v == null || v === '') return null;
  if (kind === true) return Number(String(v).replace(/[^0-9.]/g, '')) || 0;
  return String(v).toLowerCase();
};

export default function Catalogue() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState('all');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState({});
  const [sort, setSort] = useState({ key: null, dir: 1 });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.vehicleCatalogue()); } catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, pick, sort, mode]);

  const rows = data?.rows || [];
  // Each filter's choices, with how many vehicles have each value.
  const choices = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => {
    const m = new Map();
    for (const r of rows) { const v = text(r[k]) || '(blank)'; m.set(v, (m.get(v) || 0) + 1); }
    return [k, [...m.entries()].sort((a, b) => b[1] - a[1])];
  })), [rows]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    let out = rows.filter((r) => FILTERS.every(([k]) => !pick[k] || (text(r[k]) || '(blank)') === pick[k])
      && (!term || ['reg_no', 'maker', 'model', 'colour', 'body_type', 'fuel', 'financer', 'insurance_company', 'registered_at']
        .some((k) => text(r[k]).toLowerCase().includes(term))));
    if (sort.key) {
      const kind = COLS.find((c) => c[0] === sort.key)?.[2];
      out = [...out].sort((a, b) => {
        const x = sortValue(a, sort.key, kind); const y = sortValue(b, sort.key, kind);
        if (x == null) return 1; if (y == null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
    }
    return out;
  }, [rows, q, pick, sort]);

  // By make and model: what people drive, most common first.
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of shown) {
      const key = [text(r.maker) || '(unknown make)', text(r.model) || '(unknown model)', text(r.fuel), text(r.body_type)].join('\u0001');
      const g = m.get(key) || { maker: text(r.maker) || '(unknown make)', model: text(r.model) || '(unknown model)',
        fuel: text(r.fuel), body_type: text(r.body_type), vehicles: 0, reported: 0, years: new Set() };
      g.vehicles += 1; if (r.reported) g.reported += 1;
      const y = /(\d{4})/.exec(text(r.manufactured) || text(r.reg_date))?.[1]; if (y) g.years.add(y);
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.vehicles - a.vehicles);
  }, [shown]);

  const toggleSort = (k) => setSort((s) => (s.key === k ? (s.dir === 1 ? { key: k, dir: -1 } : { key: null, dir: 1 }) : { key: k, dir: 1 }));
  const csv = () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = mode === 'all'
      ? [COLS.map((c) => cell(c[1])).join(','), ...shown.map((r) => COLS.map((c) => cell(show(r, c))).join(','))]
      : [['Make', 'Model / variant', 'Fuel', 'Body type', 'Vehicles', 'With a report', 'Years'].map(cell).join(','),
        ...groups.map((g) => [g.maker, g.model, g.fuel, g.body_type, g.vehicles, g.reported, [...g.years].sort().join(' ')].map(cell).join(','))];
    saveBlob(new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }),
      `gaadipe-vehicles-${mode === 'all' ? 'all' : 'by-model'}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const filtered = q || Object.values(pick).some(Boolean);
  const list = mode === 'all' ? shown : groups;
  const pageRows = list.slice((page - 1) * SIZE, page * SIZE);

  return (
    <Shell title="Vehicle catalogue"
      subtitle={data ? `${count(data.total)} vehicles${data.capped ? ` (newest ${count(rows.length)} shown)` : ''} · only you can see this page` : ' '}
      actions={data && <button className="btn-quiet !py-1.5 text-2xs" onClick={csv}>Download CSV ({count(list.length)})</button>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-shell p-0.5 text-2xs font-semibold">
          {[['all', 'Every vehicle'], ['models', 'By make & model']].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`rounded-md px-3 py-1.5 ${mode === k ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{l}</button>
          ))}
        </div>
        <input className="input !w-64 !py-1.5 text-2xs" placeholder="Search number, make, model, colour, insurer…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        {FILTERS.map(([k, l]) => (
          <select key={k} className="input !w-auto !py-1.5 text-2xs" value={pick[k] || ''}
            onChange={(e) => setPick((p) => ({ ...p, [k]: e.target.value || undefined }))}>
            <option value="">{l}: all</option>
            {(choices[k] || []).map(([v, n]) => <option key={v} value={v}>{v} ({count(n)})</option>)}
          </select>
        ))}
        {filtered && <button className="btn-quiet !py-1.5 text-2xs" onClick={() => { setQ(''); setPick({}); }}>Clear</button>}
        {data && <span className="text-2xs text-muted">{mode === 'all' ? `${count(shown.length)} vehicles` : `${count(groups.length)} make / model combinations · ${count(shown.length)} vehicles`}</span>}
      </div>

      <div className="card overflow-hidden">
        {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <Skeleton rows={8} cols={6} /> : !list.length ? (
          <Empty>{filtered ? 'No vehicle matches this search or filter.' : 'No vehicles yet.'}</Empty>
        ) : mode === 'all' ? (
          <Table className="max-h-[70vh]" head={
            <tr>{COLS.map(([k, l, kind]) => (
              <th key={k} className={`th sticky top-0 cursor-pointer select-none whitespace-nowrap bg-shell ${kind === true ? 'text-right' : ''} ${k === 'reg_no' ? 'left-0 z-20' : 'z-10'}`}
                onClick={() => toggleSort(k)} title="Sort">
                {l}{sort.key === k ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}</tr>
          }>
            {pageRows.map((r) => (
              <tr key={r.reg_no} className="hover:bg-shell/70">
                {COLS.map((c) => (
                  <td key={c[0]} className={`td whitespace-nowrap text-2xs ${c[2] === true ? 'tabular text-right' : ''} ${c[0] === 'reg_no' ? 'sticky left-0 bg-white font-semibold' : ''}`}>
                    {c[0] === 'reg_no'
                      ? <Link to={`/vehicles/${encodeURIComponent(r.reg_no)}`} className="text-brand-deep hover:underline">{r.reg_no}</Link>
                      : show(r, c) || <span className="text-line">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
        ) : (
          <Table head={<tr>{['Make', 'Model / variant', 'Fuel', 'Body type', 'Vehicles', 'With a report', 'Years'].map((h) => <th key={h} className="th whitespace-nowrap">{h}</th>)}</tr>}>
            {pageRows.map((g) => (
              <tr key={`${g.maker}|${g.model}|${g.fuel}|${g.body_type}`} className="cursor-pointer hover:bg-shell/70"
                title="See these vehicles" onClick={() => { setQ(g.model.startsWith('(') ? '' : g.model); setPick({ maker: g.maker.startsWith('(') ? undefined : g.maker }); setMode('all'); }}>
                <td className="td text-2xs font-semibold">{g.maker}</td>
                <td className="td text-2xs">{g.model}</td>
                <td className="td text-2xs">{g.fuel || '—'}</td>
                <td className="td text-2xs">{g.body_type || '—'}</td>
                <td className="td tabular text-2xs font-semibold">{count(g.vehicles)}</td>
                <td className="td tabular text-2xs">{g.reported ? count(g.reported) : '—'}</td>
                <td className="td text-2xs text-muted">{[...g.years].sort().join(', ') || '—'}</td>
              </tr>
            ))}
          </Table>
        )}
        {data && <Pager page={page} total={list.length} size={SIZE} onPage={setPage} className="border-t border-line px-3 py-2" />}
      </div>
      <p className="mt-2 text-2xs text-muted">
        From each vehicle’s fullest RC record on file. No provider returns a separate variant: the RC’s model usually
        includes it. Owner names, addresses, chassis and engine numbers are left out. Tap a number for its full profile.
      </p>
    </Shell>
  );
}
