import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { rupees, date, dateTime, plate, count, mobile as fmtMobile, daysTo } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Table, Chip, Hint, Empty, Spinner, Failed, saveBlob, openBlob } from '../components/ui.jsx';
import { useSession, allowed } from '../lib/session';

/**
 * Every report and every invoice, in one place.
 *
 * VIEW OPENS, SAVE DOWNLOADS, AND PRINT IS THE BROWSER'S OWN: a PDF opened in a
 * tab already prints properly, and a print button that re-renders the document
 * in HTML would produce a second, subtly different version of a numbered
 * document — the one thing a numbered document must never have.
 */
export default function Documents() {
  const { can } = useSession();
  const [tab, setTab] = useState('reports');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const isReports = tab === 'reports';

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await (isReports ? api.reports({ q, limit: 100 }) : api.invoices({ q, limit: 100 })));
    } catch (e) { setError(e); }
  }, [isReports, q]);

  useEffect(() => {
    setData(null);
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const get = async (id, download) => {
    setBusy(id);
    try {
      const { blob, filename } = isReports
        ? await api.reportPdf(id, download) : await api.invoicePdf(id, download);
      download ? saveBlob(blob, filename) : openBlob(blob);
    } catch (e) { window.alert(e.message); } finally { setBusy(null); }
  };

  return (
    <Shell title="Reports & invoices"
      subtitle={data ? `${count(data.total)} ${isReports ? 'reports' : 'invoices'}` : ' '}
      actions={
        <input className="input !w-56 !py-1.5 text-sm"
          placeholder={isReports ? 'Number, plate or mobile' : 'Number, name or mobile'}
          value={q} onChange={(e) => setQ(e.target.value)} />
      }>

      <div className="mb-4 flex gap-1 border-b border-line">
        {[['reports', 'Reports'], ...(allowed(can, 'money') ? [['invoices', 'Invoices']] : [])]
          .map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setQ(''); }}
              className={`-mb-px border-b-2 px-4 py-2 text-sm ${
                tab === key ? 'border-brand font-semibold text-brand-deep' : 'border-transparent text-muted hover:text-body'}`}>
              {label}
            </button>
          ))}
      </div>

      <div className="card">
        {error ? <Failed error={error} onRetry={load} />
          : !data ? <Spinner />
          : !data.rows.length ? <Empty>Nothing here yet.</Empty>
          : isReports ? (
            <Table head={
              <tr>
                <th className="th">Report</th><th className="th">Vehicle</th>
                <th className="th">Customer</th><th className="th">Issued</th>
                <th className="th">Download until</th><th className="th">Requested from</th>
                <th className="th"></th>
              </tr>
            }>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="td font-mono text-2xs">{r.report_number}</td>
                  <td className="td"><span className="plate">{plate(r.reg_no)}</span></td>
                  <td className="td tabular text-2xs">{fmtMobile(r.requested_by || r.mobile)}</td>
                  <td className="td text-2xs text-muted">{dateTime(r.created_at)}</td>
                  <td className="td">
                    {r.valid_until
                      ? <Chip tone={daysTo(r.valid_until) >= 0 ? 'good' : 'info'}>{date(r.valid_until)}</Chip>
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="td text-2xs">
                    <Hint note={`IP ${r.ip || 'unknown'} · channel ${r.channel}`}>
                      <span className="border-b border-dotted border-muted/40">{r.device || r.channel}</span>
                    </Hint>
                  </td>
                  <td className="td">
                    <Buttons busy={busy === r.id} disabled={!r.has_pdf}
                      onView={() => get(r.id, false)} onSave={() => get(r.id, true)} />
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Table head={
              <tr>
                <th className="th">Invoice</th><th className="th">Date</th>
                <th className="th">Customer</th><th className="th">Vehicle</th>
                <th className="th">Taxable</th><th className="th">GST</th>
                <th className="th">Total</th><th className="th"></th>
              </tr>
            }>
              {data.rows.map((i) => (
                <tr key={i.id}>
                  <td className="td font-mono text-2xs">{i.invoice_number}</td>
                  <td className="td text-2xs text-muted">{date(i.invoice_date)}</td>
                  <td className="td">
                    <div className="text-ink">{i.buyer_name || '—'}</div>
                    <div className="tabular text-2xs text-muted">{fmtMobile(i.mobile)}</div>
                  </td>
                  <td className="td"><span className="plate">{plate(i.reg_no)}</span></td>
                  <td className="td tabular">{rupees(i.base_paise, { decimals: true })}</td>
                  <td className="td tabular">
                    <Hint note={i.igst_paise
                      ? `IGST ${rupees(i.igst_paise, { decimals: true })} · place of supply ${i.place_of_supply}`
                      : `CGST ${rupees(i.cgst_paise, { decimals: true })} + SGST ${rupees(i.sgst_paise, { decimals: true })} · Karnataka`}>
                      <span className="border-b border-dotted border-muted/40">
                        {rupees(i.total_paise - i.base_paise, { decimals: true })}
                      </span>
                    </Hint>
                  </td>
                  <td className="td tabular font-semibold">{rupees(i.total_paise, { decimals: true })}</td>
                  <td className="td">
                    <Buttons busy={busy === i.id} disabled={!i.has_pdf}
                      onView={() => get(i.id, false)} onSave={() => get(i.id, true)} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </div>

      <p className="mt-3 text-2xs text-muted">
        Opening a document is recorded in the audit trail. Print from the opened PDF —
        it is the same file the customer received.
      </p>
    </Shell>
  );
}

const Buttons = ({ onView, onSave, disabled, busy }) => (
  <div className="flex gap-1.5">
    <button className="btn-quiet !px-2.5 !py-1 text-2xs" disabled={disabled || busy} onClick={onView}>
      {busy ? '…' : 'View'}
    </button>
    <button className="btn-quiet !px-2.5 !py-1 text-2xs" disabled={disabled || busy} onClick={onSave}>Save</button>
  </div>
);
