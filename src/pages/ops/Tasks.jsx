import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Empty, Table, Pager, Chip, Modal, Field } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { dateTime } from '../../lib/format';
import { useVehicleMeta } from '../vehicles/common.jsx';

/**
 * TASKS (user, 2026-09-25) — work for someone on the team: title, what,
 * who, priority, due date, status — optionally about a customer, vehicle,
 * payment or incident, which the row links to. Every change is logged.
 */
const PRI = { urgent: 'wrong', high: 'watch', normal: 'info', low: 'info' };
const ST = { open: ['Open', 'info'], in_progress: ['In progress', 'brand'], completed: ['Completed', 'good'], cancelled: ['Cancelled', 'info'] };
const LINK = { customer: (id) => `/journey?user=${id}`, vehicle: (id) => `/vehicles/${id}`, payment: () => '/profitability?tab=transactions', incident: () => '/alerts' };

export default function Tasks() {
  const { can } = useSession();
  const may = allowed(can, 'tasks.manage');
  const [sp] = useSearchParams();
  const [f, setF] = useState({ status: 'active', mine: '', overdue: '' });
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState(sp.get('new') ? { entity_type: sp.get('type') || '', entity_id: sp.get('id') || '' } : null);
  const load = useCallback(async () => {
    try { setError(null); setD(await api.tasks({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), limit: 50, offset: (page - 1) * 50 })); } catch (e) { setError(e); }
  }, [f, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [f]);
  const setStatus = async (t, status) => { try { await api.updateTask(t.id, { status }); snack(`Marked ${ST[status][0].toLowerCase()}`); load(); } catch (e) { snack(e.message, 'wrong'); } };
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  return (
    <Shell title="Tasks" subtitle={d ? `${d.counts.open} open · ${d.counts.in_progress} in progress · ${d.counts.overdue} overdue · ${d.counts.mine} yours` : ' '}
      actions={may && <button className="btn-primary !py-1.5 text-2xs" onClick={() => setEdit({})}>New task</button>}>
      <div className="card mb-3 flex flex-wrap items-center gap-3 p-3">
        <select className="input !w-auto !py-1.5 text-sm" value={f.status} onChange={(e) => setF((x) => ({ ...x, status: e.target.value }))}>
          <option value="active">Open and in progress</option><option value="open">Open</option><option value="in_progress">In progress</option>
          <option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="">Everything</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.mine === '1'} onChange={(e) => setF((x) => ({ ...x, mine: e.target.checked ? '1' : '' }))} /> Mine</label>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={f.overdue === '1'} onChange={(e) => setF((x) => ({ ...x, overdue: e.target.checked ? '1' : '' }))} /> Overdue</label>
      </div>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : !d.rows.length ? <Empty>No tasks here.</Empty> : (
          <>
            <Table head={<tr>{['Task', 'About', 'Assigned', 'Priority', 'Due', 'Status', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
              {d.rows.map((t) => (
                <tr key={t.id}>
                  <td className="td"><div className="font-semibold text-ink">{t.title}</div>{t.description && <div className="line-clamp-2 text-2xs text-muted">{t.description}</div>}
                    <div className="text-2xs text-muted">by {t.created_by_name || '—'} · {dateTime(t.created_at)}</div></td>
                  <td className="td text-2xs">{t.entity_type ? <Link className="text-brand-deep hover:underline" to={LINK[t.entity_type](t.entity_id)}>{t.entity_type} {t.entity_id}</Link> : '—'}</td>
                  <td className="td">{t.assigned_name || <span className="text-muted">Nobody</span>}</td>
                  <td className="td"><Chip tone={PRI[t.priority]}>{t.priority}</Chip></td>
                  <td className={`td whitespace-nowrap text-2xs ${t.due_date && String(t.due_date).slice(0, 10) < today && ['open', 'in_progress'].includes(t.status) ? 'font-semibold text-wrong-700' : ''}`}>{t.due_date ? String(t.due_date).slice(0, 10) : '—'}</td>
                  <td className="td"><Chip tone={ST[t.status][1]}>{ST[t.status][0]}</Chip></td>
                  <td className="td whitespace-nowrap text-right">{may && (
                    <>
                      {t.status === 'open' && <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => setStatus(t, 'in_progress')}>Start</button>}
                      {['open', 'in_progress'].includes(t.status) && <button className="btn-quiet ml-1 !px-2 !py-1 text-2xs" onClick={() => setStatus(t, 'completed')}>Complete</button>}
                      <button className="btn-quiet ml-1 !px-2 !py-1 text-2xs" onClick={() => setEdit(t)}>Edit</button>
                    </>
                  )}</td>
                </tr>
              ))}
            </Table>
            <Pager page={page} total={d.total} size={50} onPage={setPage} />
          </>
        )}
      </div>
      {edit && <TaskDialog task={edit} onClose={() => setEdit(null)} onDone={load} />}
    </Shell>
  );
}

export function TaskDialog({ task, onClose, onDone }) {
  const [meta] = useVehicleMeta();
  const [t, setT] = useState({ title: task.title || '', description: task.description || '', entity_type: task.entity_type || '', entity_id: task.entity_id || '',
    assigned_to: task.assigned_to || '', priority: task.priority || 'normal', due_date: task.due_date ? String(task.due_date).slice(0, 10) : '', status: task.status || 'open' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const put = (k) => (e) => setT((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = { ...t, entity_type: t.entity_type || null, entity_id: t.entity_type ? t.entity_id : null, assigned_to: t.assigned_to || null, due_date: t.due_date || null };
      if (task.id) await api.updateTask(task.id, body); else await api.createTask(body);
      snack(task.id ? 'Task saved' : 'Task created'); onDone(); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={task.id ? 'Edit task' : 'New task'} onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy || !t.title.trim()}>Save</button></>}>
      <Field label="Title"><input className="input" autoFocus maxLength={200} value={t.title} onChange={put('title')} /></Field>
      <Field label="Description"><textarea className="input min-h-[80px]" maxLength={4000} value={t.description} onChange={put('description')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="About"><select className="input" value={t.entity_type} onChange={put('entity_type')}>
          <option value="">Nothing in particular</option><option value="customer">A customer (id)</option><option value="vehicle">A vehicle (number)</option>
          <option value="payment">A payment (id)</option><option value="incident">An incident (alert id)</option></select></Field>
        <Field label="Which">{t.entity_type ? <input className="input" value={t.entity_id} onChange={put('entity_id')} /> : <input className="input" disabled value="" />}</Field>
        <Field label="Assigned to"><select className="input" value={t.assigned_to} onChange={put('assigned_to')}>
          <option value="">Nobody yet</option>{(meta?.admins || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Priority"><select className="input" value={t.priority} onChange={put('priority')}>{['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
        <Field label="Due"><input type="date" className="input" value={t.due_date} onChange={put('due_date')} /></Field>
        {task.id && <Field label="Status"><select className="input" value={t.status} onChange={put('status')}>{Object.entries(ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
      </div>
      {err && <p className="text-sm text-wrong-700">{err}</p>}
    </Modal>
  );
}
