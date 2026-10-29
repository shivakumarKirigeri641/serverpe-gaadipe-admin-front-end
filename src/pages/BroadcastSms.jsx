import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSession, allowed } from '../lib/session';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { mobile as fmtMobile, dateTime, ago } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Chip, Empty, Failed, Field, Modal, Spinner, Table, Pager, PAGE_SIZE } from '../components/ui.jsx';

/**
 * SMS BROADCAST (user, 2026-10-13: "select the people and send them the 3-variable DLT
 * promotional SMS, for the 1 DLT template, from the admin panel"). Server:
 * admin/smsBroadcast.js.
 *
 *   1. Pick an approved template from the list (user, 2026-10-15: "one selectable SMS
 *      template … rather than keep on typing the template id, sender id"). Each carries its
 *      kind, DLT message id, wording and header; add or change them here (migration 187).
 *   2. Its values, 0 to 5 — the preview fills them in as each customer will read it
 *   3. Tick customers: a promotional template lists only those who opted in to offers
 *   4. Send — queued, a few a minute, only 10 am – 9 pm IST; today's limit shown
 */
const VAR_MAX = 30;
const KIND = {
  service: { icon: '📢', word: 'Service notice', who: 'everyone who agreed', tone: 'brand' },
  promo: { icon: '🎁', word: 'Promotional', who: 'opted-in only, 10 am – 9 pm', tone: 'watch' },
};
/* A value's slot as DLT writes it: {#var#} or typed — {#alphanumeric#}, {#urlott#}, {#numeric#} … (2026-10-15). */
const SLOT = /\{#[a-z_]+#\}/gi;
const KIND_WORD = { urlott: 'a web link, e.g. https://gaadipe.in', url: 'a web link', numeric: 'digits only', alphanumeric: 'letters and digits', cbn: 'a phone number', email: 'an email' };
/* What each value fills, read from the words just before its slot: "…Reason: {#alphanumeric#}" → "after “Reason:” · letters and digits". */
const varHints = (text) => {
  const s = String(text || '');
  const slots = s.match(SLOT) || [];
  return s.split(SLOT).slice(0, -1).map((p, i) => {
    const w = p.replace(/\s+/g, ' ').trim().split(' ').slice(-3).join(' ');
    const kind = KIND_WORD[slots[i].slice(2, -2).toLowerCase()];
    return `${w ? `after “${w}”` : 'at the start'}${kind ? ` · ${kind}` : ''}`;
  });
};

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
                 ['never_paid', 'Never paid'], ['monitoring', 'Monitoring active'],
                 ['before_wa', 'Joined before 23 Oct · no SMS in 7 days']];

export default function BroadcastSms() {
  const { can } = useSession();
  const canSend = allowed(can, 'settings');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  /* THE TEMPLATE PICKED (2026-10-15). Its kind decides who is listed: a SERVICE notice (DLT
     Service Implicit, a factual update) to everyone who agreed, a PROMOTIONAL one to those
     who opted in to offers. Empty = the server's first template. */
  const [tplKey, setTplKey] = useState('');
  const [editing, setEditing] = useState(null);       // a template being added ({}) or changed
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [vals, setVals] = useState(['', '', '', '', '']);
  const [chosen, setChosen] = useState(() => new Set());
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const [page, setPage] = useState(1);
  const mode = data?.mode || 'service';
  useEffect(() => { setPage(1); }, [filter, q, mode]);
  useEffect(() => { setDone(null); setVals(['', '', '', '', '']); }, [tplKey]);
  /* A web-link slot ({#urlott#}) starts as the site's address — one value fewer to type (2026-10-15). */
  useEffect(() => {
    const slots = String(data?.template?.text || '').match(SLOT) || [];
    setVals((v) => v.map((x, i) => (!x && /url/i.test(slots[i] || '') ? 'https://gaadipe.in' : x)));
  }, [data?.template?.key, tplKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setChosen(new Set()); }, [mode]);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.smsBroadcast({ template: tplKey, filter, q })); } catch (e) { setError(e); }
  }, [tplKey, filter, q]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const t = data?.template;
  const n = t?.vars ?? 0;
  const hints = useMemo(() => varHints(t?.text), [t]);
  const preview = useMemo(() => {
    if (!t?.text) return '';
    let i = 0;
    return t.text.replace(SLOT, () => (vals[i++]?.trim() || `[value ${i}]`));
  }, [t, vals]);
  const rows = data?.people?.rows || [];
  const allTicked = rows.length > 0 && rows.every((r) => chosen.has(r.id));
  const toggle = (id) => setChosen((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const size = useMemo(() => smsLength(preview), [preview]);
  const fits = !preview || size.length <= size.limit;
  const valsOk = vals.slice(0, n).every((v) => v.trim() && v.trim().length <= VAR_MAX) && fits;
  // The first thing stopping Send, said plainly — null when it may go.
  const blocked = !data ? 'loading' : !canSend ? 'your admin role needs the "settings" permission'
    : !t ? 'add a template first (＋ Add template)'
    : !t.ready ? (mode === 'promo' ? 'this promotional template has no header — edit it and add your 6-digit promotional header' : 'no sender id — edit the template and add its header')
    : vals.slice(0, n).some((v) => !v.trim()) ? `fill in all ${n} value${n === 1 ? '' : 's'}`
    : vals.slice(0, n).some((v) => v.trim().length > VAR_MAX) ? `a value is longer than ${VAR_MAX} characters`
    : !fits ? `the message is ${size.length} characters — one SMS holds ${size.limit}`
    : !chosen.size ? 'tick at least one customer (or "Select all")'
    : !data.left ? "today's limit is used up (Settings sms_promo_per_day)" : null;

  const send = async () => {
    setBusy(true);
    try {
      const out = await api.smsBroadcastSend({ template: t.key, user_ids: [...chosen], vals: vals.slice(0, n) });
      setDone(out); setConfirm(false); setChosen(new Set()); await load();
    } catch (e) { setError(e); setConfirm(false); } finally { setBusy(false); }
  };
  const cancel = async (batch) => {
    if (!window.confirm('Cancel every SMS of this batch that has not gone yet?')) return;
    await api.smsBroadcastCancel(batch).catch(setError); await load();
  };

  return (
    <Shell title="SMS broadcast" subtitle="Pick an approved template, fill its values, tick the customers.">
      {error && <Failed error={error} onRetry={load} />}
      {!data && !error && <Spinner />}
      {data && (
        <div className="space-y-4">
          {/* 1. The template — chosen from the list, never typed (2026-10-15). */}
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-ink">1 · Choose the template</div>
              <span className="text-2xs text-muted">{data.templates.length} approved template{data.templates.length === 1 ? '' : 's'}</span>
              {canSend && <button type="button" className="btn-quiet ml-auto !py-1 text-2xs" onClick={() => setEditing({ kind: 'service' })}>＋ Add template</button>}
            </div>
            {!data.templates.length ? (
              <Banner tone="watch" className="mt-2">No template yet. Tap <b>＋ Add template</b> and enter its name, kind, DLT message id and the approved wording.</Banner>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="SMS template">
                {data.templates.map((x) => {
                  const on = t?.key === x.key;
                  const k = KIND[x.mode];
                  return (
                    <button key={x.key} type="button" role="radio" aria-checked={on} onClick={() => setTplKey(x.key)} data-test="sms-template"
                      className={`rounded-xl border p-3 text-left transition ${on ? 'border-brand bg-brand/5 ring-2 ring-brand/30' : 'border-line bg-white hover:bg-shell/60'}`}>
                      <div className="flex items-center gap-2">
                        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${on ? 'border-brand' : 'border-line'}`}>{on && <span className="h-2 w-2 rounded-full bg-brand" />}</span>
                        <b className="truncate text-sm text-ink">{x.name}</b>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <Chip tone={k.tone}>{k.icon} {k.word}</Chip>
                        <Chip>{x.vars ? `${x.vars} value${x.vars === 1 ? '' : 's'}` : 'no values'}</Chip>
                        {!x.ready && <Chip tone="wrong">no header</Chip>}
                      </div>
                      <div className="mt-1.5 line-clamp-2 text-2xs text-muted">{x.text}</div>
                    </button>
                  );
                })}
              </div>
            )}
            {t && (
              <>
                <p className="mt-3 text-2xs text-muted">{mode === 'service'
                  ? 'A DLT "Service Implicit" template — a plain update about the service, no offer or price. It may go to every customer who agreed, DND included.'
                  : 'A DLT promotional template — offers and news. It goes only to customers who opted in to offers and newsletters, never to DND numbers.'}</p>
                <div className="mt-1.5 whitespace-pre-wrap rounded-lg bg-shell px-3 py-2 font-mono text-sm text-body">{t.text}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-muted">
                  <Chip tone={data.in_window ? 'good' : 'watch'}>{data.in_window ? 'Sending hours (10 am – 9 pm)' : 'Outside 10 am – 9 pm — a batch waits for 10 am'}</Chip>
                  <Chip tone={data.left ? 'info' : 'wrong'}>Today {data.today} / {data.cap} · {data.left} left</Chip>
                  <Chip tone={t.sender ? 'info' : 'wrong'}>Header {t.sender || 'missing'}{t.own_sender ? '' : ' (usual)'}</Chip>
                  <Chip>DLT id {t.id}</Chip>
                  {canSend && <button type="button" className="text-brand hover:underline" onClick={() => setEditing({ ...t, kind: t.mode, dlt_id: t.id, body: t.text, sender: t.own_sender || '' })}>Edit</button>}
                  {canSend && <button type="button" className="text-wrong-700 hover:underline" onClick={async () => {
                    if (!window.confirm(`Take “${t.name}” off the list? Batches already sent keep their record.`)) return;
                    await api.smsTemplateRemove(t.key).catch(setError); setTplKey(''); await load();
                  }}>Remove</button>}
                </div>
              </>
            )}
          </div>

          {/* 2. The values */}
          {t && <div className="card p-4">
            <div className="text-sm font-semibold text-ink">{n ? `2 · The ${n} value${n === 1 ? '' : 's'}` : '2 · The message'}</div>
            <p className="mt-0.5 text-2xs text-muted">{n
              ? `The same for everyone in this batch. DLT allows about ${VAR_MAX} characters each.`
              : 'This template has no values to fill — everyone receives exactly the approved wording.'}</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {Array.from({ length: n }).map((_, i) => (
                <label key={`${t?.key}-${i}`} className="block text-2xs text-muted">Value {i + 1} <span className="text-muted/80">· {hints[i]}</span>
                  <input className="input mt-1" value={vals[i] || ''} maxLength={VAR_MAX + 10}
                    onChange={(e) => setVals((v) => { const x = [...v]; x[i] = e.target.value; return x; })} />
                  <span className={(vals[i] || '').trim().length > VAR_MAX ? 'text-wrong-700' : ''}>{(vals[i] || '').trim().length}/{VAR_MAX}</span>
                </label>
              ))}
            </div>
            {preview && <div className="mt-3 whitespace-pre-wrap rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"><span className="text-2xs text-muted">Each customer reads: </span>{preview}</div>}
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
          </div>}

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
                <tr className="text-left text-2xs text-muted"><th className="px-3 py-2">When</th><th className="px-3 py-2">Template</th><th className="px-3 py-2">Values</th>
                  <th className="px-3 py-2">Sent</th><th className="px-3 py-2">Waiting</th><th className="px-3 py-2">Skipped / failed</th><th className="px-3 py-2">By</th><th className="px-3 py-2" /></tr>)}>
                {data.batches.map((b) => (
                  <tr key={b.batch} className="text-sm">
                    <td className="px-3 py-2 text-2xs">{dateTime(b.created_at)}</td>
                    <td className="px-3 py-2 text-2xs">{b.template || (b.kind === 'promo' ? 'Promotional' : 'Service notice')}</td>
                    <td className="px-3 py-2 text-2xs">{(b.vals || []).join(' · ') || '—'}</td>
                    <td className="px-3 py-2">{b.sent} / {b.total}</td>
                    <td className="px-3 py-2">{b.queued}</td>
                    <td className="px-3 py-2">{b.skipped} / {b.failed}{b.cancelled ? ` · ${b.cancelled} cancelled` : ''}</td>
                    <td className="px-3 py-2 text-2xs">{b.admin || '—'}</td>
                    <td className="px-3 py-2">{b.queued > 0 && canSend && <button className="btn-quiet !py-1 text-2xs" onClick={() => cancel(b.batch)}>Cancel rest</button>}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty>No broadcast SMS sent yet.</Empty>}
          </div>
        </div>
      )}
      {confirm && (
        <Modal title={`Send to ${chosen.size} customer${chosen.size === 1 ? '' : 's'}?`} onClose={() => setConfirm(false)} busy={busy}
          footer={<><button className="btn-quiet" onClick={() => setConfirm(false)}>Back</button>
                   <button className="btn-primary" disabled={busy} onClick={send}>{busy ? 'Queuing…' : 'Yes, send'}</button></>}>
          <p className="text-sm text-body">Template <b>{t.name}</b> — each of them receives:</p>
          <div className="mt-2 rounded-lg bg-shell px-3 py-2 text-sm text-ink">{preview}</div>
          <p className="mt-2 text-2xs text-muted">{mode === 'service' ? 'Service Implicit' : 'Promotional route · each SMS is checked again for the opt-in'} · header {t.sender} · only 10 am – 9 pm IST · recorded in the audit trail.</p>
        </Modal>
      )}
      {editing && (
        <TemplateDialog value={editing} onClose={() => setEditing(null)}
          onSaved={async (saved) => { setEditing(null); setTplKey(saved.key); await load(); }} />
      )}
    </Shell>
  );
}

/* Add or change one approved template (2026-10-15). Entered once; chosen from the list after. */
function TemplateDialog({ value, onClose, onSaved }) {
  const [f, setF] = useState({ key: value.key || '', name: value.name || '', kind: value.kind || 'service',
    dlt_id: value.dlt_id || '', body: value.body || '', sender: value.sender || '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const put = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const vars = (f.body.match(SLOT) || []).length;
  const save = async () => {
    setBusy(true); setErr(null);
    try { const out = await api.smsTemplateSave(f); onSaved(out.template); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={f.key ? 'Change template' : 'Add an approved template'} subtitle="Exactly as DLT / Fast2SMS approved it" onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !f.name.trim() || !f.dlt_id.trim() || !f.body.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="space-y-3">
        <Field label="Name — for you, in the list"><input className="input" value={f.name} maxLength={60} onChange={put('name')} placeholder="WhatsApp back, update email" /></Field>
        <Field label="Kind">
          <select className="input" value={f.kind} onChange={put('kind')}>
            <option value="service">📢 Service notice (Service Implicit) — everyone who agreed</option>
            <option value="promo">🎁 Promotional — opted-in only, 10 am – 9 pm</option>
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="DLT message id (Fast2SMS)"><input className="input font-mono" value={f.dlt_id} onChange={put('dlt_id')} inputMode="numeric" placeholder="198765" /></Field>
          <Field label="Header / sender id — optional"><input className="input font-mono uppercase" value={f.sender} maxLength={6} onChange={put('sender')}
            placeholder={f.kind === 'promo' ? 'Settings header' : 'usual header'} /></Field>
        </div>
        <Field label="Approved wording — exactly as DLT shows it, with its {#…#} slots">
          <textarea className="input min-h-[110px] font-mono text-sm" value={f.body} maxLength={500} onChange={put('body')}
            placeholder="Dear customer, GaadiPe is back on WhatsApp at {#var#}. Update email at {#var#} - GaadiPe" />
        </Field>
        <p className="text-2xs text-muted">{vars} value{vars === 1 ? '' : 's'} to fill when sending{vars > 5 ? ' — at most 5' : ''}. Empty header: a service notice goes from the usual header, a promotional one from Settings <b>sms_promo_sender_id</b>.</p>
        {err && <Banner tone="wrong">{err}</Banner>}
      </div>
    </Modal>
  );
}
