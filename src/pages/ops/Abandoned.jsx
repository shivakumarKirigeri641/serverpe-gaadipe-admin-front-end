import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Empty, Table, Pager, Banner, Chip } from '../../components/ui.jsx';
import { dateTime, ago } from '../../lib/format';
import { rs } from './common.jsx';

/**
 * ABANDONED PAYMENTS (user, 2026-09-25) — people who started paying and did
 * not finish, and why if Razorpay said. Looking only: no message is sent from
 * here — recovery is a separate, controlled feature. Each row opens the
 * person's whole journey.
 */
const WINDOWS = [['1h', 'Last hour'], ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days']];
const SIZE = 50;
const since = (m) => (m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d`);

export default function Abandoned() {
  const [win, setWin] = useState('today');
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.abandoned({ window: win, limit: SIZE, offset: (page - 1) * SIZE })); } catch (e) { setError(e); } }, [win, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [win]);
  useAutoRefresh(load, 30000);
  return (
    <Shell title="Abandoned payments" subtitle={d ? `${d.total} not completed` : ' '}
      actions={<select className="input !w-auto !py-1.5 text-sm" value={win} onChange={(e) => setWin(e.target.value)}>{WINDOWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}>
      <Banner className="mb-3">{d?.note || 'Looking only — no message is sent from this screen.'}</Banner>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : !d.rows.length ? <Empty>No abandoned payment in this window.</Empty> : (
          <>
            <Table head={<tr>{['Customer', 'Vehicle', 'Amount', 'Payment', 'Started', 'Last activity', 'Source · campaign', 'Channel', 'Reason', 'Since', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
              {d.rows.map((x) => (
                <tr key={x.id}>
                  <td className="td font-mono">{x.mobile || '—'}</td>
                  <td className="td font-mono">{x.reg_no ? <Link className="text-brand-deep hover:underline" to={`/vehicles/${x.reg_no}`}>{x.reg_no}</Link> : '—'}</td>
                  <td className="td tabular">{rs(x.amount_paise)}</td>
                  <td className="td font-mono text-2xs">#{x.id}<div className="text-muted">{x.order_id || ''}</div></td>
                  <td className="td whitespace-nowrap">{dateTime(x.started_at)}</td>
                  <td className="td whitespace-nowrap">{x.last_activity ? ago(x.last_activity) : '—'}</td>
                  <td className="td">{x.source}{x.campaign ? <span className="text-2xs text-muted"> · {x.campaign}</span> : null}</td>
                  <td className="td">{x.channel === 'web' || x.channel === 'website' ? 'Website' : 'WhatsApp'}</td>
                  <td className="td"><Chip tone={x.reason === 'Left without paying' ? 'info' : 'watch'} note={x.reason_detail}>{x.reason}</Chip></td>
                  <td className="td tabular">{since(x.minutes_since)}</td>
                  <td className="td">{x.user_id && <Link className="btn-quiet !px-2 !py-1 text-2xs" to={`/journey?user=${x.user_id}`}>Journey</Link>}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={d.total} size={SIZE} onPage={setPage} />
          </>
        )}
      </div>
      <p className="mt-2 text-2xs text-muted">A checkout the customer replaced with one they paid (same vehicle) is not listed.</p>
    </Shell>
  );
}
