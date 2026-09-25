import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Chip, Failed, Skeleton, SkeletonCards, Empty, Table, Pager, Modal, Hint, saveBlob } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { dateTime } from '../../lib/format';
import { rs, num, NO_DATA } from './common.jsx';

/**
 * PROFITABILITY (user, 2026-09-25): what each report earns after GST, the
 * gateway, the records API and messaging — as totals, over time, by source,
 * campaign and channel, and payment by payment. Every figure is the ledger's
 * (src/finance/ledger.js on the server); none is worked out here.
 */

const TABS = [['overview', 'Overview'], ['transactions', 'Transaction profitability']];

export default function Profitability() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'transactions' ? 'transactions' : 'overview';
  const [params, controls, key] = usePeriod('profit', { defaultRange: sp.get('range') || '30d', withCompare: false });
  const { can } = useSession();
  const download = async () => {
    try { const { blob, filename } = await api.exportCsv('ledger.csv', params); saveBlob(blob, filename); snack('Ledger exported'); } catch (e) { snack(e.message, 'wrong'); }
  };
  return (
    <Shell title="Profitability" subtitle="From the transaction ledger" actions={<>{controls}
      {allowed(can, 'finance.export') && <button className="btn-quiet !py-1.5 text-2xs" onClick={download}>Export CSV</button>}</>}
      tabs={<nav className="flex gap-1">{TABS.map(([k, l]) => (
        <button key={k} onClick={() => setSp({ tab: k })} className={`border-b-2 px-3 py-2.5 text-sm ${tab === k ? 'border-brand font-semibold text-brand-deep' : 'border-transparent text-body hover:text-ink'}`}>{l}</button>
      ))}</nav>}>
      {tab === 'overview' ? <Overview params={params} pkey={key} /> : <Transactions params={params} pkey={key} />}
    </Shell>
  );
}

function Overview({ params, pkey }) {
  const [grain, setGrain] = useState('');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [by, setBy] = useState('by_source');
  const load = useCallback(async () => { try { setError(null); setD(await api.profitability({ ...params, grain: grain || undefined })); } catch (e) { setError(e); } }, [pkey, grain]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setD(null); load(); }, [load]);
  if (error && !d) return <div className="card"><Failed error={error} onRetry={load} /></div>;
  if (!d) return <SkeletonCards n={8} />;
  const t = d.totals;
  const tile = (label, v, note, tone) => (
    <Hint note={note}><div className="card px-4 py-3"><div className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className={`tabular mt-1 text-xl font-semibold ${tone || 'text-ink'}`}>{v}</div></div></Hint>
  );
  const chart = d.series.map((s) => ({ name: s.key, Revenue: s.revenue_paise / 100, Costs: s.costs_paise / 100, Net: s.net_paise / 100, Margin: s.margin_pct }));
  const GROUPS = [['by_source', 'Source'], ['by_campaign', 'Campaign'], ['by_channel', 'WhatsApp / website'], ['by_kind', 'Paid / free']];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        {tile('Gross revenue', rs(t.gross_paise), 'What customers paid, GST included.')}
        {tile('GST', rs(t.gst_paise), 'Output GST inside revenue — from the tax invoices.')}
        {tile('Net revenue', rs(t.net_revenue_paise), 'Revenue less GST and refunds.')}
        {tile('Gateway', rs(t.gateway_paise), 'Razorpay fee and its GST — actual where Razorpay gave it.')}
        {tile('API cost', rs(t.api_cost_paise), 'Every records-API call in the period.')}
        {tile('Messaging', rs(t.messaging_paise), 'WhatsApp business messages and sign-in SMS.')}
        {tile('Net contribution', rs(t.net_paise), 'Net revenue less every cost above.', t.net_paise < 0 ? 'text-wrong-700' : 'text-good-700')}
        {tile('Margin', t.margin_pct == null ? '—' : `${t.margin_pct}%`, 'Net contribution ÷ net revenue.')}
      </div>
      <div className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Revenue, costs and net — by {d.grain}</h2>
          <select className="input !w-auto !py-1 text-sm" value={grain} onChange={(e) => setGrain(e.target.value)}>
            <option value="">Automatic</option><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option>
          </select>
        </div>
        {!chart.length ? <Empty>No data available for this period.</Empty> : (
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={chart} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3ecea" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="rs" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[-100, 100]} />
                <Tooltip formatter={(v, n) => (n === 'Margin' ? `${v ?? '—'}%` : `₹${Number(v).toFixed(2)}`)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="rs" dataKey="Revenue" fill="#0f766e" radius={[3, 3, 0, 0]} />
                <Bar yAxisId="rs" dataKey="Costs" fill="#e08700" radius={[3, 3, 0, 0]} />
                <Line yAxisId="rs" type="monotone" dataKey="Net" stroke="#0b1f1c" strokeWidth={2} dot={false} />
                <Line yAxisId="pct" type="monotone" dataKey="Margin" stroke="#12a150" strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-1 border-b border-line px-4 py-2">
          <span className="mr-2 text-sm font-semibold text-ink">By</span>
          {GROUPS.map(([k, l]) => <button key={k} onClick={() => setBy(k)} className={`chip border ${by === k ? 'border-brand bg-brand text-white' : 'border-line bg-white text-body'}`}>{l}</button>)}
        </div>
        {!d[by].length ? <Empty>No data available.</Empty> : (
          <Table head={<tr>{['', 'Payments', 'Revenue', 'GST', 'Gateway', 'API', 'WhatsApp', 'Refunds', 'Net contribution', 'Margin'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
            {d[by].map((g) => (
              <tr key={g.key}>
                <td className="td font-semibold text-ink">{g.label}</td><td className="td tabular">{num(g.payments)}{g.free ? <span className="text-2xs text-muted"> +{g.free} free</span> : null}</td>
                <td className="td tabular">{rs(g.revenue_paise)}</td><td className="td tabular">{rs(g.gst_paise)}</td><td className="td tabular">{rs(g.gateway_paise)}</td>
                <td className="td tabular">{rs(g.api_cost_paise)}</td><td className="td tabular">{rs(g.whatsapp_cost_paise)}</td><td className="td tabular">{rs(g.refund_paise)}</td>
                <td className={`td tabular font-semibold ${g.net_paise < 0 ? 'text-wrong-700' : 'text-ink'}`}>{rs(g.net_paise)}</td><td className="td tabular">{g.margin_pct == null ? '—' : `${g.margin_pct}%`}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <div className="space-y-1 text-2xs text-muted">
        <p>Transactions’ own net: {rs(t.transactions_net_paise)} · costs no payment explains (lookups that did not sell, other messages, sign-in SMS): {rs(t.unattributed_cost_paise)} · business net: {rs(t.net_paise)}.</p>
        <p>{d.notes.whatsapp}</p>{d.notes.fees && <p>{d.notes.fees}</p>}<p>{d.notes.referral} Ad spend is not recorded, so there is no CAC or ROAS.</p>
      </div>
    </div>
  );
}

const SIZE = 50;

function Transactions({ params, pkey }) {
  const [f, setF] = useState({ q: '', kind: '', channel: '', source: '', fee: '', loss: '', sort: 'date', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(async () => {
    try { setError(null); setD(await api.transactions({ ...params, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), limit: SIZE, offset: (page - 1) * SIZE })); } catch (e) { setError(e); }
  }, [pkey, f, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);
  useEffect(() => { setPage(1); }, [pkey, f]);
  const put = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const sortBy = (k) => setF((x) => ({ ...x, sort: k, dir: x.sort === k && x.dir === 'desc' ? 'asc' : 'desc' }));
  const th = (k, l) => <th className="th cursor-pointer hover:text-ink" onClick={() => sortBy(k)}>{l}{f.sort === k ? (f.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>;
  return (
    <>
      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <input className="input !w-64 !py-1.5" value={f.q} onChange={put('q')} placeholder="Payment / order / invoice ID, vehicle, phone" />
        <select className="input !w-auto !py-1.5 text-sm" value={f.kind} onChange={put('kind')}><option value="">Paid and free</option><option value="paid">Paid</option><option value="free">Free reports</option></select>
        <select className="input !w-auto !py-1.5 text-sm" value={f.channel} onChange={put('channel')}><option value="">Any channel</option><option value="whatsapp">WhatsApp</option><option value="website">Website</option></select>
        <select className="input !w-auto !py-1.5 text-sm" value={f.source} onChange={put('source')}><option value="">Any source</option>{(d?.sources || []).map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select className="input !w-auto !py-1.5 text-sm" value={f.fee} onChange={put('fee')}><option value="">Any fee</option><option value="estimated">Estimated fee only</option></select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.loss === '1'} onChange={(e) => setF((x) => ({ ...x, loss: e.target.checked ? '1' : '' }))} /> Loss-making</label>
      </div>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={8} /> : !d.rows.length ? <Empty>No transaction matches.</Empty> : (
          <>
            <Table head={<tr><th className="th">Transaction</th>{th('date', 'Date')}<th className="th">Customer</th><th className="th">Vehicle</th><th className="th">Source · campaign</th>
              {th('gross', 'Gross')}<th className="th">GST</th>{th('fee', 'Gateway + GST')}{th('api', 'API')}<th className="th">WhatsApp</th><th className="th">Refund</th>{th('net', 'Net')}{th('margin', 'Margin')}<th className="th">Status</th></tr>}>
              {d.rows.map((x) => (
                <tr key={x.id} className="cursor-pointer hover:bg-shell/60" onClick={() => setOpen(x.id)}>
                  <td className="td font-mono text-2xs">#{x.id}<div className="text-muted">{x.payment_id || x.gateway}</div></td>
                  <td className="td whitespace-nowrap">{dateTime(x.paid_at || x.created_at)}</td>
                  <td className="td font-mono">{x.mobile || '—'}</td>
                  <td className="td font-mono">{x.reg_no ? <Link onClick={(e) => e.stopPropagation()} className="text-brand-deep hover:underline" to={`/vehicles/${x.reg_no}`}>{x.reg_no}</Link> : '—'}</td>
                  <td className="td">{x.source}{x.campaign ? <span className="text-2xs text-muted"> · {x.campaign}</span> : null}<div className="text-2xs text-muted">{x.channel}</div></td>
                  <td className="td tabular">{rs(x.gross_paise)}</td><td className="td tabular text-muted">−{rs(x.gst_paise)}</td>
                  <td className="td tabular text-muted">−{rs(x.gateway_fee_paise + x.gateway_gst_paise)}{x.fee_source === 'estimated' && <Hint note="Estimated — Razorpay has not given the fee"><span className="ml-1 text-watch-700">≈</span></Hint>}</td>
                  <td className="td tabular text-muted">−{rs(x.api_cost_paise)}</td><td className="td tabular text-muted">−{rs(x.whatsapp_cost_paise)}</td>
                  <td className="td tabular text-muted">{x.refund_paise ? `−${rs(x.refund_paise)}` : '—'}</td>
                  <td className={`td tabular font-semibold ${x.net_paise < 0 ? 'text-wrong-700' : 'text-ink'}`}>{rs(x.net_paise)}</td>
                  <td className="td tabular">{x.margin_pct == null ? '—' : `${x.margin_pct}%`}</td>
                  <td className="td"><Chip tone={x.kind === 'free' ? 'info' : x.status === 'refunded' ? 'watch' : 'good'}>{x.kind === 'free' ? 'Free' : x.status}</Chip></td>
                </tr>
              ))}
            </Table>
            <div className="flex flex-wrap gap-x-4 border-t border-line bg-shell/40 px-4 py-2 text-2xs text-body">
              <b>{num(d.total)} transactions</b><span>Gross {rs(d.totals.gross_paise)}</span><span>GST {rs(d.totals.gst_paise)}</span>
              <span>Gateway {rs(d.totals.gateway_paise)}</span><span>API {rs(d.totals.api_cost_paise)}</span><span>WhatsApp {rs(d.totals.whatsapp_cost_paise)}</span>
              <span className="font-semibold">Net {rs(d.totals.net_paise)}</span>
            </div>
            <Pager page={page} total={d.total} size={SIZE} onPage={setPage} />
          </>
        )}
      </div>
      {open && <TransactionModal id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function TransactionModal({ id, onClose }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.transaction(id).then(setD).catch(setError); }, [id]);
  const e = d?.ledger;
  const line = (label, v, sub, strong) => (
    <div className={`flex items-baseline justify-between gap-3 py-0.5 ${strong ? 'border-t border-line pt-1.5 font-semibold text-ink' : 'text-body'}`}>
      <span className="text-sm">{label}{sub && <span className="block text-2xs font-normal text-muted">{sub}</span>}</span><span className="tabular text-sm">{v}</span>
    </div>
  );
  return (
    <Modal wide title={`Transaction #${id}`} subtitle={e ? `${dateTime(e.paid_at || e.created_at)} · ${e.kind === 'free' ? 'free report' : e.status}` : ' '} onClose={onClose}>
      {error ? <Failed error={error} /> : !d ? <Skeleton rows={6} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-line p-3">
            <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Where the money went</div>
            {line('Gross customer payment', rs(e.gross_paise))}
            {line('GST', `−${rs(e.gst_paise)}`, d.rules.gst)}
            {line('Net sales value', rs(e.net_sales_paise), null, true)}
            {line('Gateway fee', `−${rs(e.gateway_fee_paise)}`, d.rules.fee)}
            {line('GST on gateway fee', `−${rs(e.gateway_gst_paise)}`)}
            {line('Vehicle API cost', `−${rs(e.api_cost_paise)}`, `${e.api_calls} call(s). ${d.rules.api}`)}
            {line('WhatsApp cost', `−${rs(e.whatsapp_cost_paise)}`, `${e.whatsapp_templates} message(s). ${d.rules.whatsapp}`)}
            {line('Refund', e.refund_paise ? `−${rs(e.refund_paise)}` : '—')}
            {line('Referral reward', '—', 'No referral programme for now.')}
            {line('Net contribution', rs(e.net_paise), e.margin_pct == null ? null : `${e.margin_pct}% of net revenue`, true)}
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-line p-3 text-sm">
              <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Payment</div>
              {[['Gateway payment ID', d.payment.payment_id], ['Order ID', d.payment.order_id], ['Plan', d.payment.plan], ['Method', d.payment.method],
                ['Gateway status', d.payment.gateway_status], ['Invoice', d.invoice?.invoice_number], ['Report', d.report?.report_number],
                ['Customer', e.mobile], ['Vehicle', e.reg_no], ['First touch', e.first_touch ? [e.first_touch.source, e.first_touch.campaign].filter(Boolean).join(' · ') : 'Direct (no website visit)'],
                ['Last touch', e.last_touch ? [e.last_touch.source, e.last_touch.campaign].filter(Boolean).join(' · ') : '—'], ['Conversion channel', e.channel]]
                .map(([k, v]) => <div key={k} className="flex justify-between gap-2 py-0.5"><span className="text-2xs text-muted">{k}</span><span className="text-right font-mono text-2xs">{v || NO_DATA}</span></div>)}
            </div>
            <div className="flex flex-wrap gap-2">
              {e.reg_no && <Link className="btn-quiet !py-1 text-2xs" to={`/vehicles/${e.reg_no}#payments`}>Vehicle</Link>}
              {e.user_id && <Link className="btn-quiet !py-1 text-2xs" to={`/journey?user=${e.user_id}`}>Customer journey</Link>}
              {e.reg_no && <Link className="btn-quiet !py-1 text-2xs" to={`/vehicles/${e.reg_no}#api`}>API calls</Link>}
              {e.reg_no && <Link className="btn-quiet !py-1 text-2xs" to={`/vehicles/${e.reg_no}#whatsapp`}>WhatsApp conversation</Link>}
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">What happened around it ({d.events.length})</div>
            <ol className="max-h-56 space-y-0.5 overflow-y-auto border-l border-line pl-3 text-2xs">
              {d.events.map((x) => <li key={x.id}><span className="tabular text-muted">{dateTime(x.occurred_at)}</span> · {x.name.replace(/_/g, ' ')}{x.status ? ` · ${x.status}` : ''}{x.amount_paise ? ` · ${rs(x.amount_paise)}` : ''}</li>)}
            </ol>
          </div>
        </div>
      )}
    </Modal>
  );
}
