import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { useSession, allowed } from '../lib/session';
import { mobile as fmtMobile, dateTime, count } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Chip, Empty, Failed, Modal, Spinner, Stat, Table } from '../components/ui.jsx';

/**
 * BROADCAST (user, 2026-09-23).
 *
 * Nobody on a broadcast list has messaged GaadiPe in the last 24 hours, so this
 * screen sends APPROVED TEMPLATES and nothing else. The list of templates comes
 * from Meta itself, so a name that would be rejected cannot be chosen here.
 *
 *   1. Pick the template — the body is shown exactly as Meta approved it
 *   2. Say how each {{n}} is filled: their first name, the vehicle they last
 *      checked, or text you type
 *   3. Tick the customers (the sign-in data), preview what each will read,
 *      then send — typed SEND, queued, a few a minute
 *
 * TEST MODE IS THE GATEWAY'S, NOT THIS SCREEN'S. While
 * WHATSAPP_ALLOWED_RECEPIENTS holds numbers, every other recipient is recorded
 * as skipped — so a broadcast cannot escape while you are still trying it.
 */
const TONE = { sent: 'good', pending: 'watch', failed: 'wrong', skipped: 'info' };

export default function Broadcast() {
  const { can } = useSession();
  const canSend = allowed(can, 'settings');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('checked');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    api.broadcasts({ filter, q: q || undefined }).then(setData).catch(setError);
  }, [filter, q]);
  useEffect(load, [load]);

  return (
    <Shell title="Broadcast" subtitle="Send an approved WhatsApp template to customers who signed in.">
      {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <>
          {!data.whatsapp_enabled && (
            <Banner tone="watch">
              <b>WhatsApp is switched off.</b> Nothing can be broadcast until WHATSAPP_ENABLED=1 is set on the
              gateway and it is restarted. You can still choose a template and a list here.
            </Banner>
          )}
          {data.test_mode?.length > 0 && (
            <Banner tone="info" className="mt-3">
              <b>Test mode.</b> Only {data.test_mode.map(fmtMobile).join(', ')} will actually receive a message —
              everyone else is recorded as skipped. Clear WHATSAPP_ALLOWED_RECEPIENTS to go live.
            </Banner>
          )}

          {canSend
            ? <Compose data={data} filter={filter} setFilter={setFilter} q={q} setQ={setQ} onQueued={load} />
            : <Banner tone="info" className="mt-3">Your account cannot send broadcasts.</Banner>}

          <Sent rows={data.broadcasts} onChange={load} canSend={canSend} />
        </>
      )}
    </Shell>
  );
}

/* ───────────────────────────────────────────────────────── composing ── */

function Compose({ data, filter, setFilter, q, setQ, onQueued }) {
  const templates = data.templates?.templates || [];
  const [name, setName] = useState('');
  const [lang, setLang] = useState('');
  const [vars, setVars] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const tpl = useMemo(
    () => templates.find((t) => t.name === name && t.language === lang) || null,
    [templates, name, lang]);

  /*
   * WHAT FILLS THE BLANKS IS PER TEMPLATE, NOT A HOUSE RULE. The server
   * suggests a mapping only for a template it knows — one named in KNOWN, or
   * one broadcast before. Every other template starts blank, because a {{1}}
   * that means an amount must never be silently filled with somebody's name.
   */
  useEffect(() => {
    if (!tpl) { setVars([]); return; }
    const suggested = (data.defaults || {})[`${tpl.name}|${tpl.language}`];
    setVars(tpl.variables.map((_, i) => (suggested?.[i] ?? '')));
    setPreview(null);
  }, [tpl, data.defaults]);

  const rows = data.recipients?.rows || [];
  const fields = data.recipients?.fields || {};
  const chosen = rows.filter((r) => picked.has(r.mobile));
  const toggle = (m) => setPicked((s) => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n; });
  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.mobile));

  const body = () => ({
    template_name: name, language: lang, variables: vars,
    mobiles: chosen.map((r) => r.mobile), note,
  });

  const doPreview = async () => {
    setBusy(true); setErr(null);
    try { setPreview(await api.previewBroadcast(body())); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const out = await api.sendBroadcast({ ...body(), confirm: 'SEND' });
      if (!out.ok) { setErr(out.message || 'Could not queue it.'); return; }
      setConfirming(false); setPicked(new Set()); setPreview(null); setNote('');
      onQueued();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!data.templates?.ok) {
    return (
      <Banner tone="wrong" className="mt-4">
        <b>Could not read your templates.</b> {data.templates?.message || 'Unknown error.'}
      </Banner>
    );
  }

  return (
    <div className="card mt-4 p-4">
      <div className="text-sm font-semibold text-ink">1 · The template</div>
      <p className="mt-0.5 text-2xs text-muted">
        {data.templates.source === 'stored'
          ? 'Recorded by GaadiPe. Meta decides whether a template may actually be sent — nothing here is sendable until it says APPROVED.'
          : 'Read live from your WhatsApp Business account. Only APPROVED templates with a text (or no) header can be sent from here.'}
      </p>
      {/* Meta unreachable: say so plainly rather than showing an empty list. */}
      {data.templates.warning && <Banner tone="watch" className="mt-2">{data.templates.warning}</Banner>}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Template</span>
          <select className="input" value={`${name}|${lang}`}
            onChange={(e) => { const [n, l] = e.target.value.split('|'); setName(n); setLang(l); }}>
            <option value="|">Choose a template…</option>
            {templates.map((t) => (
              /* Any template can be SELECTED — you have to open one to read it,
                 and to record Meta's decision about it. Sending an unapproved
                 one is refused by the server, which is where it belongs. */
              <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                {t.name} · {t.language} {t.sendable ? '' : `· ${t.status}`}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Note to yourself (optional)</span>
          <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)}
            placeholder="Launch message to the 23 who never paid" />
        </label>
      </div>

      {tpl && (
        <>
          {/* The whole message as it will arrive: header, body, footer. */}
          <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-line bg-shell p-3 text-2xs text-body">
{tpl.header_text ? `${tpl.header_text}\n\n` : ''}{tpl.body}{tpl.footer ? `\n\n— ${tpl.footer}` : ''}</pre>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip tone={tpl.status === 'APPROVED' ? 'good' : tpl.status === 'NOT RAISED' ? 'wrong' : 'watch'}>
              {tpl.status}
            </Chip>
            {tpl.category && <Chip tone="info">{tpl.category}</Chip>}
            {/* While Meta's live list cannot be read, its decision is recorded by hand. */}
            {data.templates.source === 'stored' && (
              <select className="input !w-auto !py-1 text-2xs" value={tpl.status}
                onChange={async (e) => {
                  await api.setTemplateStatus({ name: tpl.name, language: tpl.language, status: e.target.value });
                  onQueued();
                }}>
                {['PENDING', 'APPROVED', 'REJECTED', 'PAUSED'].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            )}
          </div>
          {tpl.buttons?.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tpl.buttons.map((b) => <Chip key={b} tone="info">{b}</Chip>)}
            </div>
          )}

          {tpl.variables.length > 0 && (
            <>
              <div className="mt-4 text-sm font-semibold text-ink">2 · What fills each blank</div>
              <p className="mt-0.5 text-2xs text-muted">
                Filled from GaadiPe's own record. WhatsApp gives no profile name until someone messages you,
                so a customer who never typed a name is greeted as &ldquo;there&rdquo; — the preview shows exactly who.
              </p>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {tpl.variables.map((n, i) => (
                  <label key={n} className="block">
                    <span className="label">{`{{${n}}}`}</span>
                    <select className="input" value={Object.keys(fields).includes(vars[i]) ? vars[i] : '__text'}
                      onChange={(e) => setVars((v) => v.map((x, j) => (j === i
                        ? (e.target.value === '__text' ? '' : e.target.value) : x)))}>
                      {Object.entries(fields).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                      <option value="__text">Text I type…</option>
                    </select>
                    {!Object.keys(fields).includes(vars[i]) && (
                      <input className="input mt-1.5" value={vars[i] || ''} maxLength={120}
                        onChange={(e) => setVars((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                        placeholder="The same words for everyone" />
                    )}
                  </label>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-ink">3 · Who receives it</div>
        <div className="flex flex-wrap gap-2">
          <select className="input !w-auto !py-1.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
            {Object.entries(data.recipients?.filters || {}).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          <input className="input !w-auto !py-1.5 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or number" />
        </div>
      </div>

      <Table className="mt-2" head={
        <tr>
          <th className="th w-8">
            <input type="checkbox" checked={allOn}
              onChange={() => setPicked(allOn ? new Set() : new Set(rows.filter((r) => !r.blocked).map((r) => r.mobile)))} />
          </th>
          {['Customer', 'Last vehicle', 'Last checked', ''].map((h) => <th key={h} className="th">{h}</th>)}
        </tr>}>
        {rows.map((r) => (
          <tr key={r.id} className={r.blocked ? 'opacity-50' : ''}>
            <td className="td">
              <input type="checkbox" checked={picked.has(r.mobile)} disabled={r.blocked}
                onChange={() => toggle(r.mobile)} />
            </td>
            <td className="td">
              <div className="font-semibold text-ink">{r.display_name || '—'}</div>
              <div className="text-2xs text-muted">{fmtMobile(r.mobile)}</div>
            </td>
            <td className="td text-2xs">{r.last_vehicle || '—'}{r.vehicles > 1 ? ` +${r.vehicles - 1}` : ''}</td>
            <td className="td text-2xs text-muted">{r.last_checked ? dateTime(r.last_checked) : 'never'}</td>
            <td className="td">
              {r.blocked ? <Chip tone="wrong">Blocked</Chip> : r.paid ? <Chip tone="good">Paid</Chip> : null}
            </td>
          </tr>
        ))}
      </Table>
      {rows.length === 0 && <Empty>Nobody matches that.</Empty>}

      {err && <Banner tone="wrong" className="mt-3">{err}</Banner>}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-quiet" onClick={doPreview} disabled={!tpl || chosen.length === 0 || busy}>
          Preview {chosen.length > 0 ? `(${count(chosen.length)} chosen)` : ''}
        </button>
        <button className="btn-primary" onClick={() => setConfirming(true)}
          disabled={!preview?.ok || chosen.length === 0 || busy}>
          Send to {count(chosen.length)}
        </button>
      </div>

      {preview && !preview.ok && <Banner tone="wrong" className="mt-3">{preview.message}</Banner>}
      {preview?.ok && (
        <div className="mt-3 rounded-lg border border-line bg-shell p-3">
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted">
            What the first {preview.sample.length} will read
          </div>
          {preview.sample.map((s) => (
            <div key={s.mobile} className="mt-2 rounded-lg border border-line bg-white p-3">
              <div className="text-2xs text-muted">{s.name || '—'} · {fmtMobile(s.mobile)}</div>
              <pre className="mt-1 whitespace-pre-wrap text-2xs text-body">{s.text}</pre>
            </div>
          ))}
          {preview.missing > 0 && (
            <p className="mt-2 text-2xs text-muted">{count(preview.missing)} chosen number(s) have no account and will be left out.</p>
          )}
        </div>
      )}

      {confirming && (
        <Confirm chosen={chosen.length} template={`${name} · ${lang}`} busy={busy}
          onClose={() => setConfirming(false)} onSend={send} />
      )}
    </div>
  );
}

function Confirm({ chosen, template, busy, onClose, onSend }) {
  const [typed, setTyped] = useState('');
  return (
    <Modal title="Send this broadcast?" onClose={onClose}>
      <p className="text-sm text-body">
        <b>{template}</b> goes to <b>{count(chosen)}</b> customer(s), a few a minute.
        A WhatsApp message cannot be unsent — only what has not gone yet can be stopped.
      </p>
      <label className="mt-3 block">
        <span className="label">Type SEND to confirm</span>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="SEND" />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={onSend} disabled={typed !== 'SEND' || busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </Modal>
  );
}

/* ────────────────────────────────────────────────── what has gone ── */

function Sent({ rows, onChange, canSend }) {
  const [open, setOpen] = useState(null);
  if (!rows?.length) return null;
  return (
    <div className="card mt-4">
      <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Broadcasts</div>
      <Table head={<tr>{['Template', 'Note', 'Recipients', 'Sent', 'Waiting', 'Skipped / failed', 'When', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
        {rows.map((b) => (
          <tr key={b.id}>
            <td className="td">
              <button className="font-semibold text-brand hover:underline" onClick={() => setOpen(b)}>{b.template_name}</button>
              <div className="text-2xs text-muted">{b.language}</div>
            </td>
            <td className="td text-2xs text-muted">{b.note || '—'}</td>
            <td className="td">{count(b.recipients)}</td>
            <td className="td">{count(b.sent)}</td>
            <td className="td">{count(b.pending)}</td>
            <td className="td">{count(b.skipped + b.failed)}</td>
            <td className="td text-2xs text-muted">{dateTime(b.created_at)}</td>
            <td className="td">
              {canSend && b.status === 'queued' && b.pending > 0 && (
                <button className="btn-quiet"
                  onClick={async () => {
                    if (window.confirm('Stop whatever has not been sent yet?')) { await api.cancelBroadcast(b.id); onChange(); }
                  }}>Stop</button>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {open && <Targets broadcast={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Targets({ broadcast, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.broadcastTargets(broadcast.id).then((d) => setRows(d.targets)).catch(() => setRows([])); }, [broadcast.id]);
  return (
    <Modal title={`${broadcast.template_name} · ${broadcast.language}`} onClose={onClose} wide>
      {!rows ? <Spinner /> : (
        <Table head={<tr>{['Customer', 'Sent as', 'Status', 'When'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="td">
                <div className="font-semibold text-ink">{t.display_name || '—'}</div>
                <div className="text-2xs text-muted">{fmtMobile(t.mobile)}</div>
              </td>
              <td className="td text-2xs text-body">{(t.params || []).join(' · ') || '—'}</td>
              <td className="td">
                <Chip tone={TONE[t.status] || 'info'}>{t.status}</Chip>
                {t.error && <div className="mt-0.5 text-2xs text-muted">{t.error}</div>}
              </td>
              <td className="td text-2xs text-muted">{t.sent_at ? dateTime(t.sent_at) : '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  );
}
