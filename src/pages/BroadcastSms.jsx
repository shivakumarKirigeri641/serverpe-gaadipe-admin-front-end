import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSession, allowed } from '../lib/session';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { mobile as fmtMobile, dateTime, ago } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Chip, Empty, Failed, Modal, Spinner, Table, Pager, PAGE_SIZE } from '../components/ui.jsx';

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

/* ONE SMS (2026-10-13; the server checks the same, admin/smsBroadcast.js smsLength): 160
   characters of the GSM alphabet, or 70 once any other character is in (₹, emoji, Hindi). */
const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€';
function smsLength(text) {
  const s = [...String(text || '')];
  const odd = s.filter((c) => !GSM.includes(c) && !GSM_EXT.includes(c));
  if (odd.length) return { unicode: true, length: s.length, limit: 70, odd: [...new Set(odd)].join(' ') };
  return { unicode: false, length: s.reduce((n, c) => n + (GSM_EXT.includes(c) ? 2 : 1), 0), limit: 160 };
}
const FILTERS = [['all', 'Everyone listed'], ['not_recent', 'No broadcast SMS in 7 days'], ['paid', 'Paid customers'],
                 ['never_paid', 'Never paid'], ['monitoring', 'Monitoring active']];

export default function BroadcastSms() {
  const { can } = useSession();
  const canSend = allowed(can, 'settings');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  /* TWO KINDS (user, 2026-10-13: "send all 158 — put that option"): a SERVICE notice
     (DLT Service Implicit, a factual update) to everyone who agreed, or the PROMOTIONAL
     template to those who opted in to offers. */
  const [mode, setMode] = useState('service');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [vals, setVals] = useState(['', '', '']);
  const [chosen, setChosen] = useState(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [filter, q, mode]);
  useEffect(() => { setChosen(new Set()); setDone(null); setVals(['', '', '']); }, [mode]);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.smsBroadcast({ mode, filter, q })); } catch (e) { setError(e); }
  }, [mode, filter, q]);
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
  const size = useMemo(() => smsLength(preview), [preview]);
  const fits = !preview || size.length <= size.limit;
  const valsOk = vals.slice(0, n).every((v) => v.trim() && v.trim().length <= VAR_MAX) && fits;
  // The first thing stopping Send, said plainly — null when it may go.
  const blocked = !data ? 'loading' : !canSend ? 'your admin role needs the "settings" permission'
    : !t?.ready ? `the ${mode === 'service' ? 'service' : 'promotional'} template is not set up in Settings (${!t?.id ? `sms_tpl_${mode} — the DLT message id` : !t?.text ? `sms_tpl_${mode}_text — the approved wording` : mode === 'promo' ? 'sms_promo_sender_id — your 6-digit promotional header' : 'the sender id on the server'})`
    : vals.slice(0, n).some((v) => !v.trim()) ? `fill in all ${n} value${n === 1 ? '' : 's'}`
    : vals.slice(0, n).some((v) => v.trim().length > VAR_MAX) ? `a value is longer than ${VAR_MAX} characters`
    : !fits ? `the message is ${size.length} characters — one SMS holds ${size.limit}`
    : !chosen.size ? 'tick at least one customer (or "Select all")'
    : !data.left ? "today's limit is used up (Settings sms_promo_per_day)" : null;

  const send = async () => {
    setBusy(true);
    try {
      const out = await api.smsBroadcastSend({ mode, user_ids: [...chosen], vals: vals.slice(0, n) });
      setDone(out); setConfirm(false); setChosen(new Set()); await load();
    } catch (e) { setError(e); setConfirm(false); } finally { setBusy(false); }
  };
  const cancel = async (batch) => {
    if (!window.confirm('Cancel every SMS of this batch that has not gone yet?')) return;
    await api.smsBroadcastCancel(batch).catch(setError); await load();
  };

  return (
    <Shell title="SMS broadcast" subtitle="A service notice to everyone who agreed, or your promotional template to those who opted in to offers.">
      {/* Which kind of SMS */}
      <div className="mb-4 inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Kind of SMS">
        {[['service', '📢 Service notice — everyone who agreed'], ['promo', '🎁 Promotional — opted-in only']].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setMode(k)}
            className={`rounded-md px-3 py-1.5 text-sm ${mode === k ? 'bg-brand text-white font-semibold' : 'text-body hover:bg-shell'}`}>{l}</button>
        ))}
      </div>
      {error && <Failed error={error} onRetry={load} />}
      {!data && !error && <Spinner />}
      {data && (
        <div className="space-y-4">
          {/* 1. The template */}
          <div className="card p-4">
            <div className="text-sm font-semibold text-ink">1 · The template</div>
            <p className="mt-0.5 text-2xs text-muted">{mode === 'service'
              ? 'A DLT "Service Implicit" template — a plain update about the service (like a new WhatsApp number), no offer or price. It may go to every customer who agreed, DND included.'
              : 'Your DLT promotional template — offers and news. It goes only to customers who opted in to offers and newsletters, never to DND numbers.'}</p>
            {t.ready ? (
              <div className="mt-2 whitespace-pre-wrap rounded-lg bg-shell px-3 py-2 font-mono text-sm text-body">{t.text}</div>
            ) : mode === 'service' ? (
              <Banner tone="watch" className="mt-2">
                Not set up yet. In <b>Settings</b>, fill in: <b>sms_tpl_service</b> (the DLT message id of your approved Service Implicit
                template, from Fast2SMS) and <b>sms_tpl_service_text</b> (its wording exactly as approved, with any {'{#var#}'}).
                {!t.id ? ' · message id missing' : ''}{!t.text ? ' · wording missing' : ''}{!t.sender ? ' · sender id missing on the server' : ''}
              </Banner>
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
            <div className="text-sm font-semibold text-ink">{n ? `2 · The ${n} value${n === 1 ? '' : 's'}` : '2 · The message'}</div>
            <p className="mt-0.5 text-2xs text-muted">{n
              ? `The same for everyone in this batch. DLT allows about ${VAR_MAX} characters each.`
              : 'This template has no values to fill — everyone receives exactly the approved wording.'}</p>
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
            {preview && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs">
                <Chip tone={fits ? (size.length > size.limit - 10 ? 'watch' : 'good') : 'wrong'}>
                  {size.length} / {size.limit} characters · {fits ? 'one SMS' : `${size.length - size.limit} too many`}
                </Chip>
                {size.unicode && (
                  <span className={fits ? 'text-muted' : 'text-wrong-700'}>
                    Special character{size.odd.length > 1 ? 's' : ''} <b>{size.odd}</b> make{size.odd.length > 1 ? '' : 's'} this a Unicode SMS — only 70 characters fit.
                    Write <b>Rs</b> instead of <b>₹</b> to get 160.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 3. The people */}
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-ink">3 · Who</div>
              <span className="text-2xs text-muted">{mode === 'service'
                ? `All ${data.people.agreed} customers who agreed are listed`
                : `${data.people.opted} opted in of ${data.people.agreed} customers who agreed — only they are listed`}</span>
              {/* Everyone listed, on every page, in one tap (user, 2026-10-13: "send all 158 — put that option"). */}
              {rows.length > 0 && (
                <button type="button" className="btn-quiet !py-1 text-2xs" data-test="sms-select-all"
                  onClick={() => setChosen(allTicked ? new Set() : new Set(rows.map((r) => r.id)))}>
                  {allTicked ? 'Clear all' : `✓ Select all ${rows.length}`}
                </button>
              )}
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
                  <th className="px-3 py-2">Paid</th><th className="px-3 py-2">Opted in</th><th className="px-3 py-2">Last broadcast SMS</th><th className="px-3 py-2">Last seen</th>
                </tr>)}>
                {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => (
                  <tr key={r.id} className={`text-sm ${chosen.has(r.id) ? 'bg-brand/5' : ''}`} onClick={() => toggle(r.id)}>
                    <td className="px-3 py-2"><input type="checkbox" checked={chosen.has(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} /></td>
                    <td className="px-3 py-2">{r.name || '—'} {r.is_internal && <Chip tone="brand">you</Chip>}</td>
                    <td className="px-3 py-2 font-mono">{fmtMobile(r.mobile)}</td>
                    <td className="px-3 py-2">{r.vehicles}</td>
                    <td className="px-3 py-2">{r.paid ? <Chip tone="good">Paid</Chip> : '—'}</td>
                    <td className="px-3 py-2 text-2xs text-muted">{r.opted ? dateTime(r.promo_consent_at) : <span className="text-muted">no</span>}</td>
                    <td className="px-3 py-2 text-2xs text-muted">{r.last_promo_at ? ago(r.last_promo_at) : 'never'}</td>
                    <td className="px-3 py-2 text-2xs text-muted">{r.last_seen_at ? ago(r.last_seen_at) : '—'}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty>{mode === 'service' ? 'Nobody matches that.' : 'Nobody here has opted in to offers and newsletters yet.'}</Empty>}
            {/* A page at a time (2026-10-13); the header tick takes everyone who matches. */}
            <Pager page={page} total={rows.length} onPage={setPage} />
            {rows.length > PAGE_SIZE && <p className="mt-1 text-2xs text-muted">{rows.length} match · {chosen.size} ticked — the header tick takes all of them, not just this page.</p>}
          </div>

          {/* 4. Send */}
          <div className="card flex flex-wrap items-center gap-3 p-4">
            <div className="text-sm text-ink"><b>{chosen.size}</b> chosen · {data.left} left today</div>
            {done && <Banner tone="good" className="flex-1">Queued <b>{done.queued}</b> — sending {new Date(done.send_at) > new Date() ? `from ${dateTime(done.send_at)}` : 'now, a few a minute'}.{done.not_opted ? ` ${done.not_opted} left out (not opted in).` : ''}{done.over_cap ? ` ${done.over_cap} over today's limit.` : ''}</Banner>}
            <button className="btn-primary ml-auto" disabled={Boolean(blocked)}
              onClick={() => setConfirm(true)}>Send SMS to {chosen.size}</button>
            {/* Why Send is off, in words (user, 2026-10-13: "Send SMS button still disabled"). */}
            {blocked && <p className="w-full text-right text-2xs text-wrong-700" data-test="sms-why-off">Send is off: {blocked}</p>}
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
          <p className="mt-2 text-2xs text-muted">{mode === 'service' ? 'Service Implicit · usual sender' : 'Promotional route · each SMS is checked again for the opt-in'} · header {t.sender} · only 10 am – 9 pm IST · recorded in the audit trail.</p>
        </Modal>
      )}
    </Shell>
  );
}
