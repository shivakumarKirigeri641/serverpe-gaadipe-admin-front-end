import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Failed, SkeletonCards, Banner, saveBlob } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { rs, num } from './common.jsx';

/**
 * GST / ACCOUNTING EXPORT (user, 2026-09-25) — the transaction ledger for a
 * day, month, quarter, financial year or any dates, as CSV. The file is the
 * ledger's own rows with a TOTAL line, so it matches Profitability to the
 * paisa. What is in it is shown before it is downloaded; the download is
 * logged.
 */
export default function FinanceExport() {
  const [params, controls, key] = usePeriod('finance-export', { defaultRange: 'this_month', withCompare: false });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setError(null); setD(await api.profitability(params)); } catch (e) { setError(e); } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setD(null); load(); }, [load]);
  const go = async () => {
    setBusy(true);
    try { const { blob, filename } = await api.exportCsv('ledger.csv', params); saveBlob(blob, filename); snack('Export downloaded — logged'); } catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
  };
  const t = d?.totals;
  return (
    <Shell title="GST / Accounting export" subtitle={d ? d.range.label : ' '} actions={controls}>
      {error && !d ? <div className="card"><Failed error={error} onRetry={load} /></div> : !d ? <SkeletonCards n={8} /> : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[['Transactions', num(t.payments), `${t.free_reports} free report(s) also listed`], ['Gross amount', rs(t.gross_paise)], ['GST', rs(t.gst_paise)],
              ['Net amount', rs(t.gross_paise - t.gst_paise)], ['Gateway fee + GST', rs(t.gateway_paise)], ['Refunds', rs(t.refund_paise)],
              ['API cost', rs(t.api_cost_paise)], ['Transactions’ net contribution', rs(t.transactions_net_paise)]].map(([l, v, s]) => (
              <div key={l} className="card px-4 py-3"><div className="text-2xs font-semibold uppercase tracking-wider text-muted">{l}</div>
                <div className="tabular mt-1 text-xl font-semibold text-ink">{v}</div>{s && <div className="text-2xs text-muted">{s}</div>}</div>
            ))}
          </div>
          <div className="card p-4">
            <p className="text-sm text-body">
              One row per transaction: transaction and gateway IDs, invoice, date (IST), customer, vehicle, gross, GST, net, gateway fee, gateway GST,
              API cost, WhatsApp cost, refund and net contribution — with a TOTAL line. {t.fees_estimated ? `${t.fees_estimated} fee(s) are estimated and marked so.` : ''}
            </p>
            <p className="mt-1 text-2xs text-muted">Customer numbers are masked unless your role may see them. Referral rewards: none (no referral programme). The download is written to the audit log.</p>
            <button className="btn-primary mt-3" onClick={go} disabled={busy}>{busy ? 'Preparing…' : `Download CSV — ${d.range.label}`}</button>
          </div>
          {t.fees_estimated > 0 && <Banner tone="watch">Some gateway fees are estimates: Razorpay had not reported them when these payments were recorded.</Banner>}
        </div>
      )}
    </Shell>
  );
}
