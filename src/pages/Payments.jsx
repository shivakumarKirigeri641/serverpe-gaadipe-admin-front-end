import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../lib/api';
import Shell from '../components/Shell.jsx';
import { usePeriod } from '../components/Period.jsx';
import { Hint, Failed, SkeletonCards, Empty, Table, Chip, Modal, Pager, PAGE_SIZE, saveBlob } from '../components/ui.jsx';
import { count, dateTime, mobile as fmtMobile } from '../lib/format';

/**
 * PAYMENTS (user, 2026-09-25, command center phase 5).
 *
 * Every payment, and what each one left after GST, the gateway and the records
 * calls behind it; success and failure rates; revenue over time and by where
 * customers came from. The split is the server's (the same rates as Revenue &
 * GST); this screen only shows it. Tap a payment for its whole story.
 */

const AXIS = { fontSize: 11, fill: '#6b8380' };
const TOOLTIP = { fontSize: 12, borderRadius: 8, border: '1px solid #e3ecea' };
const inr = (p) => (p == null ? '—' : `₹${(Number(p) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const STATUSES = [['', 'Every status'], ['paid', 'Success'], ['pending', 'Pending'], ['not_completed', 'Not completed'], ['failed', 'Failed'], ['refunded', 'Refunded']];
const TONE = { Success: 'good', Pending: 'watch', 'Not completed': 'info', Failed: 'wrong', Refunded: 'watch' };

export default function Payments() {
  const navigate = useNavigate();
  const [params, controls, key] = usePeriod('payments', { defaultRange: '30d', withCompare: false });
  const [grain, setGrain] = useState('day');
  const [sum, setSum] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);

  const loadSum = useCallback(async () => {
    try { setSum(await api.paymentsSummary({ ...params, grain })); setError(null); } catch (e) { setError(e); }
  }, [key, grain]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadRows = useCallback(async () => {
    try { setRows(await api.payments({ ...params, status: status || undefined, q: q || undefined, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })); }
    catch (e) { setError(e); }
  }, [key, status, q, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadSum(); }, [loadSum]);
  useEffect(() => { setPage(1); }, [key, status, q]);
  useEffect(() => { const t = setTimeout(loadRows, q ? 300 : 0); return () => clearTimeout(t); }, [loadRows, q]);

  const t = sum?.totals;
  const exportCsv = async () => {
    try {
      const day = (d) => new Date(new Date(d).getTime() + 330 * 60000).toISOString().slice(0, 10);
      const { blob, filename } = await api.exportCsv('payments', { from: day(sum.range.from), to: day(new Date(sum.range.to) - 1) });
      saveBlob(blob, filename);
    } catch (e) { alert(e.message || 'Export failed.'); }
  };

  return (
    <Shell title="Payments" subtitle={sum ? sum.range.label : ' '}
      actions={<>{controls}<button className="btn-quiet !py-1.5 text-2xs" disabled={!sum} onClick={exportCsv}>Export CSV</button></>}>
      {error && !sum ? <Failed error={error} onRetry={loadSum} /> : !sum ? <SkeletonCards n={8} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Box label="Gross" v={inr(t.gross_paise)} sub={`${count(t.paid)} paid`} note="What customers paid, GST included." />
            <Box label="Net contribution" v={inr(t.net_paise)} note="After GST, the gateway fee and its GST, WhatsApp messaging and the records API — the same as the Command Center." />
            <Box label="Success rate" v={t.success_pct == null ? 'No data' : `${t.success_pct}%`} sub={`${count(t.started_paid)} of ${count(t.started)} started`} note="Of the payments started in the period, how many were paid." />
            <Box label="Failure rate" v={t.failure_pct == null ? 'No data' : `${t.failure_pct}%`} sub={`${count(t.failed)} with a failed attempt`} bad={t.failed > 0} note="Payments where Razorpay reported at least one failed attempt (payment.failed)." />
            <Box label="Not completed" v={count(t.not_completed)} note="Started, not paid, and older than 30 minutes." />
            <Box label="Refunded" v={count(t.refunded)} sub={inr(t.refunded_paise)} note="Refunds processed in the period." />
            <Box label="Per paying customer" v={inr(t.arpu_paise)} sub={`${count(t.payers)} customer${t.payers === 1 ? '' : 's'}`} note="Gross divided by the customers who paid." />
            <Box label="GST · gateway · API" v={inr(t.gst_paise)} sub={`${inr(t.gateway_paise)} gateway · ${inr(t.api_cost_paise)} API`} note="GST inside the price, the gateway fee with its GST, and the records API cost." />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3">
            <div className="card p-4 xl:col-span-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">Revenue</h2>
                <div className="flex gap-1">
                  {['day', 'week', 'month'].map((g) => (
                    <button key={g} onClick={() => setGrain(g)}
                      className={`rounded-full border px-2.5 py-0.5 text-2xs ${grain === g ? 'border-brand bg-brand text-white' : 'border-line text-body'}`}>
                      By {g}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 h-52">
                {!sum.series.length ? <Empty>No payments in this period.</Empty> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sum.series.map((s) => ({ ...s, rupees: s.gross_paise / 100 }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef3f2" vertical={false} />
                      <XAxis dataKey="label" tick={AXIS} />
                      <YAxis tick={AXIS} />
                      <Tooltip contentStyle={TOOLTIP} formatter={(v, n) => (n === 'Revenue' ? `₹${v}` : v)} />
                      <Bar dataKey="rupees" name="Revenue" fill="#0d9488" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div className="card p-4">
              <Hint note="Where each paying customer first came from: a website visit's source, a WhatsApp ad, or straight to the number.">
                <h2 className="text-sm font-semibold text-ink">Revenue by source</h2>
              </Hint>
              {!sum.by_source.length ? <p className="mt-2 text-2xs text-muted">No data</p> : (
                <ul className="mt-2 space-y-1.5">
                  {sum.by_source.map((s) => (
                    <li key={s.source} className="flex justify-between text-sm">
                      <span className="text-body">{String(s.source).replace(/_/g, ' ')}</span>
                      <span className="tabular text-ink">{inr(s.gross_paise)} <span className="text-2xs text-muted">· {count(s.payments)}</span></span>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mt-4 text-2xs font-semibold uppercase tracking-wider text-muted">Method</h3>
              <ul className="mt-1 space-y-1">
                {sum.by_method.map((m) => (
                  <li key={m.method} className="flex justify-between text-2xs">
                    <Hint note={m.method === 'not recorded' ? 'Payments before the method was recorded (25 Sep 2026).' : null}>
                      <span className="text-body">{m.method}</span>
                    </Hint>
                    <span className="tabular text-ink">{count(m.payments)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}

      <div className="card mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Transactions {rows ? <span className="font-normal text-muted">· {count(rows.total)}</span> : null}</h2>
          <div className="flex gap-2">
            <input className="input !w-56 !py-1.5 text-sm" placeholder="Mobile, plate, order or payment id" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input !w-auto !py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        {!rows ? <div className="p-4 text-sm text-muted">Loading…</div> : !rows.rows.length ? <Empty>No payments match.</Empty> : (
          <>
            <Table head={<tr>{['When', 'Customer', 'Vehicle', 'Amount', 'GST', 'Gateway', 'API', 'Net', 'Status', 'Source'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
              {rows.rows.map((p) => (
                <tr key={p.id} className="cursor-pointer hover:bg-shell/70" onClick={() => setOpenId(p.id)}>
                  <td className="td tabular text-2xs text-muted">{dateTime(p.paid_at || p.created_at)}</td>
                  <td className="td text-2xs">{p.person_name && <div className="font-semibold text-ink">{p.person_name}</div>}<div className="text-muted">{p.mobile ? fmtMobile(p.mobile) : '—'}</div></td>
                  <td className="td tabular text-2xs">{p.reg_no || '—'}</td>
                  <td className="td tabular text-sm">{inr(p.amount_paise)}</td>
                  <td className="td tabular text-2xs text-muted">{p.status === 'paid' ? inr(p.gst_paise) : '—'}</td>
                  <td className="td tabular text-2xs text-muted">{p.status === 'paid' ? inr(p.gateway_paise) : '—'}</td>
                  <td className="td tabular text-2xs text-muted">{inr(p.api_cost_paise)}</td>
                  <td className="td tabular text-sm font-semibold text-ink">{p.status === 'paid' ? inr(p.net_paise) : '—'}</td>
                  <td className="td"><Chip tone={TONE[p.status_label]}>{p.status_label}</Chip></td>
                  <td className="td text-2xs">{String(p.source || '—').replace(/_/g, ' ')}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={rows.total} onPage={setPage} />
          </>
        )}
      </div>

      {openId && <PaymentDrawer id={openId} onClose={() => setOpenId(null)} onJourney={(m) => navigate(`/journey?mobile=${m}`)} />}
    </Shell>
  );
}

function Box({ label, v, sub, note, bad = false }) {
  return (
    <Hint note={note} className="block">
      <div className="card p-3">
        <div className="text-2xs uppercase tracking-wider text-muted">{label}</div>
        <div className={`tabular mt-1 text-lg font-bold ${bad ? 'text-wrong-700' : 'text-ink'}`}>{v}</div>
        {sub && <div className="text-2xs text-muted">{sub}</div>}
      </div>
    </Hint>
  );
}

/* One payment's whole story: the split, the ids, what happened, in order. */
function PaymentDrawer({ id, onClose, onJourney }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.payment(id).then(setP).catch(setError); }, [id]);
  const row = (k, v) => (v == null || v === '' ? null : (
    <div className="flex justify-between gap-3 py-1 text-sm"><span className="text-muted">{k}</span><span className="text-right text-ink">{v}</span></div>
  ));
  return (
    <Modal wide title={`Payment ${id}`} subtitle={p ? `${p.status_label} · ${dateTime(p.paid_at || p.created_at)}` : 'Loading…'} onClose={onClose}>
      {error ? <Failed error={error} /> : !p ? <div className="p-4 text-sm text-muted">Loading…</div> : (
        <div className="grid gap-4 p-1 md:grid-cols-2">
          <div>
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted">The money</h3>
            {row('Amount', inr(p.amount_paise))}
            {p.status === 'paid' && row('− GST', inr(p.gst_paise))}
            {p.status === 'paid' && row('− Gateway fee + GST', inr(p.gateway_paise))}
            {row('− Records API (lookups for this vehicle, day before)', inr(p.api_cost_paise))}
            {p.status === 'paid' && <div className="mt-1 flex justify-between border-t border-line pt-1 text-sm font-semibold"><span>Net contribution</span><span>{inr(p.net_paise)}</span></div>}
            <h3 className="mt-4 text-2xs font-semibold uppercase tracking-wider text-muted">Who and what</h3>
            {row('Customer', p.person_name)}
            {row('Mobile', p.mobile ? fmtMobile(p.mobile) : null)}
            {row('Vehicle', p.reg_no)}
            {row('Plan', p.plan_code)}
            {row('Came from', p.source && String(p.source).replace(/_/g, ' '))}
            {row('Method', p.method || 'Not recorded')}
            {row('Report', p.report ? `${p.report.report_number} · valid until ${dateTime(p.report.valid_until)}` : null)}
            {row('Invoice', p.invoice?.invoice_number)}
            {p.mobile && <button className="btn-quiet mt-3 !py-1.5 text-2xs" onClick={() => onJourney(p.mobile)}>Open this customer's journey →</button>}
          </div>
          <div>
            <h3 className="text-2xs font-semibold uppercase tracking-wider text-muted">Razorpay</h3>
            {row('Order', p.order_id)}
            {row('Payment id', p.razorpay_payment_id)}
            {row('Refund id', p.refund_id)}
            <h3 className="mt-4 text-2xs font-semibold uppercase tracking-wider text-muted">What happened</h3>
            <ul className="mt-1 space-y-1 text-2xs">
              {[...p.events.map((e) => ({ at: e.occurred_at, what: e.name.replace(/_/g, ' '), bad: e.status === 'failed' })),
                ...p.webhooks.map((w) => ({ at: w.created_at, what: `Razorpay webhook: ${w.event}${w.status ? ` (${w.status})` : ''}`, bad: /failed/.test(w.event) }))]
                .sort((a, b) => new Date(a.at) - new Date(b.at))
                .map((x, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="tabular shrink-0 text-muted">{dateTime(x.at)}</span>
                    <span className={x.bad ? 'text-wrong-700' : 'text-ink'}>{x.what}</span>
                  </li>
                ))}
              {!p.events.length && !p.webhooks.length && <li className="text-muted">No events recorded for this payment.</li>}
            </ul>
          </div>
        </div>
      )}
    </Modal>
  );
}
