import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import Shell from '../../components/Shell.jsx';
import { Banner, Chip, Empty, Failed, Modal, Skeleton, Table } from '../../components/ui.jsx';
import { ago, date, mobile as fmtMobile, plate } from '../../lib/format';

/**
 * MONITORING UPDATES (user, 2026-10-15: "for selected paid users, I can trigger the daily
 * monitoring template"). Everyone whose monitoring is running, with when their last update went
 * and how WhatsApp would carry one now. Tick and send: the evening job's own update
 * (admin/monitoringSend.js) — once a day per customer, never to anyone who did not agree or said
 * STOP, never retried, 9 am – 9 pm only, a few seconds apart.
 */
const HOW = {
  free: ['💬 Free message', 'good', 'Their 24-hour window is open — a free message, not counted toward Meta’s limit.'],
  template: ['📨 Template', 'watch', 'Window closed — goes as the approved template, which counts toward Meta’s daily limit.'],
  none: ['— Not on WhatsApp', 'info', ''],
};

export default function MonitoringSend() {
  const { can } = useSession();
  const canSend = allowed(can, 'settings');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [chosen, setChosen] = useState(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.monitoringCustomers()); } catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Follow a running send until it is done, then refresh the list.
  useEffect(() => {
    if (!job || job.done) return undefined;
    const t = setInterval(async () => {
      const j = await api.monitoringSendStatus(job.id).catch(() => null);
      if (j) { setJob(j); if (j.done) load(); }
    }, 2500);
    return () => clearInterval(t);
  }, [job, load]);

  const rows = data?.rows || [];
  // Who can be ticked: not already updated today, and reachable some way.
  const tickable = (r) => !r.done_today && (r.whatsapp.how !== 'none' || r.email_ok);
  const ready = useMemo(() => rows.filter(tickable), [rows]);
  const picked = rows.filter((r) => chosen.has(r.id));
  const templates = picked.filter((r) => r.whatsapp.how === 'template').length;
  const toggle = (id) => setChosen((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const allOn = ready.length > 0 && ready.every((r) => chosen.has(r.id));

  const send = async () => {
    setBusy(true);
    try { setJob(await api.monitoringSend([...chosen])); setChosen(new Set()); setConfirm(false); }
    catch (e) { setError(e); setConfirm(false); } finally { setBusy(false); }
  };

  return (
    <Shell title="Monitoring updates" subtitle="Send today's monitoring update now to chosen paid customers — once a day each.">
      {error && <Failed error={error} onRetry={load} />}
      {!data && !error && <div className="card"><Skeleton rows={6} cols={5} /></div>}
      {data && (
        <div className="space-y-4">
          {!data.in_hours && <Banner tone="watch">Outside 9 am – 9 pm (IST): updates can be sent again from 9 am.</Banner>}
          {job && (
            <div className="card p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <b className="text-ink">{job.done ? 'Done' : 'Sending…'}</b>
                <span className="text-muted">{job.sent} sent · {job.skipped} skipped · {job.failed} not delivered · of {job.total}</span>
                {!job.done && canSend && <button className="btn-quiet ml-auto !py-1 text-2xs" onClick={async () => setJob(await api.monitoringSendStop(job.id))}>Stop</button>}
              </div>
              <ul className="mt-2 grid gap-1 text-2xs sm:grid-cols-2">
                {job.people.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Chip tone={p.status === 'sent' ? 'good' : p.status === 'waiting' ? 'info' : p.status === 'skipped' || p.status === 'not sent' ? 'watch' : 'wrong'}>{p.status}</Chip>
                    <span className="text-ink">{p.name || 'Customer'} ••{p.tail}</span>
                    {p.note && <span className="truncate text-muted">{p.note}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-ink">{rows.length} customer{rows.length === 1 ? '' : 's'} with monitoring running</div>
              <span className="text-2xs text-muted">{ready.length} can get an update today</span>
              {ready.length > 0 && (
                <button type="button" className="btn-quiet !py-1 text-2xs" onClick={() => setChosen(allOn ? new Set() : new Set(ready.map((r) => r.id)))}>
                  {allOn ? 'Clear all' : `✓ Select all ${ready.length}`}
                </button>
              )}
              <button className="btn-primary ml-auto" disabled={!canSend || !chosen.size || !data.in_hours || (job && !job.done)}
                onClick={() => setConfirm(true)}>Send update to {chosen.size}</button>
            </div>
            {!canSend && <p className="mt-1 text-2xs text-muted">Sending needs the “settings” permission.</p>}
            {rows.length ? (
              <Table className="mt-3" head={(
                <tr className="text-left text-2xs text-muted">
                  <th className="px-3 py-2" /><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Vehicles</th>
                  <th className="px-3 py-2">Monitoring until</th><th className="px-3 py-2">Last update</th>
                  <th className="px-3 py-2">WhatsApp now</th><th className="px-3 py-2">Email</th>
                </tr>)}>
                {rows.map((r) => {
                  const can = tickable(r);
                  const [label, tone, note] = HOW[r.whatsapp.how];
                  return (
                    <tr key={r.id} className={`text-sm ${chosen.has(r.id) ? 'bg-brand/5' : ''} ${can ? 'cursor-pointer' : 'opacity-60'}`} onClick={() => can && toggle(r.id)}>
                      <td className="px-3 py-2"><input type="checkbox" disabled={!can} checked={chosen.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} /></td>
                      <td className="px-3 py-2">{r.name || '—'} {r.internal && <Chip tone="brand">you</Chip>}<div className="font-mono text-2xs text-muted">{fmtMobile(r.mobile)}</div></td>
                      <td className="px-3 py-2 font-mono text-2xs">{r.vehicles.map(plate).join(', ')}</td>
                      <td className="px-3 py-2 text-2xs">{r.until ? date(r.until) : '—'}</td>
                      <td className="px-3 py-2 text-2xs">{r.done_today ? <Chip tone="good">Sent today</Chip> : r.last_sent ? ago(r.last_sent) : 'never'}</td>
                      <td className="px-3 py-2" title={note || r.whatsapp.why || ''}>
                        <Chip tone={tone}>{label}</Chip>
                        {r.whatsapp.why && <div className="text-2xs text-muted">{r.whatsapp.why}</div>}
                      </td>
                      <td className="px-3 py-2 text-2xs">{r.email_ok ? '✉ confirmed' : '—'}</td>
                    </tr>
                  );
                })}
              </Table>
            ) : <Empty>No customer has monitoring running right now.</Empty>}
            <p className="mt-2 text-2xs text-muted">
              The same update as the evening one: every vehicle they monitor, WhatsApp first, plus email and phone notification.
              Once a day per customer, whoever sends it — a customer updated today (here or by the evening job) cannot be ticked.
            </p>
          </div>
        </div>
      )}
      {confirm && (
        <Modal title={`Send today's update to ${chosen.size} customer${chosen.size === 1 ? '' : 's'}?`} onClose={() => setConfirm(false)} busy={busy}
          footer={<><button className="btn-quiet" onClick={() => setConfirm(false)}>Back</button>
            <button className="btn-primary" disabled={busy} onClick={send}>{busy ? 'Starting…' : 'Yes, send'}</button></>}>
          <p className="text-sm text-body">
            {templates
              ? <><b>{templates}</b> will get the WhatsApp <b>template</b> (their window is closed — counts toward Meta’s daily limit); the rest a free message or email.</>
              : 'All of them get a free WhatsApp message or email — no template.'}
          </p>
          <p className="mt-2 text-2xs text-muted">One at a time, a few seconds apart. Their evening update today is then already done. Recorded in the audit trail.</p>
        </Modal>
      )}
    </Shell>
  );
}
