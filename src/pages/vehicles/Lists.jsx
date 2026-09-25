import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Empty, Table, Modal, Field } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { count, dateTime } from '../../lib/format';
import { Confirm } from './actions.jsx';

/**
 * SAVED VEHICLE LISTS (user, 2026-09-25) — "My follow-up vehicles",
 * "API failures", … shared by the team. A list opens in the explorer, where
 * its vehicles can be removed, tagged, assigned or exported. Deleting a list
 * sets it aside; the vehicles are never touched.
 */
export default function Lists() {
  const { can } = useSession();
  const mayEdit = allowed(can, 'vehicles.tags');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState(null);
  const [drop, setDrop] = useState(null);
  const load = useCallback(async () => { try { setError(null); setRows((await api.vehicleLists()).rows); } catch (e) { setError(e); } }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <Shell title="Saved vehicle lists" subtitle={rows ? `${rows.length} list${rows.length === 1 ? '' : 's'}` : ' '}
      actions={mayEdit && <button className="btn-primary !py-1.5 text-2xs" onClick={() => setEdit({})}>New list</button>}>
      <div className="card overflow-hidden">
        {error && !rows ? <Failed error={error} onRetry={load} /> : !rows ? <Skeleton rows={4} /> : !rows.length ? (
          <Empty>No lists yet. Make one here, or select vehicles in the explorer and choose “Add to list”.</Empty>
        ) : (
          <Table head={<tr>{['List', 'Vehicles', 'Notes', 'Made by', 'Changed', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="td"><Link to={`/vehicles?list=${l.id}`} className="font-semibold text-brand-deep hover:underline">{l.name}</Link></td>
                <td className="td tabular">{count(l.vehicles)}</td>
                <td className="td max-w-[320px] text-2xs text-body"><span className="line-clamp-2">{l.notes || '—'}</span></td>
                <td className="td">{l.created_by || '—'}</td>
                <td className="td whitespace-nowrap">{dateTime(l.modified_at)}</td>
                <td className="td whitespace-nowrap text-right">
                  <Link className="btn-quiet !px-2 !py-1 text-2xs" to={`/vehicles?list=${l.id}`}>Open</Link>
                  {mayEdit && <button className="btn-quiet ml-1 !px-2 !py-1 text-2xs" onClick={() => setEdit(l)}>Rename / notes</button>}
                  {mayEdit && <button className="btn-quiet ml-1 !px-2 !py-1 text-2xs text-wrong-700" onClick={() => setDrop(l)}>Delete</button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <p className="mt-2 text-2xs text-muted">To export a list, open it and use Export — the file holds exactly the list’s vehicles.</p>
      {edit && <EditList list={edit} onClose={() => setEdit(null)} onDone={load} />}
      {drop && (
        <Confirm title={`Delete “${drop.name}”?`} action="Delete list" tone="danger" onClose={() => setDrop(null)}
          onConfirm={async () => { await api.deleteVehicleList(drop.id); snack('List deleted'); load(); }}>
          The list is set aside with its entries kept for the audit trail. The {count(drop.vehicles)} vehicle(s) on it are not affected.
        </Confirm>
      )}
    </Shell>
  );
}

function EditList({ list, onClose, onDone }) {
  const [name, setName] = useState(list.name || '');
  const [notes, setNotes] = useState(list.notes || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api.saveVehicleList(list.id || null, { name, notes }); snack(list.id ? 'List saved' : 'List made'); onDone(); onClose(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={list.id ? 'Edit list' : 'New list'} onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy || !name.trim()}>Save</button></>}>
      <Field label="Name"><input className="input" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Suspicious vehicles" /></Field>
      <Field label="Notes"><textarea className="input min-h-[90px]" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {err && <p className="text-sm text-wrong-700">{err}</p>}
    </Modal>
  );
}
