import { useState } from 'react';
import { api } from '../../lib/api';
import { Modal, Field, saveBlob } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { TAG_WORD } from './common.jsx';

/*
 * The dialogs the explorer's rows, its bulk bar and a vehicle's profile share.
 * Each takes the vehicles it acts on — `ids` (vehicle ids) and, where the API
 * wants one, `reg` — and calls onDone when the server has said yes.
 */

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function TagDialog({ ids, meta, current = [], onClose, onDone }) {
  const [picked, setPicked] = useState(new Set());
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toggle = (t) => setPicked((s) => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n; });
  const save = async (remove = []) => {
    const add = [...picked, ...(custom.trim() ? [custom.trim()] : [])];
    if (!add.length && !remove.length) return;
    setBusy(true); setErr(null);
    try {
      await api.vehicleBulk('tags', { vehicle_ids: ids, add, remove });
      snack(remove.length ? 'Tag removed' : `Tagged ${plural(ids.length, 'vehicle')}`);
      onDone?.(); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Tags" subtitle={`${plural(ids.length, 'vehicle')} · internal, never shown to customers`} onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={() => save()} disabled={busy || (!picked.size && !custom.trim())}>Add tags</button></>}>
      {current.length > 0 && (
        <div>
          <div className="label">On this vehicle</div>
          <div className="flex flex-wrap gap-1.5">
            {current.map((t) => (
              <button key={t} className="chip border border-brand/20 bg-brand/5 text-brand-deep" onClick={() => save([t])} disabled={busy} title="Remove">
                {TAG_WORD(t)} ✕
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <div className="label">Add</div>
        <div className="flex flex-wrap gap-1.5">
          {(meta?.tags || []).filter((t) => !current.includes(t.tag)).map((t) => (
            <button key={t.tag} type="button" onClick={() => toggle(t.tag)}
              className={`chip border ${picked.has(t.tag) ? 'border-brand bg-brand text-white' : 'border-line bg-white text-body hover:bg-shell'}`}>
              {TAG_WORD(t.tag)}{t.n ? <span className="opacity-60"> {t.n}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <Field label="Or a new tag" hint="Letters, numbers and spaces; up to 24 characters.">
        <input className="input" value={custom} maxLength={24} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Dealer" />
      </Field>
      {err && <p className="text-sm text-wrong-700">{err}</p>}
    </Modal>
  );
}

export function NoteDialog({ reg, display, onClose, onDone }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api.vehicleNote(reg, body); snack('Note added'); onDone?.(); onClose(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add a note" subtitle={`${display || reg} · visible to the team, kept with its edit history`} onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy || !body.trim()}>Save note</button></>}>
      <textarea className="input min-h-[120px]" autoFocus maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)}
        placeholder="Customer contacted support on 25 Sep. Follow up required." />
      {err && <p className="text-sm text-wrong-700">{err}</p>}
    </Modal>
  );
}

export function ListDialog({ ids, meta, onClose, onDone, refreshMeta }) {
  const [listId, setListId] = useState(meta?.lists?.[0]?.id || 'new');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      let id = listId;
      if (id === 'new') id = (await api.saveVehicleList(null, { name })).id;
      await api.vehicleListItems(id, { vehicle_ids: ids, note: note || undefined });
      snack(`Added to the list`);
      refreshMeta?.(); onDone?.(); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Add to a list" subtitle={plural(ids.length, 'vehicle')} onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy || (listId === 'new' && !name.trim())}>Add</button></>}>
      <Field label="List">
        <select className="input" value={listId} onChange={(e) => setListId(e.target.value)}>
          {(meta?.lists || []).map((l) => <option key={l.id} value={l.id}>{l.name} ({l.vehicles})</option>)}
          <option value="new">+ A new list…</option>
        </select>
      </Field>
      {listId === 'new' && (
        <Field label="Name of the new list"><input className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="My follow-up vehicles" /></Field>
      )}
      <Field label="Note on this entry (optional)"><input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {err && <p className="text-sm text-wrong-700">{err}</p>}
    </Modal>
  );
}

export function AssignDialog({ ids, meta, onClose, onDone }) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await api.vehicleBulk('assign', { vehicle_ids: ids, admin_id: to || null });
      snack(to ? 'Assigned' : 'Unassigned'); onDone?.(); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Assign" subtitle={`${plural(ids.length, 'vehicle')} · who on the team is looking after it`} onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy}>Save</button></>}>
      <Field label="Panel user">
        <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Nobody (unassign)</option>
          {(meta?.admins || []).map((a) => <option key={a.id} value={a.id}>{a.name} · {a.role}</option>)}
        </select>
      </Field>
      {err && <p className="text-sm text-wrong-700">{err}</p>}
    </Modal>
  );
}

/** "Are you sure?" — with what will happen, in words, and nothing destroyed. */
export function Confirm({ title, children, action = 'Confirm', tone = 'primary', onClose, onConfirm }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await onConfirm(); onClose(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={tone === 'danger' ? 'btn-danger' : 'btn-primary'} onClick={go} disabled={busy}>{busy ? 'Working…' : action}</button></>}>
      <div className="text-sm text-body">{children}</div>
      {err && <p className="text-sm text-wrong-700">{err}</p>}
    </Modal>
  );
}

/** The export dialog: what goes into the file, said before it is made. */
export function ExportDialog({ meta, total, selected, params, onClose }) {
  const all = Object.entries(meta?.export_fields || {});
  const [fields, setFields] = useState(() => new Set(all.map(([k]) => k)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const n = selected?.length || total;
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const { blob, filename } = await api.exportCsv('vehicles.csv', {
        ...params, offset: undefined, limit: undefined, page: undefined,
        fields: [...fields].join(','), ids: selected?.length ? selected.join(',') : undefined,
      });
      saveBlob(blob, filename || 'gaadipe-vehicles.csv');
      snack('Export downloaded'); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const toggle = (k) => setFields((s) => { const x = new Set(s); x.has(k) ? x.delete(k) : x.add(k); return x; });
  return (
    <Modal title="Export vehicles" subtitle="CSV — this export is logged with its filter, count and fields" onClose={onClose} busy={busy} wide
      footer={<><button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={go} disabled={busy || !fields.size || !n}>{busy ? 'Preparing…' : `Export ${plural(n, 'record')}`}</button></>}>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border border-line bg-shell/60 px-3 py-2"><div className="text-2xs text-muted">Records</div><div className="tabular text-lg font-semibold text-ink">{n.toLocaleString('en-IN')}</div>
          <div className="text-2xs text-muted">{selected?.length ? 'selected rows' : 'every row matching the filters'}</div></div>
        <div className="rounded-lg border border-line bg-shell/60 px-3 py-2"><div className="text-2xs text-muted">Fields</div><div className="tabular text-lg font-semibold text-ink">{fields.size}</div></div>
        <div className="rounded-lg border border-good-500/25 bg-good-50 px-3 py-2"><div className="text-2xs text-good-700">Sensitive fields</div>
          <div className="text-sm font-semibold text-good-700">None</div><div className="text-2xs text-good-700">Customer numbers are masked in exports.</div></div>
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between"><span className="label !mb-0">Fields</span>
          <span className="flex gap-2 text-2xs"><button className="text-brand" onClick={() => setFields(new Set(all.map(([k]) => k)))}>All</button>
            <button className="text-brand" onClick={() => setFields(new Set())}>None</button></span></div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
          {all.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={fields.has(k)} onChange={() => toggle(k)} /> {label}</label>
          ))}
        </div>
      </div>
      {err && <p className="text-sm text-wrong-700">{err}</p>}
    </Modal>
  );
}
