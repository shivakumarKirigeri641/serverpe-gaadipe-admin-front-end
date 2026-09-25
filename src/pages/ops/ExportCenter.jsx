import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Failed, Skeleton, Empty, Table, Pager, Chip, saveBlob } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { dateTime } from '../../lib/format';

/**
 * EXPORTS (user, 2026-09-25) — every export anyone made, from any screen:
 * who, which data, which filters, how many rows, when, and until when the
 * file can be downloaded again (24 hours). Make a new one here. Each dataset
 * needs its own permission; customers' numbers are masked unless your role
 * may see them. Every export and download is logged.
 */
const size = (b) => (b == null ? '—' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default function ExportCenter() {
  const { can } = useSession();
  const [params, controls, key] = usePeriod('exports', { defaultRange: '30d', withCompare: false });
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [dataset, setDataset] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setError(null); setD(await api.exportsList({ limit: 50, offset: (page - 1) * 50 })); } catch (e) { setError(e); } }, [page]);
  useEffect(() => { load(); }, [load]);
  const mine = (d?.datasets || []).filter((x) => allowed(can, x.cap));
  const make = async () => {
    setBusy(true);
    try { const out = await api.createExport(dataset, params); snack(`Export ready — ${out.rows} row(s)`); await load(); await download(out.id); }
    catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
  };
  const download = async (id) => { try { const { blob, filename } = await api.exportFile(id); saveBlob(blob, filename); } catch (e) { snack(e.message, 'wrong'); } };
  void key;
  return (
    <Shell title="Exports" subtitle={d ? `${d.total} export(s) on record` : ' '}>
      <div className="card mb-3 flex flex-wrap items-center gap-2 p-3">
        <select className="input !w-auto !py-1.5 text-sm" value={dataset} onChange={(e) => setDataset(e.target.value)}>
          <option value="">Choose data to export…</option>{mine.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
        </select>
        {controls}
        <button className="btn-primary !py-1.5 text-2xs" onClick={make} disabled={!dataset || busy}>{busy ? 'Preparing…' : 'Export CSV'}</button>
        <span className="text-2xs text-muted">Logged with the filters and row count. Referral data is not offered — no referral programme for now.</span>
      </div>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : !d.rows.length ? <Empty>No export yet.</Empty> : (
          <>
            <Table head={<tr>{['Export', 'Admin', 'Dataset', 'Filters', 'Records', 'Created', 'Status', 'Expires', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
              {d.rows.map((x) => (
                <tr key={x.id}>
                  <td className="td font-mono text-2xs">#{x.id}</td><td className="td">{x.admin || '—'}</td>
                  <td className="td">{x.label}{x.masked ? <span className="text-2xs text-muted"> · numbers masked</span> : null}</td>
                  <td className="td max-w-[220px] truncate font-mono text-2xs text-muted" title={JSON.stringify(x.filters)}>{Object.entries(x.filters || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(' ') || '—'}</td>
                  <td className="td tabular">{x.records ?? '—'}</td>
                  <td className="td whitespace-nowrap text-2xs">{dateTime(x.created_at)}</td>
                  <td className="td"><Chip tone={x.status === 'ready' ? 'good' : 'info'}>{x.status === 'ready' ? `Ready · ${size(x.size_bytes)}` : x.status}</Chip></td>
                  <td className="td whitespace-nowrap text-2xs">{x.status === 'ready' ? dateTime(x.expires_at) : '—'}</td>
                  <td className="td">{x.status === 'ready' && allowed(can, d.datasets.find((y) => y.key === x.dataset)?.cap) && <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => download(x.id)}>Download</button>}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={d.total} size={50} onPage={setPage} />
          </>
        )}
      </div>
    </Shell>
  );
}
