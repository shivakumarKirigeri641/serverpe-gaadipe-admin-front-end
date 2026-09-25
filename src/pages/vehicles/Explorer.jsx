import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Chip, Hint, Failed, Skeleton, Empty, Pager, Modal, Field } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { count, dateTime, ago } from '../../lib/format';
import {
  NA, inr, DocChip, PAY_TONE, PAY_WORD, CHANNEL, TAG_WORD, useVehicleMeta, copy, linkTo,
} from './common.jsx';
import { TagDialog, NoteDialog, ListDialog, AssignDialog, Confirm, ExportDialog } from './actions.jsx';

/**
 * VEHICLE EXPLORER (user, 2026-09-25) — every vehicle GaadiPe has seen, one
 * row each, searched, filtered, sorted and paged on the server.
 *
 * The filters live in the address bar, so a view is a link: the sidebar's
 * "Paid reports", "Expired documents" … are this screen with a `view`, and
 * any filter can be bookmarked or sent to a colleague. Columns — which,
 * in what order and how wide — are saved per admin on the server.
 */

const SIZE = 50;

/* The columns. `sort` is what the server sorts by; `w` the starting width. */
const COLUMNS = [
  { key: 'reg_no', label: 'Vehicle number', sort: 'reg_no', w: 150, fixed: true },
  { key: 'maker', label: 'Manufacturer', sort: 'maker', w: 170 },
  { key: 'model', label: 'Model', sort: 'model', w: 190 },
  { key: 'variant', label: 'Variant', w: 110, note: 'The records API does not return a variant.' },
  { key: 'fuel', label: 'Fuel', w: 90 },
  { key: 'vehicle_class', label: 'Vehicle class', w: 160 },
  { key: 'rto', label: 'State / RTO', w: 110 },
  { key: 'first_seen', label: 'First seen', sort: 'first_seen', w: 130 },
  { key: 'last_seen', label: 'Last activity', sort: 'last_seen', w: 130 },
  { key: 'lookups', label: 'Lookups', sort: 'lookups', w: 90, num: true },
  { key: 'reports', label: 'Reports', sort: 'reports', w: 90, num: true },
  { key: 'paid', label: 'Purchased', sort: 'paid', w: 100, num: true },
  { key: 'revenue', label: 'Revenue', sort: 'revenue', w: 100, num: true },
  { key: 'last_channel', label: 'Last channel', w: 110 },
  { key: 'payment_status', label: 'Payment', w: 100 },
  { key: 'docs', label: 'Documents', sort: 'expired', w: 230 },
  { key: 'challans', label: 'Challans', sort: 'challans', w: 110 },
  { key: 'flags', label: 'Blacklist / loan', w: 150 },
  { key: 'customer', label: 'Customer', w: 130 },
  { key: 'customers', label: 'Customers', sort: 'customers', w: 100, num: true },
  { key: 'tags', label: 'Tags · assigned', w: 190 },
];
const DEFAULT_HIDDEN = ['variant', 'first_seen', 'revenue', 'customers', 'fuel'];
const DEFAULT_LAYOUT = { order: COLUMNS.map((c) => c.key), hidden: DEFAULT_HIDDEN, widths: {} };
const PREF_COLUMNS = 'vehicles.columns';
const PREF_FILTERS = 'vehicles.filters';

/* Sidebar views — the same screen with a preset. */
export const VIEWS = {
  '': 'Vehicle Explorer', recent: 'Recent vehicles', paid: 'Paid reports', unpaid: 'Unpaid lookups',
  whatsapp: 'WhatsApp vehicles', web: 'Website vehicles', expired: 'Expired documents',
  challans: 'Challan vehicles', blacklisted: 'Blacklisted vehicles', loan: 'Loan / hypothecation',
};

/* Every filter the drawer offers, and its choices. */
const DOC_CHOICES = [['', 'Any'], ['valid', 'Valid'], ['soon', 'Expiring soon'], ['expired', 'Expired'], ['na', 'Not available'], ['unknown', 'Unknown']];
const SELECTS = [
  ['channel', 'Channel', [['', 'Any'], ['whatsapp', 'WhatsApp'], ['web', 'Website']]],
  ['paid', 'Paid / unpaid', [['', 'Any'], ['yes', 'Paid'], ['no', 'Unpaid']]],
  ['report', 'Report', [['', 'Any'], ['yes', 'Generated'], ['no', 'Not generated']]],
  ['payment', 'Payment status', [['', 'Any'], ['paid', 'Paid'], ['pending', 'Pending'], ['failed', 'Failed'], ['none', 'No payment']]],
  ['insurance', 'Insurance', DOC_CHOICES], ['puc', 'PUC', DOC_CHOICES], ['tax', 'Road tax', DOC_CHOICES],
  ['permit', 'Permit', DOC_CHOICES], ['fitness', 'Fitness', DOC_CHOICES],
  ['expired_min', 'Expired documents', [['', 'Any'], ['1', '1 or more'], ['2', '2 or more'], ['3', '3 or more']]],
  ['challan', 'Challans', [['', 'Any'], ['pending', 'Pending challans'], ['any', 'Any challan'], ['none', 'None found'], ['unknown', 'Not checked']]],
  ['blacklist', 'Blacklist', [['', 'Any'], ['flagged', 'Flagged'], ['clear', 'Not flagged'], ['unknown', 'Unknown']]],
  ['loan', 'Loan / hypothecation', [['', 'Any'], ['financier', 'Financier on RC'], ['none_recorded', 'None recorded'], ['unknown', 'Unknown']]],
  ['api', 'Records API', [['', 'Any'], ['ok', 'All calls succeeded'], ['failed', 'A call failed']]],
  ['repeat', 'Repeat searches', [['', 'Any'], ['1', 'Looked up 2+ times']]],
  ['archived', 'Archived', [['', 'Hide archived'], ['all', 'Include archived'], ['only', 'Only archived']]],
];
const TEXTS = [['state', 'State', 'KA'], ['rto', 'RTO', 'KA01'], ['maker', 'Manufacturer', 'Maruti'], ['model', 'Model', 'Swift'],
  ['fuel', 'Fuel', 'Petrol'], ['vclass', 'Vehicle class', 'Motor car']];
const FILTER_KEYS = ['from', 'to', ...TEXTS.map(([k]) => k), ...SELECTS.map(([k]) => k), 'tag', 'list', 'assigned'];

const QUICK = [
  ['Expired insurance', { insurance: 'expired' }], ['Expired PUC', { puc: 'expired' }], ['Expired tax', { tax: 'expired' }],
  ['Expired permit', { permit: 'expired' }], ['2+ expired documents', { expired_min: '2' }],
];

export default function Explorer() {
  const { can } = useSession();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const params = useMemo(() => Object.fromEntries(sp.entries()), [sp]);
  const view = params.view || '';
  const page = Math.max(1, Number(params.page) || 1);
  const [meta, refreshMeta] = useVehicleMeta();

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  const [typed, setTyped] = useState(params.q || '');
  const [drawer, setDrawer] = useState(false);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [saved, setSaved] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [dialog, setDialog] = useState(null);

  const set = useCallback((patch, keepPage = false) => {
    const next = { ...params, ...patch };
    if (!keepPage) delete next.page;
    setSp(Object.fromEntries(Object.entries(next).filter(([, v]) => v !== '' && v != null)));
  }, [params, setSp]);

  // Search as you type, a moment after the typing stops.
  useEffect(() => { setTyped(params.q || ''); }, [params.q]);
  useEffect(() => {
    if ((params.q || '') === typed.trim()) return undefined;
    const t = setTimeout(() => set({ q: typed.trim() }), 350);
    return () => clearTimeout(t);
  }, [typed]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useMemo(() => ({ ...params, page: undefined, limit: SIZE, offset: (page - 1) * SIZE }), [params, page]);
  const load = useCallback(async () => {
    try { setError(null); setData(await api.vehicles(query)); } catch (e) { setError(e); }
  }, [query]);
  useEffect(() => { setData(null); setSelected(new Set()); load(); }, [load]);
  useAutoRefresh(load, 30000);
  useEffect(() => { api.vehicleStats().then(setStats).catch(() => {}); }, []);

  // This admin's columns and saved filters, from the server.
  useEffect(() => {
    api.pref(PREF_COLUMNS).then(({ value }) => {
      if (value?.order) {
        const known = COLUMNS.map((c) => c.key);
        const order = [...value.order.filter((k) => known.includes(k)), ...known.filter((k) => !value.order.includes(k))];
        setLayout({ order, hidden: (value.hidden || []).filter((k) => known.includes(k)), widths: value.widths || {} });
      }
    }).catch(() => {});
    api.pref(PREF_FILTERS).then(({ value }) => setSaved(Array.isArray(value) ? value : [])).catch(() => {});
  }, []);
  const saveTimer = useRef(null);
  const saveLayout = (next) => {
    setLayout(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => api.setPref(PREF_COLUMNS, next).catch(() => {}), 600);
  };

  const cols = layout.order.map((k) => COLUMNS.find((c) => c.key === k)).filter((c) => c && !layout.hidden.includes(c.key));
  const widthOf = (c) => layout.widths[c.key] || c.w;
  const sortBy = (c) => {
    if (!c.sort) return;
    const dir = params.sort === c.sort && params.dir !== 'asc' ? 'asc' : 'desc';
    set({ sort: c.sort, dir });
  };

  /* Resize: drag the edge of a heading. */
  const startResize = (e, c) => {
    e.preventDefault(); e.stopPropagation();
    const x0 = e.clientX; const w0 = widthOf(c);
    let latest = layout;
    const move = (ev) => {
      latest = { ...latest, widths: { ...latest.widths, [c.key]: Math.max(70, Math.min(600, w0 + ev.clientX - x0)) } };
      setLayout(latest);
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); saveLayout(latest); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };

  const rows = data?.rows || [];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const ids = [...selected];

  const activeFilters = FILTER_KEYS.filter((k) => params[k]);
  const listName = params.list ? meta?.lists?.find((l) => l.id === params.list)?.name : null;
  const title = listName ? `List: ${listName}` : VIEWS[view] || 'Vehicle Explorer';

  const saveFilter = async (name) => {
    const entry = { name, params: Object.fromEntries(Object.entries(params).filter(([k]) => !['page'].includes(k))) };
    const next = [...saved.filter((s) => s.name !== name), entry].slice(-20);
    setSaved(next); await api.setPref(PREF_FILTERS, next); snack('Filter saved');
  };
  const dropFilter = async (name) => {
    const next = saved.filter((s) => s.name !== name);
    setSaved(next); await api.setPref(PREF_FILTERS, next).catch(() => {});
  };

  const mayTag = allowed(can, 'vehicles.tags');
  const mayNote = allowed(can, 'vehicles.notes');
  const mayExport = allowed(can, 'vehicles.export');
  const done = () => { load(); refreshMeta(); };

  return (
    <Shell title={title} subtitle={data ? `${count(data.total)} vehicle${data.total === 1 ? '' : 's'}${activeFilters.length ? ` · ${activeFilters.length} filter${activeFilters.length === 1 ? '' : 's'}` : ''}` : ' '}
      actions={<>
        <button className="btn-quiet !py-1.5 text-2xs" onClick={() => setColumnsOpen(true)}>Columns</button>
        {mayExport && <button className="btn-quiet !py-1.5 text-2xs" onClick={() => setDialog({ kind: 'export' })} disabled={!data?.total}>Export</button>}
      </>}>

      {/* ───────────────────────── the numbers ── */}
      {!view && !params.list && <StatsStrip s={stats} onPick={(p) => set(p)} />}

      {/* ───────────────────────── search ── */}
      <div className="card mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[240px] flex-1">
            <input className="input !py-2 pl-9" value={typed} onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') set({ q: typed.trim() }); }}
              placeholder="Search vehicle number, customer phone, WhatsApp number, report ID, payment ID…" aria-label="Search vehicles" />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">⌕</span>
          </div>
          <label className="flex items-center gap-1.5 text-2xs text-muted" title="Only the exact vehicle number">
            <input type="checkbox" checked={params.exact === '1'} onChange={(e) => set({ exact: e.target.checked ? '1' : '' })} /> Exact
          </label>
          <button className="btn-primary !py-2 text-sm" onClick={() => set({ q: typed.trim() })}>Search</button>
          <button className={`btn-quiet !py-2 text-sm ${activeFilters.length ? '!border-brand text-brand-deep' : ''}`} onClick={() => setDrawer(true)}>
            Filters{activeFilters.length ? ` · ${activeFilters.length}` : ''}
          </button>
          <button className="btn-quiet !py-2 text-sm" onClick={() => { setTyped(''); setSp(view ? { view } : {}); }}>Reset</button>
          <button className="btn-quiet !py-2 text-sm" onClick={() => setDialog({ kind: 'save_filter' })}>Save filter</button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {QUICK.map(([label, p]) => {
            const on = Object.entries(p).every(([k, v]) => params[k] === v);
            return (
              <button key={label} onClick={() => set(on ? Object.fromEntries(Object.keys(p).map((k) => [k, ''])) : p)}
                className={`chip border ${on ? 'border-wrong-500/40 bg-wrong-50 text-wrong-700' : 'border-line bg-white text-body hover:bg-shell'}`}>{label}</button>
            );
          })}
          {saved.length > 0 && <span className="mx-1 h-4 w-px bg-line" />}
          {saved.map((s) => (
            <span key={s.name} className="chip border border-brand/20 bg-brand/5 text-brand-deep">
              <button onClick={() => setSp(s.params)}>★ {s.name}</button>
              <button className="opacity-60 hover:opacity-100" onClick={() => dropFilter(s.name)} aria-label={`Remove ${s.name}`}>✕</button>
            </span>
          ))}
        </div>
        {activeFilters.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activeFilters.map((k) => (
              <span key={k} className="chip border border-line bg-shell text-body">
                {labelOf(k)}: {valueWord(k, params[k], meta)}
                <button className="opacity-60 hover:opacity-100" onClick={() => set({ [k]: '' })} aria-label={`Clear ${labelOf(k)}`}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ───────────────────────── bulk bar ── */}
      {ids.length > 0 && (
        <div className="fade sticky top-14 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
          <b className="text-brand-deep">{ids.length} selected</b>
          {mayExport && <button className="btn-quiet !py-1 text-2xs" onClick={() => setDialog({ kind: 'export', ids })}>Export</button>}
          {mayTag && <button className="btn-quiet !py-1 text-2xs" onClick={() => setDialog({ kind: 'tag', ids })}>Add tag</button>}
          {mayTag && <button className="btn-quiet !py-1 text-2xs" onClick={() => setDialog({ kind: 'list', ids })}>Add to list</button>}
          {mayTag && params.list && <button className="btn-quiet !py-1 text-2xs" onClick={() => setDialog({ kind: 'unlist', ids })}>Remove from this list</button>}
          {mayTag && <button className="btn-quiet !py-1 text-2xs" onClick={() => setDialog({ kind: 'assign', ids })}>Assign</button>}
          {mayTag && <button className="btn-quiet !py-1 text-2xs" onClick={() => setDialog({ kind: params.archived === 'only' ? 'unarchive' : 'archive', ids })}>
            {params.archived === 'only' ? 'Restore' : 'Archive'}</button>}
          <button className="ml-auto text-2xs text-muted hover:text-ink" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {/* ───────────────────────── the table ── */}
      <div className="card overflow-hidden">
        {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <Skeleton rows={10} cols={8} /> : !rows.length ? (
          <Empty>{params.q ? `No vehicle matches “${params.q}”.` : 'No vehicles match these filters.'}</Empty>
        ) : (
          <>
            <div className="max-h-[70vh] overflow-auto">
              <table className="border-collapse text-sm" style={{ tableLayout: 'fixed', width: 44 + 120 + cols.reduce((a, c) => a + widthOf(c), 0) }}>
                <colgroup>
                  <col style={{ width: 44 }} />
                  {cols.map((c) => <col key={c.key} style={{ width: widthOf(c) }} />)}
                  <col style={{ width: 120 }} />
                </colgroup>
                <thead className="sticky top-0 z-[1] bg-shell shadow-[0_1px_0_#e3ecea]">
                  <tr>
                    <th className="th !px-3"><input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Select all on this page" /></th>
                    {cols.map((c) => {
                      const on = params.sort === c.sort || (!params.sort && c.sort === 'last_seen');
                      return (
                        <th key={c.key} className={`th relative select-none !px-3 ${c.sort ? 'cursor-pointer hover:text-ink' : ''} ${c.num ? 'text-right' : ''}`}
                          onClick={() => sortBy(c)} aria-sort={on ? (params.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                          <Hint note={c.note}><span className="truncate">{c.label}</span></Hint>
                          {c.sort && on && <span className="ml-1">{params.dir === 'asc' ? '▲' : '▼'}</span>}
                          <span className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-brand/20" onMouseDown={(e) => startResize(e, c)} onClick={(e) => e.stopPropagation()} />
                        </th>
                      );
                    })}
                    <th className="th !px-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => (
                    <tr key={r.id} className={`group hover:bg-shell/60 ${selected.has(r.id) ? 'bg-brand/5' : ''}`}>
                      <td className="px-3 py-2"><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.display}`} /></td>
                      {cols.map((c) => (
                        <td key={c.key} className={`truncate px-3 py-2 align-middle ${c.num ? 'text-right tabular' : ''}`}>
                          <Cell c={c} r={r} />
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        <RowActions r={r} navigate={navigate} mayTag={mayTag} mayNote={mayNote} open={(kind) => setDialog({ kind, ids: [r.id], row: r })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={page} total={data.total} size={SIZE} onPage={(p) => set({ page: String(p) }, true)} />
          </>
        )}
      </div>
      <p className="mt-2 text-2xs text-muted">
        Customer numbers are masked; open a vehicle to reveal one (logged). Documents: expiring soon means within {data?.soon_days ?? 30} days.
        “Not available” means the records API returned no date — not that the document is missing.
      </p>

      {drawer && <FilterDrawer params={params} meta={meta} onClose={() => setDrawer(false)} onApply={(p) => { set(p); setDrawer(false); }} />}
      {columnsOpen && <ColumnsDialog layout={layout} onChange={saveLayout} onClose={() => setColumnsOpen(false)} />}
      {dialog?.kind === 'export' && <ExportDialog meta={meta} total={data?.total || 0} selected={dialog.ids} params={query} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'tag' && <TagDialog ids={dialog.ids} meta={meta} current={dialog.row?.tags || []} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'note' && <NoteDialog reg={dialog.row.reg_no} display={dialog.row.display} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'list' && <ListDialog ids={dialog.ids} meta={meta} refreshMeta={refreshMeta} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'assign' && <AssignDialog ids={dialog.ids} meta={meta} onClose={() => setDialog(null)} onDone={done} />}
      {(dialog?.kind === 'archive' || dialog?.kind === 'unarchive') && (
        <Confirm title={dialog.kind === 'archive' ? `Archive ${dialog.ids.length} vehicle${dialog.ids.length === 1 ? '' : 's'}?` : 'Restore to the operational views?'}
          action={dialog.kind === 'archive' ? 'Archive' : 'Restore'} onClose={() => setDialog(null)}
          onConfirm={async () => { await api.vehicleBulk('archive', { vehicle_ids: dialog.ids, archived: dialog.kind === 'archive' }); snack(dialog.kind === 'archive' ? 'Archived' : 'Restored'); done(); }}>
          {dialog.kind === 'archive'
            ? 'Archived vehicles leave the explorer’s everyday views. Nothing is deleted — every lookup, report, payment and note stays, and “Archived: only” brings them back.'
            : 'These vehicles will show in the everyday views again.'}
        </Confirm>
      )}
      {dialog?.kind === 'unlist' && (
        <Confirm title={`Remove ${dialog.ids.length} from “${listName}”?`} action="Remove" onClose={() => setDialog(null)}
          onConfirm={async () => { await api.vehicleListItems(params.list, { vehicle_ids: dialog.ids, action: 'remove' }); snack('Removed from the list'); done(); }}>
          Only the list entry goes. The vehicles and their history are untouched.
        </Confirm>
      )}
      {dialog?.kind === 'save_filter' && <SaveFilterDialog onClose={() => setDialog(null)} onSave={saveFilter} />}
    </Shell>
  );
}

/* ───────────────────────── a cell ── */

function Cell({ c, r }) {
  switch (c.key) {
    case 'reg_no': return <Link to={`/vehicles/${r.reg_no}`} className="font-mono text-sm font-semibold text-brand-deep hover:underline">{r.display}</Link>;
    case 'variant': return NA;
    case 'rto': return <span>{r.state} · {r.rto}</span>;
    case 'first_seen': return r.first_seen ? <span title={dateTime(r.first_seen)}>{dateTime(r.first_seen)}</span> : '—';
    case 'last_seen': return r.last_seen ? <span title={dateTime(r.last_seen)}>{ago(r.last_seen)}</span> : '—';
    case 'lookups': return count(r.lookups);
    case 'reports': return count(r.reports);
    case 'paid': return count(r.paid);
    case 'revenue': return inr(r.paid_paise, 0);
    case 'last_channel': return r.last_channel ? CHANNEL[r.last_channel] || r.last_channel : '—';
    case 'payment_status': return <Chip tone={PAY_TONE[r.payment_status]}>{PAY_WORD[r.payment_status]}</Chip>;
    case 'docs': return (
      <span className="flex flex-wrap gap-1">
        <DocChip label="Ins" state={r.docs.insurance.state} upto={r.docs.insurance.upto} />
        <DocChip label="PUC" state={r.docs.puc.state} upto={r.docs.puc.upto} />
        <DocChip label="Tax" state={r.docs.tax.state} upto={r.docs.tax.upto} />
        <DocChip label="Permit" state={r.docs.permit.state} upto={r.docs.permit.upto} />
      </span>
    );
    case 'challans': return r.challans_total == null ? <span className="text-muted">Not checked</span>
      : r.challans_pending > 0 ? <Chip tone="wrong">{r.challans_pending} pending</Chip>
        : <span className="text-muted">{r.challans_total ? `${r.challans_total} paid` : 'None found'}</span>;
    case 'flags': return (
      <span className="flex flex-wrap gap-1">
        {r.blacklisted === true && <Chip tone="wrong" note="Blacklist / NTBT status on the RC">Blacklist</Chip>}
        {r.financier === true && <Chip tone="watch" note="A financier is recorded on the RC">Financier</Chip>}
        {r.api_failed > 0 && <Chip tone="watch" note={`${r.api_failed} records-API call(s) failed`}>API</Chip>}
        {r.blacklisted == null && r.financier == null && <span className="text-muted">Unknown</span>}
        {r.blacklisted === false && r.financier === false && !r.api_failed && <span className="text-muted">—</span>}
      </span>
    );
    case 'customer': return r.customer || '—';
    case 'customers': return count(r.customers);
    case 'tags': return (
      <span className="flex flex-wrap gap-1">
        {r.archived && <Chip>Archived</Chip>}
        {r.tags.map((t) => <Chip key={t} tone="brand">{TAG_WORD(t)}</Chip>)}
        {r.assigned_name && <span className="text-2xs text-muted">→ {r.assigned_name}</span>}
        {!r.tags.length && !r.assigned_name && !r.archived && <span className="text-muted">—</span>}
      </span>
    );
    default: return r[c.key] ?? <span className="text-muted">—</span>;
  }
}

/* ───────────────────────── row actions ── */

function RowActions({ r, navigate, mayTag, mayNote, open }) {
  const [menu, setMenu] = useState(false);
  const go = (hash) => navigate(`/vehicles/${r.reg_no}${hash ? `#${hash}` : ''}`);
  const item = 'block w-full px-3 py-1.5 text-left text-sm hover:bg-shell';
  return (
    <div className="relative flex items-center gap-1">
      <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => go()}>View</button>
      <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => setMenu((v) => !v)} aria-label="More actions" aria-expanded={menu}>⋯</button>
      {menu && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
          <div className="absolute right-0 top-8 z-30 w-48 overflow-hidden rounded-lg border border-line bg-white py-1 shadow-pop" onClick={() => setMenu(false)}>
            <button className={item} onClick={() => go('timeline')}>Timeline</button>
            <button className={item} onClick={() => go('reports')}>Reports</button>
            <button className={item} onClick={() => go('payments')}>Payments</button>
            <button className={item} onClick={() => go('whatsapp')}>WhatsApp</button>
            {mayTag && <button className={item} onClick={() => open('tag')}>Add tag</button>}
            {mayNote && <button className={item} onClick={() => open('note')}>Add note</button>}
            {mayTag && <button className={item} onClick={() => open('list')}>Add to list</button>}
            {mayTag && <button className={item} onClick={() => open('assign')}>Assign</button>}
            <button className={item} onClick={async () => { if (await copy(linkTo(r.reg_no))) snack('Link copied'); }}>Copy link</button>
            {mayTag && <button className={`${item} text-wrong-700`} onClick={() => open(r.archived ? 'unarchive' : 'archive')}>{r.archived ? 'Restore' : 'Archive'}</button>}
          </div>
        </>
      )}
    </div>
  );
}

/* ───────────────────────── the numbers strip ── */

function Delta({ now, before }) {
  if (before == null) return null;
  if (!before) return <span className="text-muted">{now ? 'new' : '—'}</span>;
  const d = Math.round(((now - before) / before) * 100);
  return <span className={d > 0 ? 'text-good-700' : d < 0 ? 'text-wrong-700' : 'text-muted'}>{d > 0 ? '▲' : d < 0 ? '▼' : ''} {Math.abs(d)}%</span>;
}

function StatsStrip({ s, onPick }) {
  if (!s) return <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="card h-[68px] skeleton" />)}</div>;
  const tile = (label, value, sub, onClick, note) => (
    <Hint note={note}>
      <button type="button" onClick={onClick} disabled={!onClick}
        className={`card w-full px-3 py-2 text-left ${onClick ? 'lift hover:shadow-pop' : 'cursor-default'}`}>
        <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</div>
        <div className="tabular text-xl font-semibold text-ink">{count(value)}</div>
        {sub && <div className="text-2xs text-muted">{sub}</div>}
      </button>
    </Hint>
  );
  return (
    <div className="mb-3 space-y-2">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {tile('Unique vehicles', s.total, 'all time')}
        {tile('Today', s.today, <>vs {count(s.yesterday)} yesterday · <Delta now={s.today} before={s.yesterday} /></>, null, s.compare.day.label)}
        {tile('7 days', s.d7, <>vs {count(s.compare.week.before)} · <Delta now={s.compare.week.now} before={s.compare.week.before} /></>, null, s.compare.week.label)}
        {tile('30 days', s.d30, <>month: {count(s.compare.month.now)} vs {count(s.compare.month.before)} · <Delta now={s.compare.month.now} before={s.compare.month.before} /></>, null, s.compare.month.label)}
        {tile('Lookups today', s.lookups_today, 'every search, found or not')}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {tile('Repeat searches', s.repeat, 'looked up 2+ times', () => onPick({ repeat: '1' }))}
        {tile('Paid', s.paid, 'at least one paid report', () => onPick({ paid: 'yes' }))}
        {tile('Unpaid', s.unpaid, 'looked up, never paid', () => onPick({ paid: 'no' }))}
        {tile('WhatsApp', s.whatsapp, 'looked up on WhatsApp', () => onPick({ channel: 'whatsapp' }))}
        {tile('Website', s.web, 'looked up on the website', () => onPick({ channel: 'web' }))}
      </div>
    </div>
  );
}

/* ───────────────────────── filters ── */

const LABELS = { from: 'From', to: 'To', tag: 'Tag', list: 'List', assigned: 'Assigned',
  ...Object.fromEntries(TEXTS.map(([k, l]) => [k, l])), ...Object.fromEntries(SELECTS.map(([k, l]) => [k, l])) };
const labelOf = (k) => LABELS[k] || k;
function valueWord(k, v, meta) {
  const sel = SELECTS.find(([x]) => x === k);
  if (sel) return (sel[2].find(([x]) => x === v) || [v, v])[1];
  if (k === 'list') return meta?.lists?.find((l) => l.id === v)?.name || v;
  if (k === 'assigned') return v === 'me' ? 'Me' : v === 'anyone' ? 'Anyone' : meta?.admins?.find((a) => a.id === v)?.name || v;
  if (k === 'tag') return TAG_WORD(v);
  return v;
}

function FilterDrawer({ params, meta, onClose, onApply }) {
  const [f, setF] = useState(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params[k] || ''])));
  const put = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/20" onClick={onClose}>
      <aside className="rise h-full w-full max-w-md overflow-y-auto border-l border-line bg-white shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-line bg-white px-5 py-3">
          <h2 className="text-base font-semibold text-ink">Filters</h2>
          <button className="btn-quiet !px-3 !py-1.5 text-2xs" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Active from"><input type="date" className="input !py-2" value={f.from} onChange={put('from')} /></Field>
            <Field label="Active to"><input type="date" className="input !py-2" value={f.to} onChange={put('to')} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {TEXTS.map(([k, l, ph]) => (
              <Field key={k} label={l}>
                {k === 'maker' && meta?.makers?.length ? (
                  <select className="input !py-2" value={f.maker} onChange={put('maker')}>
                    <option value="">Any</option>{meta.makers.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : <input className="input !py-2" value={f[k]} onChange={put(k)} placeholder={ph} />}
              </Field>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {SELECTS.map(([k, l, choices]) => (
              <Field key={k} label={l}>
                <select className="input !py-2" value={f[k]} onChange={put(k)}>
                  {choices.map(([v, w]) => <option key={v} value={v}>{w}</option>)}
                </select>
              </Field>
            ))}
            <Field label="Tag">
              <select className="input !py-2" value={f.tag} onChange={put('tag')}>
                <option value="">Any</option>{(meta?.tags || []).map((t) => <option key={t.tag} value={t.tag}>{TAG_WORD(t.tag)} ({t.n})</option>)}
              </select>
            </Field>
            <Field label="Saved list">
              <select className="input !py-2" value={f.list} onChange={put('list')}>
                <option value="">Any</option>{(meta?.lists || []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </Field>
            <Field label="Assigned">
              <select className="input !py-2" value={f.assigned} onChange={put('assigned')}>
                <option value="">Anyone or nobody</option><option value="me">Me</option><option value="anyone">Anyone</option>
                {(meta?.admins || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </div>
          <p className="text-2xs text-muted">Referral filters are left out: GaadiPe has no referral programme for now.</p>
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-shell/80 px-5 py-3 backdrop-blur">
          <button className="btn-quiet" onClick={() => setF(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))}>Clear all</button>
          <button className="btn-primary" onClick={() => onApply(f)}>Apply</button>
        </div>
      </aside>
    </div>
  );
}

function SaveFilterDialog({ onClose, onSave }) {
  const [name, setName] = useState('');
  return (
    <Modal title="Save this filter" subtitle="Saved to your account — it appears as a ★ chip above the table" onClose={onClose}
      footer={<><button className="btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={!name.trim()} onClick={async () => { await onSave(name.trim()); onClose(); }}>Save</button></>}>
      <Field label="Name"><input className="input" autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Karnataka, unpaid, expired PUC" /></Field>
    </Modal>
  );
}

/* ───────────────────────── columns ── */

function ColumnsDialog({ layout, onChange, onClose }) {
  const move = (i, d) => {
    const o = [...layout.order]; const j = i + d;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    onChange({ ...layout, order: o });
  };
  const toggle = (k) => onChange({ ...layout, hidden: layout.hidden.includes(k) ? layout.hidden.filter((x) => x !== k) : [...layout.hidden, k] });
  return (
    <Modal title="Columns" subtitle="Show, hide and order the columns; drag a heading’s edge to resize. Saved to your account." onClose={onClose}
      footer={<><button className="btn-quiet" onClick={() => onChange(DEFAULT_LAYOUT)}>Reset</button><button className="btn-primary" onClick={onClose}>Done</button></>}>
      <div className="max-h-[60vh] space-y-1 overflow-y-auto">
        {layout.order.map((k, i) => {
          const c = COLUMNS.find((x) => x.key === k);
          if (!c) return null;
          return (
            <div key={k} className="flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5">
              <input type="checkbox" checked={!layout.hidden.includes(k)} disabled={c.fixed} onChange={() => toggle(k)} aria-label={`Show ${c.label}`} />
              <span className="flex-1 text-sm">{c.label}</span>
              {layout.widths[k] && <span className="text-2xs text-muted">{layout.widths[k]}px</span>}
              <button className="btn-quiet !px-1.5 !py-0 text-2xs" disabled={!i} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
              <button className="btn-quiet !px-1.5 !py-0 text-2xs" disabled={i === layout.order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
