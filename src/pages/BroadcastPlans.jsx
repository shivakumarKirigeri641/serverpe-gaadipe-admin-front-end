import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { Modal, Banner } from '../components/ui.jsx';
import { snack } from '../components/Live.jsx';
import { count, dateTime } from '../lib/format';

/*
 * BROADCAST IN BATCHES (user, 2026-10-05; back end src/admin/broadcastPlans.js).
 * While WhatsApp lets GaadiPe message only 250 people in any 24 hours —
 * shared with QuizPe and the alerts — a message to everyone goes in parts:
 * batch by batch, each 24 hours (or the gap chosen) after the last finished,
 * never more than the room left in the last 24 hours, until all are reached.
 */

/* The plan in words: "150 now, 68 after 24 h". */
function outline(total, size, gap) {
  const parts = [];
  for (let i = 0, left = total; left > 0 && i < 12; i += 1) {
    const n = Math.min(size, left);
    parts.push(`${i === 0 ? 'Batch 1 now' : `Batch ${i + 1} after ${gap * i} h`}: ${count(n)}`);
    left -= n;
  }
  const batches = Math.ceil(total / Math.max(1, size));
  if (batches > 12) parts.push(`… ${batches} batches in all`);
  return { parts, batches };
}

/** The confirm dialog for sending the chosen audience in batches. */
export function BatchSend({ body, chosen, template, limit, onClose, onCreated }) {
  const suggested = Math.max(1, Math.min(150, (limit?.limit || 250) - 100));
  const [size, setSize] = useState(String(suggested));
  const [gap, setGap] = useState('24');
  const [reserve, setReserve] = useState('50');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const s = Math.max(1, Math.round(Number(size) || 1));
  const g = Math.max(1, Number(gap) || 24);
  const plan = outline(chosen, s, g);
  const create = async () => {
    setBusy(true); setErr(null);
    try {
      const out = await api.createBroadcastPlan({ ...body, batch_size: s, gap_hours: g, reserve: Math.max(0, Math.round(Number(reserve) || 0)), confirm: 'SEND' });
      if (!out.ok) { setErr(out.message || 'Could not start it.'); return; }
      snack(`Started — ${count(out.people)} people in ${out.batches} batch${out.batches === 1 ? '' : 'es'}`);
      onCreated(out);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Send in batches" subtitle={`${template} · ${count(chosen)} customer(s)`} onClose={onClose} busy={busy}>
      <p className="text-sm text-body">
        GaadiPe sends one batch, waits, then sends the next — never going over the WhatsApp limit — until everyone has it.
        Anyone whose message fails is tried again in a later batch.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="block"><span className="label">People per batch</span>
          <input className="input" type="number" min="1" value={size} onChange={(e) => setSize(e.target.value)} /></label>
        <label className="block"><span className="label">Hours between</span>
          <input className="input" type="number" min="1" value={gap} onChange={(e) => setGap(e.target.value)} /></label>
        <label className="block"><span className="label">Keep free</span>
          <input className="input" type="number" min="0" value={reserve} onChange={(e) => setReserve(e.target.value)} /></label>
      </div>
      <p className="mt-1 text-2xs text-muted">
        “Keep free” leaves room in each 24 hours for the 7 pm alerts and QuizPe (they share the limit). 24 hours between batches lets the
        earlier batch leave the window.
      </p>
      <div className="mt-3 rounded-lg bg-shell p-3 text-xs text-body">
        <b className="text-ink">The plan:</b>
        <ul className="mt-1 list-disc pl-5">{plan.parts.map((p) => <li key={p}>{p}</li>)}</ul>
        {limit && <div className="mt-1 text-2xs text-muted">Right now: {count(limit.used)} of {count(limit.limit)} used in the last 24 hours. A batch never takes more than the room left.</div>}
      </div>
      {err && <Banner tone="wrong" className="mt-3">{err}</Banner>}
      <label className="mt-3 block">
        <span className="label">Type SEND to confirm</span>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="SEND" />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={create} disabled={typed !== 'SEND' || busy}>{busy ? 'Starting…' : `Start ${plan.batches} batch${plan.batches === 1 ? '' : 'es'}`}</button>
      </div>
    </Modal>
  );
}

const STATUS = {
  running: ['▶ Running', 'bg-good-50 text-good-700'],
  paused: ['⏸ Paused', 'bg-watch-50 text-watch-700'],
  done: ['✓ Done', 'bg-shell text-body'],
  cancelled: ['✕ Cancelled', 'bg-shell text-muted'],
};

/** The section listing every plan, with progress and controls. */
export function PlansSection({ canSend, refreshKey }) {
  const [d, setD] = useState(null);
  const load = useCallback(() => api.broadcastPlans().then(setD).catch(() => {}), []);
  useEffect(() => { load(); }, [load, refreshKey]);
  useAutoRefresh(load);
  if (!d || !d.rows.length) return null;
  const act = async (p, action) => {
    const ask = { pause: 'Pause this plan? No new batch starts until you resume it.', resume: 'Resume this plan?',
      cancel: 'Cancel this plan? No more batches will be sent. A batch already going out can be stopped in the list below.' }[action];
    if (!window.confirm(ask)) return;
    try { await api.broadcastPlanAction(p.id, action); snack({ pause: 'Paused', resume: 'Resumed', cancel: 'Cancelled' }[action]); load(); }
    catch (e) { snack(e.message, 'wrong'); }
  };
  return (
    <div className="card mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Broadcasts in batches</h2>
        <span className="text-2xs text-muted">WhatsApp limit now: {count(d.room.used)} of {count(d.room.limit)} used in the last 24 hours</span>
      </div>
      <div className="divide-y divide-line">
        {d.rows.map((p) => {
          const [label, tone] = STATUS[p.status] || [p.status, 'bg-shell text-body'];
          const pct = p.total ? Math.round((p.sent / p.total) * 100) : 0;
          return (
            <div key={p.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-sm text-ink">{p.template_name}</b>
                <span className="text-2xs text-muted">· {p.language} · plan #{p.id}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{label}</span>
                {canSend && (p.status === 'running' || p.status === 'paused') && (
                  <span className="ml-auto flex gap-1.5">
                    {p.status === 'running'
                      ? <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => act(p, 'pause')}>Pause</button>
                      : <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => act(p, 'resume')}>Resume</button>}
                    <button className="btn-quiet !px-2 !py-1 text-2xs text-wrong-700" onClick={() => act(p, 'cancel')}>Cancel</button>
                  </span>
                )}
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-shell" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted">
                <span><b className="text-ink">{count(p.sent)}</b> of {count(p.total)} reached ({pct}%)</span>
                {p.waiting > 0 && <span>{count(p.waiting)} sending now</span>}
                {p.left > 0 && <span>{count(p.left)} still to go</span>}
                {p.skipped > 0 && <span>{count(p.skipped)} skipped (STOP / blocked)</span>}
                {p.gave_up > 0 && <span className="text-wrong-700">{count(p.gave_up)} failed twice</span>}
                <span>{p.batches} batch{p.batches === 1 ? '' : 'es'} of up to {count(p.batch_size)} · every {p.gap_hours} h · {count(p.reserve)} kept free</span>
                {p.status === 'running' && p.left > 0 && <span>Next batch: <b className="text-ink">{dateTime(p.next_at)}</b></span>}
              </div>
              {p.last_note && <div className="mt-1 text-2xs text-body">{p.last_note}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
