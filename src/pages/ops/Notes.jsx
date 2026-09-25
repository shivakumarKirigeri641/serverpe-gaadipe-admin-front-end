import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Empty, Pager } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { dateTime } from '../../lib/format';

/**
 * ADMIN NOTES (user, 2026-09-25) — every note the team has written, on
 * vehicles, customers, payments and incidents, newest first, each linking to
 * what it is about. Notes are never edited or deleted; withdrawn ones stay,
 * struck through. EntityNotes is the panel the customer and payment screens
 * show for their own notes.
 */
const LINK = { customer: (id) => `/journey?user=${id}`, vehicle: (id) => `/vehicles/${id}#notes`, payment: () => '/profitability?tab=transactions', incident: () => '/alerts' };

export default function Notes() {
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.allNotes({ limit: 50, offset: (page - 1) * 50 })); } catch (e) { setError(e); } }, [page]);
  useEffect(() => { load(); }, [load]);
  return (
    <Shell title="Admin notes" subtitle={d ? `${d.total} notes` : ' '}>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : !d.rows.length ? <Empty>No notes yet. Notes are written on a vehicle, customer or payment.</Empty> : (
          <>
            <ul className="divide-y divide-line">
              {d.rows.map((n) => (
                <li key={n.id} className={`px-4 py-3 ${n.withdrawn_at ? 'opacity-60' : ''}`}>
                  <div className="text-2xs text-muted"><b className="text-ink">{n.admin || 'Someone'}</b> · {dateTime(n.created_at)} · on{' '}
                    <Link className="text-brand-deep hover:underline" to={LINK[n.entity_type](n.entity_id)}>{n.entity_type} {n.entity_id}</Link>{n.withdrawn_at ? ' · withdrawn' : ''}</div>
                  <p className={`mt-1 whitespace-pre-wrap text-sm ${n.withdrawn_at ? 'line-through' : 'text-ink'}`}>{n.body}</p>
                </li>
              ))}
            </ul>
            <Pager page={page} total={d.total} size={50} onPage={setPage} />
          </>
        )}
      </div>
    </Shell>
  );
}

/** The notes on one customer, payment or incident, with a box to add one. */
export function EntityNotes({ type, id }) {
  const { can } = useSession();
  const may = allowed(can, 'tasks.manage');
  const [rows, setRows] = useState(null);
  const [text, setText] = useState('');
  const load = useCallback(() => api.entityNotes(type, id).then((r) => setRows(r.rows)).catch(() => setRows([])), [type, id]);
  useEffect(() => { load(); }, [load]);
  const add = async () => { try { await api.addNote(type, id, text); setText(''); snack('Note added'); load(); } catch (e) { snack(e.message, 'wrong'); } };
  const withdraw = async (n) => { try { await api.withdrawNote(n.id); snack('Note withdrawn — kept in the history'); load(); } catch (e) { snack(e.message, 'wrong'); } };
  return (
    <div>
      {may && (
        <div className="mb-2 flex gap-2">
          <input className="input !py-1.5 text-sm" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} placeholder="Add a note for the team…" />
          <button className="btn-primary !py-1.5 text-2xs" onClick={add} disabled={!text.trim()}>Add</button>
        </div>
      )}
      {!rows ? null : !rows.length ? <p className="text-2xs text-muted">No notes.</p> : (
        <ul className="space-y-1.5">
          {rows.map((n) => (
            <li key={n.id} className={`rounded-lg border border-line px-3 py-2 ${n.withdrawn_at ? 'opacity-60' : ''}`}>
              <div className="flex items-center gap-2 text-2xs text-muted"><b className="text-ink">{n.admin || 'Someone'}</b> · {dateTime(n.created_at)}
                {n.withdrawn_at ? <span>· withdrawn by {n.withdrawn_by}</span> : may && <button className="ml-auto text-wrong-700 hover:underline" onClick={() => withdraw(n)}>Withdraw</button>}</div>
              <p className={`mt-0.5 whitespace-pre-wrap text-sm ${n.withdrawn_at ? 'line-through' : 'text-ink'}`}>{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
