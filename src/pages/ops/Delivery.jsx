import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Failed, Skeleton, Empty, Table, Chip, Banner } from '../../components/ui.jsx';
import { dateTime } from '../../lib/format';

/**
 * REPORT DELIVERY STATUS (user, 2026-09-25) — did each report reach the
 * customer: as a PDF on WhatsApp, as a link only, failed, downloaded on the
 * website — and which paid reports have not been generated at all.
 */
const STATE = { delivered: ['Delivered (PDF)', 'good'], link_only: ['Link only', 'watch'], failed: ['Failed', 'wrong'], downloaded: ['Website download', 'info'], not_recorded: ['Not recorded', 'info'] };

export default function Delivery() {
  const [params, controls, key] = usePeriod('delivery', { defaultRange: '7d', withCompare: false });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.reportDelivery(params)); } catch (e) { setError(e); } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setD(null); load(); }, [load]);
  const t = d?.totals;
  return (
    <Shell title="Report delivery" subtitle={d?.range.label || ' '} actions={controls}>
      {error && !d ? <div className="card"><Failed error={error} onRetry={load} /></div> : !d ? <div className="card"><Skeleton rows={6} /></div> : (
        <div className="space-y-4">
          {t.paid_without_report > 0 && <Banner tone="wrong"><b>{t.paid_without_report} paid report(s) not generated.</b> The customer paid and has nothing yet.</Banner>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[['Generated', t.generated], ['Delivered (PDF)', t.delivered], ['Link only', t.link_only], ['Failed', t.failed], ['Website download', t.downloaded], ['Not recorded', t.not_recorded]].map(([l, v]) => (
              <div key={l} className="card px-3 py-2"><div className="text-2xs text-muted">{l}</div><div className="tabular text-xl font-semibold text-ink">{v}</div></div>
            ))}
          </div>
          {d.missing.length > 0 && (
            <div className="card overflow-hidden">
              <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-wrong-700">Paid, no report</div>
              <Table head={<tr>{['Payment', 'Paid', 'Customer', 'Vehicle'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {d.missing.map((m) => <tr key={m.id}><td className="td font-mono text-2xs">#{m.id}</td><td className="td">{dateTime(m.paid_at)}</td><td className="td font-mono">{m.mobile || '—'}</td>
                  <td className="td font-mono">{m.reg_no ? <Link className="text-brand-deep hover:underline" to={`/vehicles/${m.reg_no}`}>{m.reg_no}</Link> : '—'}</td></tr>)}
              </Table>
            </div>
          )}
          <div className="card overflow-hidden">
            {!d.rows.length ? <Empty>No report in this period.</Empty> : (
              <Table head={<tr>{['Report', 'Generated', 'Vehicle', 'Customer', 'Channel', 'Delivery', 'Delivered at'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {d.rows.map((x) => (
                  <tr key={x.id}>
                    <td className="td font-mono text-2xs">{x.report_number}</td><td className="td whitespace-nowrap">{dateTime(x.created_at)}</td>
                    <td className="td font-mono"><Link className="text-brand-deep hover:underline" to={`/vehicles/${x.reg_no}#reports`}>{x.reg_no}</Link></td>
                    <td className="td font-mono">{x.mobile || '—'}</td><td className="td">{x.channel === 'web' ? 'Website' : 'WhatsApp'}</td>
                    <td className="td"><Chip tone={STATE[x.state][1]} note={x.state === 'not_recorded' ? d.notes.not_recorded : undefined}>{STATE[x.state][0]}</Chip></td>
                    <td className="td whitespace-nowrap text-2xs">{x.delivered_at ? dateTime(x.delivered_at) : '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
