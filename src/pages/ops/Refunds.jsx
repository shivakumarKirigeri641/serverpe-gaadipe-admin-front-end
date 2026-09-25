import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Failed, Skeleton, Empty, Table, Banner } from '../../components/ui.jsx';
import { dateTime } from '../../lib/format';
import { rs } from './common.jsx';

/**
 * REFUNDS (user, 2026-09-25) — refunded payments, read-only. GaadiPe does
 * not refund from the panel; refunds made at Razorpay arrive by webhook and
 * are listed here with their amounts.
 */
export default function Refunds() {
  const [params, controls, key] = usePeriod('refunds', { defaultRange: 'this_fy', withCompare: false });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.refunds(params)); } catch (e) { setError(e); } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setD(null); load(); }, [load]);
  return (
    <Shell title="Refunds" subtitle={d ? `${d.range.label} · ${d.rows.length} refund(s) · ${rs(d.total_paise)}` : ' '} actions={controls}>
      <Banner className="mb-3">{d?.note || 'Read-only.'}</Banner>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={4} /> : !d.rows.length ? <Empty>No refunds in this period.</Empty> : (
          <Table head={<tr>{['Payment', 'Refund ID', 'Customer', 'Vehicle', 'Paid', 'Refunded', 'Amount', 'Refunded amount', 'Status'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
            {d.rows.map((x) => (
              <tr key={x.id}>
                <td className="td font-mono text-2xs">#{x.id}<div className="text-muted">{x.payment_id}</div></td>
                <td className="td font-mono text-2xs">{x.refund_id || '—'}</td>
                <td className="td font-mono">{x.mobile || '—'}</td>
                <td className="td font-mono">{x.reg_no ? <Link className="text-brand-deep hover:underline" to={`/vehicles/${x.reg_no}#payments`}>{x.reg_no}</Link> : '—'}</td>
                <td className="td whitespace-nowrap">{dateTime(x.paid_at)}</td><td className="td whitespace-nowrap">{dateTime(x.refunded_at)}</td>
                <td className="td tabular">{rs(x.amount_paise)}</td><td className="td tabular font-semibold">{rs(x.refund_paise)}</td><td className="td">{x.refund_status || '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Shell>
  );
}
