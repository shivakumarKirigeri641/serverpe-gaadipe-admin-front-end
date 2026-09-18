import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { rupees, count, date } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Table, Hint, Spinner, Failed, Banner, Empty } from '../components/ui.jsx';

/**
 * Revenue, and what is left of it.
 *
 * THE WATERFALL IS THE SCREEN. Gross is the number Razorpay shows and the one
 * everybody quotes; every line under it is money that was never ours — the GST
 * inside a tax-inclusive price, the gateway's fee and the tax on that fee, what
 * the data cost, what was refunded. Net is the last line, and it is the only
 * one worth making a decision on.
 *
 * The GST table is laid out by place of supply because that is how GSTR-1 is
 * filed: Karnataka splits into CGST and SGST, everywhere else is IGST.
 */
const TODAY = () => new Date().toISOString().slice(0, 10);
const AGO = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

export default function Finance() {
  const [from, setFrom] = useState(AGO(30));
  const [to, setTo] = useState(TODAY());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.finance({ from, to })); }
    catch (e) { setError(e); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const preset = (days) => { setFrom(AGO(days)); setTo(TODAY()); };

  return (
    <Shell title="Revenue & GST" subtitle={`${date(from)} to ${date(to)}`}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {[[7, '7d'], [30, '30d'], [90, '90d'], [365, '1y']].map(([d, label]) => (
            <button key={d} className="btn-quiet !px-2.5 !py-1.5 text-2xs" onClick={() => preset(d)}>{label}</button>
          ))}
          <input type="date" className="input !w-auto !py-1.5 text-sm" value={from}
            onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input !w-auto !py-1.5 text-sm" value={to}
            onChange={(e) => setTo(e.target.value)} />
        </div>
      }>

      {error ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Payments" value={count(data.payments)}
              note={`${count(data.abandoned)} link(s) opened but never paid in this period.`} />
            <Tile label="Gross collected" value={rupees(data.gross_paise)}
              note="What customers paid, GST included — the figure Razorpay shows." />
            <Tile label="Take-home" value={rupees(data.take_home_paise)}
              note="After GST is remitted and the gateway is paid, before data costs and refunds." />
            <Tile label="Net" value={rupees(data.net_paise)}
              note="Take-home minus ULIP cost and refunds. The only figure that is really income." />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <div className="border-b border-line px-5 py-3">
                <h2 className="text-sm font-semibold text-ink">Where the money went</h2>
              </div>
              <div className="divide-y divide-line">
                <Row label="Gross collected" value={rupees(data.gross_paise, { decimals: true })}
                  note="Every captured payment in this period, GST included." />
                <Row label="Less GST at 18%" value={`− ${rupees(data.gst_paise, { decimals: true })}`}
                  note="Prices are GST-inclusive, so the tax is backed out of the price rather than added. ₹19 is ₹16.10 + ₹2.90." />
                <Row label={`Less Razorpay fee (${data.fee_percent}%)`}
                  value={`− ${rupees(data.gateway_fee_paise, { decimals: true })}`}
                  note="Estimated from the fee percentage in settings, not read from Razorpay. Correct it there and every figure here follows." />
                <Row label="Less GST on that fee" value={`− ${rupees(data.gateway_fee_gst_paise, { decimals: true })}`} />
                <Row label={`Less WhatsApp messages (₹${(data.whatsapp_rate_paise / 100).toFixed(2)} each)`}
                  value={`− ${rupees(data.whatsapp_cost_paise, { decimals: true })}`}
                  note={`${count(data.whatsapp_messages)} template message(s) sent — payment, delivery and the 28 days of monitoring alerts. Replies inside an open chat are free.`} />
                <Row label={`Less SMS sign-in codes (₹${(data.sms_rate_paise / 100).toFixed(2)} each)`}
                  value={`− ${rupees(data.sms_cost_paise, { decimals: true })}`}
                  note={`${count(data.sms_otps)} code(s) sent — one for every sign-in. Rates are in Settings.`} />
                <Row label="Take-home" value={rupees(data.take_home_paise, { decimals: true })} strong />
                <Row label="Less data cost (ULIP)" value={`− ${rupees(data.ulip.cost_paise, { decimals: true })}`}
                  note={`${count(data.ulip.calls)} live calls and ${count(data.ulip.cache_hits)} served from cache. Free today; priced from settings the day it is not.`} />
                <Row label="Less refunds" value={`− ${rupees(data.refunded_paise, { decimals: true })}`}
                  note={`${count(data.refunds)} refund(s) in this period.`} />
                <Row label="Net" value={rupees(data.net_paise, { decimals: true })} strong />
              </div>
            </div>

            <div className="card">
              <div className="border-b border-line px-5 py-3">
                <h2 className="text-sm font-semibold text-ink">By product</h2>
              </div>
              {data.by_plan.length ? (
                <div className="divide-y divide-line">
                  {data.by_plan.map((p) => (
                    <div key={p.plan_code} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-ink">{p.plan_name}</span>
                        <span className="tabular text-sm font-semibold">{rupees(p.gross_paise)}</span>
                      </div>
                      <div className="mt-0.5 text-2xs text-muted">
                        {count(p.payments)} payment{p.payments === 1 ? '' : 's'} · {p.plan_code}
                      </div>
                    </div>
                  ))}
                </div>
              ) : <Empty>No payments in this period.</Empty>}
            </div>
          </div>

          <div className="card mt-4">
            <div className="border-b border-line px-5 py-3">
              <h2 className="text-sm font-semibold text-ink">GST by place of supply</h2>
              <p className="text-2xs text-muted">
                What a GSTR-1 needs: Karnataka splits into CGST and SGST, everywhere else is IGST.
              </p>
            </div>
            {data.gst_by_state.length ? (
              <Table head={
                <tr>
                  <th className="th">State code</th><th className="th">Invoices</th>
                  <th className="th">Taxable</th><th className="th">CGST</th>
                  <th className="th">SGST</th><th className="th">IGST</th><th className="th">Total</th>
                </tr>
              }>
                {data.gst_by_state.map((g) => (
                  <tr key={g.place_of_supply}>
                    <td className="td tabular">{g.place_of_supply}</td>
                    <td className="td tabular">{count(g.invoices)}</td>
                    <td className="td tabular">{rupees(g.taxable_paise, { decimals: true })}</td>
                    <td className="td tabular">{rupees(g.cgst_paise, { decimals: true })}</td>
                    <td className="td tabular">{rupees(g.sgst_paise, { decimals: true })}</td>
                    <td className="td tabular">{rupees(g.igst_paise, { decimals: true })}</td>
                    <td className="td tabular font-semibold">{rupees(g.total_paise, { decimals: true })}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty>No invoices in this period.</Empty>}
          </div>

          <Banner tone="info" className="mt-4">
            Razorpay's fee here is an estimate from your settings, not a statement from Razorpay.
            Reconcile against their settlement report before filing anything.
          </Banner>
        </>
      )}
    </Shell>
  );
}

const Tile = ({ label, value, note }) => (
  <Hint note={note}>
    <div className="card px-4 py-3">
      <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold text-ink">{value}</div>
    </div>
  </Hint>
);

const Row = ({ label, value, note, strong }) => (
  <div className="flex items-center justify-between px-5 py-2.5">
    <Hint note={note}>
      <span className={`text-sm ${strong ? 'font-semibold text-ink' : 'text-body'} ${note ? 'cursor-help border-b border-dotted border-muted/50' : ''}`}>
        {label}
      </span>
    </Hint>
    <span className={`tabular text-sm ${strong ? 'font-semibold text-ink' : 'text-body'}`}>{value}</span>
  </div>
);
