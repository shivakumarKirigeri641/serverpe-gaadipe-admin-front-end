import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { mobile as fmtMobile, plate, dateTime } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Table, Chip, Empty, Spinner, Failed, Banner, Field, Modal } from '../components/ui.jsx';
import { useSession, allowed } from '../lib/session';

/**
 * Who and what GaadiPe will not serve.
 *
 * WHAT A BLOCK ACTUALLY DOES is written on the screen, because a block whose
 * effect is unclear gets used wrongly in both directions — someone blocks a
 * customer thinking it only stops alerts, or hesitates to block an abusive
 * number because they are not sure what happens.
 *
 * Blocks are released, never deleted: who blocked a number, when, and who let
 * it back in is part of the record.
 */
export default function Blocks() {
  const { can } = useSession();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [history, setHistory] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try { setError(null); setRows((await api.blocks({ history: history ? 1 : undefined })).rows); }
    catch (e) { setError(e); }
  }, [history]);
  useEffect(() => { load(); }, [load]);

  const release = async (id) => {
    if (!window.confirm('Let this back in?')) return;
    try { await api.release(id); await load(); } catch (e) { window.alert(e.message); }
  };

  return (
    <Shell title="Blocked" subtitle="Mobile numbers and vehicles GaadiPe will not serve"
      actions={
        <>
          <button className="btn-quiet !py-1.5 text-2xs" onClick={() => setHistory(!history)}>
            {history ? 'Only active' : 'Include released'}
          </button>
          {allowed(can, 'block') && (
            <button className="btn-primary !py-1.5 text-2xs" onClick={() => setAdding(true)}>Block something</button>
          )}
        </>
      }>

      <div className="grid gap-3 sm:grid-cols-2">
        <Banner tone="info">
          <b className="text-ink">Blocking a mobile number</b> stops every reply, every alert and every
          receipt to it, and it cannot sign in to the website or pay. Its messages are still recorded.
        </Banner>
        <Banner tone="info">
          <b className="text-ink">Blocking a vehicle</b> stops it being looked up or sold to anybody, and
          skips it in the watch job. Use this when an owner objects to their vehicle being checked.
        </Banner>
      </div>

      <div className="card mt-4">
        {error ? <Failed error={error} onRetry={load} />
          : !rows ? <Spinner />
          : !rows.length ? <Empty>Nothing is blocked.</Empty>
          : (
            <Table head={
              <tr>
                <th className="th">What</th><th className="th">Reason</th>
                <th className="th">Blocked</th><th className="th">By</th>
                <th className="th">State</th><th className="th"></th>
              </tr>
            }>
              {rows.map((b) => (
                <tr key={b.id}>
                  <td className="td">
                    {b.kind === 'mobile'
                      ? <span className="tabular">{fmtMobile(b.value)}</span>
                      : <span className="plate">{plate(b.value)}</span>}
                    <div className="text-2xs text-muted">{b.kind}</div>
                  </td>
                  <td className="td max-w-xs text-body">{b.reason || <span className="text-muted">—</span>}</td>
                  <td className="td text-2xs text-muted">{dateTime(b.created_at)}</td>
                  <td className="td text-2xs">{b.blocked_by_name || '—'}</td>
                  <td className="td">
                    {b.released_at
                      ? <Chip tone="info">Released {b.released_by_name ? `by ${b.released_by_name}` : ''}</Chip>
                      : <Chip tone="wrong">Blocked</Chip>}
                  </td>
                  <td className="td">
                    {!b.released_at && allowed(can, 'block') && (
                      <button className="btn-quiet !px-2.5 !py-1 text-2xs" onClick={() => release(b.id)}>
                        Unblock
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </div>

      {adding && <AddBlock onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />}
    </Shell>
  );
}

function AddBlock({ onClose, onDone }) {
  const [kind, setKind] = useState('mobile');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    setBusy(true); setError(null);
    try { await api.block(kind, value, reason); onDone(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };

  return (
    <Modal title="Block a number or a vehicle" busy={busy} onClose={onClose}
      footer={
        <>
          <button className="btn-quiet" onClick={onClose}>Cancel</button>
          <button className="btn-danger" disabled={busy || value.trim().length < 5 || reason.trim().length < 5}
            onClick={save}>{busy ? 'Blocking…' : 'Block'}</button>
        </>
      }>
      <Field label="What are you blocking?">
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="mobile">A mobile number</option>
          <option value="vehicle">A vehicle</option>
        </select>
      </Field>
      <Field label={kind === 'mobile' ? 'Mobile number' : 'Registration number'}>
        <input className="input" autoFocus value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={kind === 'mobile' ? '98861 22415' : 'KA02EX1480'} />
      </Field>
      <Field label="Reason" hint="Recorded with your name and the time. A few words is enough.">
        <textarea className="input min-h-[70px]" value={reason} maxLength={500}
          onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && <Banner tone="wrong">{error.message}</Banner>}
    </Modal>
  );
}
