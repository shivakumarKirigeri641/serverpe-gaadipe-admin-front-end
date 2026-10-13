import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSession, allowed } from '../lib/session';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { mobile as fmtMobile, dateTime, ago } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Chip, Empty, Failed, Modal, Spinner, Table } from '../components/ui.jsx';

/**
 * SMS BROADCAST (user, 2026-10-13: "select the people and send them the 3-variable DLT
 * promotional SMS, for the 1 DLT template, from the admin panel"). Server:
 * admin/smsBroadcast.js.
 *
 *   1. The approved template, as Settings hold it (sms_tpl_promo, its wording
 *      sms_tpl_promo_text, the promotional header sms_promo_sender_id)
 *   2. The three values — the preview fills them in as each customer will read it
 *   3. Tick customers: only those who opted in to offers and newsletters are listed
 *   4. Send — queued, a few a minute, only 10 am – 9 pm IST; today's limit shown
 */
const VAR_MAX = 30;
const FILTERS = [['all', 'Everyone opted in'], ['not_recent', 'No promo SMS in 7 days'], ['paid', 'Paid customers'],
                 ['never_paid', 'Never paid'], ['monitoring', 'Monitoring active']];

export default function BroadcastSms() {
  const { can } = useSession();
  const canSend = allowed(can, 'settings');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [vals, setVals] = useState(['', '', '']);
  const [chosen, setChosen] = useState(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.smsBroadcast({ filter, q })); } catch (e) { setError(e); }
  }, [filter, q]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const t = data?.template;
  const n = t?.vars || 3;
  const preview = useMemo(() => {
    if (!t?.text) return '';
    let i = 0;
    return t.text.replace(/\{#var#\}/gi, () => (vals[i++]?.trim() || `[value ${i}]`));
  }, [t, vals]);
  const rows = data?.people?.rows || [];
  const allTicked = rows.length > 0 && rows.every((r) => chosen.has(r.id));
  const toggle = (id) => setChosen((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const valsOk = vals.slice(0, n).every((v) => v.trim() && v.trim().length <= VAR_MAX);

  const send = async () => {
    setBusy(true);
    try {
      const out = await api.smsBroadcastSend({ user_ids: [...chosen], vals: vals.slice(0, n) });
      setDone(out); setConfirm(false); setChosen(new Set()); await load();
    } catch (e) { setError(e); setConfirm(false); } finally { setBusy(false); }
  };
  const cancel = async (batch) => {
    if (!window.confirm('Cancel every SMS of this batch that has not gone yet?')) return;
    await api.smsBroadcastCancel(batch).catch(setError); await load();
  };

  return (
    <Shell title="SMS broadcast" subtitle="Your approved DLT promotional template, to customers who opted in to offers and newsletters.">
      {error && <Failed error={error} onRetry={load} />}
      {!data && !error && <Spinner />}
      {data && (
        <div className="space-y-4">
          {/* 1. The template */}
          <div className="card p-4">
            <div className="text-sm font-semibold text-ink">1 · The template</div>
            {t.ready ? (
              <div className="mt-2 whitespace-pre-wrap rounded-lg bg-shell px-3 py-2 font-mono text-sm text-body">{t.text}</div>
            ) : (
              <Banner tone="watch" className="mt-2">
                Not set up yet. In <b>Settings</b>, fill in: <b>sms_tpl_promo</b> (the DLT message id from Fast2SMS),{' '}
                <b>sms_tpl_promo_text</b> (the approved wording, with {'{#var#}'} three times) and <b>sms_promo_sender_id</b>{' '}
                (your 6-digit promotional header).{!t.id ? ' · message id missing' : ''}{!t.text ? ' · wording missing' : ''}{!t.sender ? ' · header missing' : ''}
              </Banner>
            )}
            <div className="mt-2 flex flex-wrap gap-2 text-2xs text-muted">
              <Chip tone={data.in_window ? 'good' : 'watch'}>{data.in_window ? 'Sending hours (10 am – 9 pm)' : 'Outside 10 am – 9 pm — a batch waits for 10 am'}</Chip>
              <Chip tone={data.left ? 'info' : 'wrong'}>Today {data.today} / {data.cap} · {data.left} left</Chip>
              <Chip tone="info">Header {t.sender || '—'}</Chip>
            </div>
          </div>

          {/* 2. The values */}
          <div className="card p-4">
            <div className="text-sm font-semibold text-ink">2 · The {n} values</div>
            <p className="mt-0.5 text-2xs text-muted">The same for everyone in this batch. DLT allows about {VAR_MAX} characters each.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {Array.from({ length: n }).map((_, i) => (
                <label key={i} className="block text-2xs text-muted">Value {i + 1}
                  <input className="input mt-1" value={vals[i] || ''} maxLength={VAR_MAX + 10}
                    onChange={(e) => setVals((v) => { const x = [...v]; x[i] = e.target.value; return x; })} />
                  <span className={(vals[i] || '').trim().length > VAR_MAX ? 'text-wrong-700' : ''}>{(vals[i] || '').trim().length}/{VAR_MAX}</span>
                </label>
              ))}
            </div>
            {preview && <div className="mt-3 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"><span className="text-2xs text-muted">Each customer reads: </span>{preview}</div>}
          </div>

          {/* 3. The people */}
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-ink">3 · Who</div>
              <span className="text-2xs text-muted">{data.people.opted} opted in of {data.people.agreed} customers who agreed — only they are listed</span>
              <select className="input !w-auto !py-1.5 ml-auto text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
                {FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <input className="input !w-48 !py-1.5 text-sm" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {rows.length ? (
              <Table className="mt-3" head={(
                <tr className="text-left text-2xs text-muted">
                  <th className="px-3 py-2"><input type="checkbox" checked={allTicked}
                    onChange={() => setChosen(allTicked ? new Set() : new Set(rows.map((r) => r.id)))} /></th>
                  <th className="px-3 py-2">Customer</th><th className="px-3 py-2">Mobile</th><th className="px-3 py-2">Vehicles</th>
                  <th className="px-3 py-2">Paid</th><th className="px-3 py-2">Opted in</th><th className="px-3 py-2">Last promo SMS</th><th className="px-3 py-2">Last seen</th>
                </tr>)}>
                {rows.map((r) => (
                  <tr key={r.id} className={`text-sm ${chosen.has(r.id) ? 'bg-brand/5' : ''}`} onClick={() => toggle(r.id)}>
                    <td className="px-3 py-2"><input type="checkbox" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} /></td>
                    <td className="px-3 py-2">{r.name || '—'} {r.is_internal && <Chip tone="brand">you</Chip>}</td>
                    <td className="px-3 py-2 font-mono">{fmtMobile(r.mobile)}</td>
                    <td className="px-3 py-2">{r.vehicles}</td>
                    <td className="px-3 py-2">{r.paid ? <Chip tone="good">Paid</Chip> : '—'}</td>
                    <td className="px-3 py-2 text-2xs text-muted">{dateTime(r.promo_consent_at)}</td>
                    <td className="px-3 py-2 text-2xs text-muted">{r.last_promo_at ? ago(r.last_promo_at) : 'never'}</td>
                    <td className="px-3 py-2 text-2xs text-muted">{r.last_seen_at ? ago(r.last_seen_at) : '—'}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty>Nobody here has opted in to offers and newsletters yet.</Empty>}
          </div>

          {/* 4. Send */}
          <div className="card flex flex-wrap items-center gap-3 p-4">
            <div className="text-sm text-ink"><b>{chosen.size}</b> chosen · {data.left} left today</div>
            {done && <Banner tone="good" className="flex-1">Queued <b>{done.queued}</b> — sending {new Date(done.send_at) > new Date() ? `from ${dateTime(done.send_at)}` : 'now, a few a minute'}.{done.not_opted ? ` ${done.not_opted} left out (not opted in).` : ''}{done.over_cap ? ` ${done.over_cap} over today's limit.` : ''}</Banner>}
            <button className="btn-primary ml-auto" disabled={!canSend || !t.ready || !chosen.size || !valsOk || !data.left}
              onClick={() => setConfirm(true)}>Send SMS to {chosen.size}</button>
          </div>

          {/* Batches */}
          <div className="card p-4">
            <div className="text-sm font-semibold text-ink">Recent batches</div>
            {data.batches.length ? (
              <Table className="mt-2" head={(
                <tr className="text-left text-2xs text-muted"><th className="px-3 py-2">When</th><th className="px-3 py-2">Values</th>
                  <th className="px-3 py-2">Sent</th><th className="px-3 py-2">Waiting</th><th className="px-3 py-2">Skipped / failed</th><th className="px-3 py-2">By</th><th className="px-3 py-2" /></tr>)}>
                {data.batches.map((b) => (
                  <tr key={b.batch} className="text-sm">
                    <td className="px-3 py-2 text-2xs">{dateTime(b.created_at)}</td>
                    <td className="px-3 py-2 text-2xs">{(b.vals || []).join(' · ')}</td>
                    <td className="px-3 py-2">{b.sent} / {b.total}</td>
                    <td className="px-3 py-2">{b.queued}</td>
                    <td className="px-3 py-2">{b.skipped} / {b.failed}{b.cancelled ? ` · ${b.cancelled} cancelled` : ''}</td>
                    <td className="px-3 py-2 text-2xs">{b.admin || '—'}</td>
                    <td className="px-3 py-2">{b.queued > 0 && canSend && <button className="btn-quiet !py-1 text-2xs" onClick={() => cancel(b.batch)}>Cancel rest</button>}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty>No promotional SMS sent yet.</Empty>}
          </div>
        </div>
      )}
      {confirm && (
        <Modal title={`Send to ${chosen.size} customer${chosen.size === 1 ? '' : 's'}?`} onClose={() => setConfirm(false)} busy={busy}
          footer={<><button className="btn-quiet" onClick={() => setConfirm(false)}>Back</button>
                   <button className="btn-primary" disabled={busy} onClick={send}>{busy ? 'Queuing…' : 'Yes, send'}</button></>}>
          <p className="text-sm text-body">Each of them receives:</p>
          <div className="mt-2 rounded-lg bg-shell px-3 py-2 text-sm text-ink">{preview}</div>
          <p className="mt-2 text-2xs text-muted">Promotional route · header {t.sender} · only 10 am – 9 pm IST · each SMS is checked again for the opt-in before it goes · recorded in the audit trail.</p>
        </Modal>
      )}
    </Shell>
  );
}
