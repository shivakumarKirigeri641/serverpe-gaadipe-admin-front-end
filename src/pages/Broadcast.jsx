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
// The longest typed value: a template body is 1,024 characters in all, and its
// fixed words need room too.
const VAR_MAX = 900;

import { BatchSend, PlansSection } from './BroadcastPlans.jsx';
import { CoverageLine, RoomCard, TierCard, useRoom } from './BroadcastRoom.jsx';

export default function Broadcast({ tabs }) {
  const { can } = useSession();
  const canSend = allowed(can, 'settings');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // Several audiences at once, combined with OR (user, 2026-09-25).
  const [filter, setFilter] = useState(['checked']);
  const [q, setQ] = useState('');
  // The broadcast just queued: its live progress opens straight away.
  const [live, setLive] = useState(null);
  const [plansKey, setPlansKey] = useState(0);
  // The broadcast room (user, 2026-10-06): free now, when more frees, today's batch.
  const [room, loadRoom] = useRoom();

  const load = useCallback(() => {
    api.broadcasts({ filter: filter.join(','), q: q || undefined }).then(setData).catch(setError);
  }, [filter, q]);
  useEffect(load, [load]);

  return (
    <Shell tabs={tabs} title="Broadcast" subtitle="Send an approved WhatsApp template to customers who signed in.">
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

          <RoomCard room={room} canSend={canSend} onSent={() => { load(); loadRoom(); }} />
          <TierCard />

          {canSend
            ? <Compose data={data} filter={filter} setFilter={setFilter} q={q} setQ={setQ} room={room}
                onQueued={(b) => { load(); loadRoom(); if (b?.id) setLive(b); }}
                onPlanned={() => { load(); loadRoom(); setPlansKey((k) => k + 1); }} />
            : <Banner tone="info" className="mt-3">Your account cannot send broadcasts.</Banner>}

          <PlansSection canSend={canSend} refreshKey={plansKey} />
          <Sent rows={data.broadcasts} onChange={load} canSend={canSend} />
          {live && <Targets broadcast={live} canSend={canSend} onChange={load} onClose={() => { setLive(null); load(); }} />}
        </>
      )}
    </Shell>
  );
}

/* ───────────────────────────────────────────────────────── composing ── */

/* The audience column: short enough to sit beside a name. */
const SEGMENT_SHORT = { hi_only: 'Said Hi only', checked: 'Checked, unpaid', lapsed: 'Lapsed', active: 'Active', never_broadcast: 'No broadcast yet' };
const SEGMENT_TONE = { hi_only: 'watch', checked: 'info', lapsed: 'wrong', active: 'good', never_broadcast: 'info' };

function Compose({ data, filter, setFilter, q, setQ, room, onQueued, onPlanned }) {
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
  const [batching, setBatching] = useState(false);

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
  // Ticked in the list, plus anyone Auto-select ticked that the search box hides.
  const [auto, setAuto] = useState(null);
  const chosen = useMemo(() => {
    const listed = rows.filter((r) => picked.has(r.mobile));
    const seen = new Set(listed.map((r) => r.mobile));
    const hidden = (auto?.rows || []).filter((r) => picked.has(r.mobile) && !seen.has(r.mobile));
    return [...listed, ...hidden];
  }, [rows, picked, auto]);
  const toggle = (m) => setPicked((s) => { const n = new Set(s); n.has(m) ? n.delete(m) : n.add(m); return n; });
  // The Meta limit (user, 2026-10-01): never send past what is left in 24 hours.
  const [limit, setLimit] = useState(null);
  useEffect(() => { api.waLimit().then(setLimit).catch(() => {}); }, []);
  const allOn = rows.length > 0 && rows.every((r) => picked.has(r.mobile));
  // Auto-select (user, 2026-10-06): what the broadcast room picked, within these audiences.
  const [autoBusy, setAutoBusy] = useState(false);
  // Rest days: '' = the setting (7); fewer lets recently broadcast customers back in.
  const [rest, setRest] = useState('');
  const autoSelect = async () => {
    setAutoBusy(true); setErr(null);
    try {
      const s = await api.broadcastRoomSuggest({ filter: filter.join(','), gap_days: rest });
      setPicked(new Set(s.rows.map((r) => r.mobile)));
      setAuto(s); setPreview(null);
    } catch (e) { setErr(e.message); } finally { setAutoBusy(false); }
  };
  useEffect(() => { setAuto(null); }, [filter]);

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
      onQueued({ id: out.id, template_name: name, language: lang });
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
                  <label key={n} className={`block ${!Object.keys(fields).includes(vars[i]) ? 'sm:col-span-2' : ''}`}>
                    <span className="label">{`{{${n}}}`}</span>
                    <select className="input" value={Object.keys(fields).includes(vars[i]) ? vars[i] : '__text'}
                      onChange={(e) => setVars((v) => v.map((x, j) => (j === i
                        ? (e.target.value === '__text' ? '' : e.target.value) : x)))}>
                      {Object.entries(fields).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                      <option value="__text">Text I type…</option>
                    </select>
                    {/* ROOM FOR A PARAGRAPH (user, 2026-09-27): a one-line box cut
                        text at 120 characters, so a description was silently
                        shortened. It grows as you type; WhatsApp allows no line
                        breaks inside a value, so Enter is turned into " · ". */}
                    {!Object.keys(fields).includes(vars[i]) && (
                      <>
                        <textarea className="input mt-1.5 resize-y leading-relaxed" value={vars[i] || ''} maxLength={VAR_MAX}
                          rows={Math.min(8, Math.max(2, Math.ceil((vars[i] || '').length / 90)))}
                          onChange={(e) => {
                            const t = e.target.value.replace(/\s*\n\s*/g, ' · ');
                            setVars((v) => v.map((x, j) => (j === i ? t : x)));
                          }}
                          placeholder="The same words for everyone — a heading, or a whole paragraph" />
                        <span className={`mt-0.5 block text-right text-2xs ${(vars[i] || '').length > VAR_MAX * 0.9 ? 'text-watch-700' : 'text-muted'}`}>
                          {(vars[i] || '').length} / {VAR_MAX} · one paragraph, no line breaks
                        </span>
                      </>
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
        <input className="input !w-auto !py-1.5 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or number" />
      </div>
      {/* Tick any number of audiences: the list is everyone in ANY of them.
          "Everyone" on its own clears the rest. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(data.recipients?.filters || {}).map(([k, label]) => {
          const on = filter.includes(k);
          const n = data.recipients?.counts?.[k];
          return (
            <button key={k} type="button" aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-2xs font-semibold transition ${on
                ? 'border-brand bg-brand text-white' : 'border-line bg-white text-body hover:border-brand/40'}`}
              onClick={() => setFilter((cur) => {
                if (k === 'all') return ['all'];
                const next = cur.filter((x) => x !== 'all');
                const out = next.includes(k) ? next.filter((x) => x !== k) : [...next, k];
                return out.length ? out : ['all'];
              })}>
              {on ? '✓ ' : ''}{label}{n != null ? ` · ${count(n)}` : ''}
            </button>
          );
        })}
      </div>
      {/* AUTO-SELECT (user, 2026-10-06): tick, within these audiences, the
          customers who fit Meta's moving 24 hours right now — the broadcast
          room's rules (src/admin/broadcastRoom.js). Preview and Send as usual. */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-quiet !py-1.5 text-2xs font-semibold" disabled={autoBusy || !room || room.suggest_now < 1}
          onClick={autoSelect} title="Ticks the best customers in these audiences, as many as WhatsApp allows right now">
          {autoBusy ? 'Picking…' : `⚡ Auto-select up to ${count(room?.suggest_now ?? 0)} that fit now`}
        </button>
        <label className="flex items-center gap-1 text-2xs text-muted" title="Customers broadcast to within these days are left out, so nobody gets messages too often">
          Skip anyone broadcast to in the last
          <select className="input !w-auto !py-1 text-2xs" value={rest} onChange={(e) => { setRest(e.target.value); setAuto(null); }}>
            <option value="">{auto && rest === '' ? `${auto.gap_days} days (setting)` : 'days in the setting'}</option>
            {[5, 3, 2, 1].map((d) => <option key={d} value={d}>{d} day{d === 1 ? '' : 's'}</option>)}
            <option value="0">nobody (send again now)</option>
          </select>
        </label>
      </div>
      {auto && (() => {
        const LEFT = { rested: `broadcast to in the last ${auto.gap_days} day${auto.gap_days === 1 ? '' : 's'}`, recent: 'messaged in the last 24 h or waiting to send',
          open_chat: 'chat open now (reply there instead)', failed: 'two broadcasts failed', blocked: 'blocked', admin: 'admin / internal' };
        const out = Object.entries(auto.left_out || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
        return (
          <div className={`mt-2 rounded-lg px-3 py-2 text-2xs ${auto.size ? 'bg-good-50 text-body' : 'bg-watch-50 text-body'}`}>
            <b className="text-ink">{count(auto.size)} ticked</b> of {count(auto.audience)} in these audiences
            {auto.eligible > auto.size ? ` (${count(auto.eligible)} could get it; WhatsApp has room for ${count(auto.size)} now)` : ''}.
            {' '}Never had a broadcast first, then the most recently active. {count(room?.buffer ?? 0)} slots stay free for alerts.
            {out.length > 0 && (
              <div className="mt-1">Left out: {out.map(([k, n], i) => <span key={k}>{i ? ' · ' : ''}<b className="text-ink">{count(n)}</b> {LEFT[k] || k}</span>)}</div>
            )}
            {!auto.size && auto.left_out?.rested > 0 && (
              <div className="mt-1 font-semibold text-watch-700">Most were broadcast to recently — choose fewer days above (e.g. 2) and Auto-select again, if you really want to message them again.</div>
            )}
            {q ? <div className="mt-1">The search box hides some of them from the list below, but they are still ticked.</div> : null}
          </div>
        );
      })()}
      <p className="mt-1.5 text-2xs text-muted">
        <b>Never got a broadcast</b> on its own lists everyone no broadcast has reached yet (a failed or skipped send does not count).
        Ticked with another audience, it narrows that audience — e.g. <i>Said Hi only</i> + <i>Never got a broadcast</i>.
      </p>

      <Table className="mt-2" head={
        <tr>
          <th className="th w-8">
            <input type="checkbox" checked={allOn}
              onChange={() => setPicked(allOn ? new Set() : new Set(rows.filter((r) => !r.blocked).map((r) => r.mobile)))} />
          </th>
          {['Customer', 'Audience', 'Last vehicle', 'Last active', ''].map((h) => <th key={h} className="th">{h}</th>)}
        </tr>}>
        {rows.map((r) => (
          <tr key={r.id} className={r.blocked ? 'opacity-50' : ''}>
            <td className="td">
              <input type="checkbox" checked={picked.has(r.mobile)} disabled={r.blocked}
                onChange={() => toggle(r.mobile)} />
            </td>
            <td className="td">
              <div className="font-semibold text-ink">{r.display_name || r.wa_profile_name || '—'}</div>
              <div className="text-2xs text-muted">{fmtMobile(r.mobile)}{r.user_id ? '' : ' · WhatsApp only'}</div>
            </td>
            <td className="td">
              <div className="flex flex-wrap gap-1">
                {(r.segments || []).map((k) => <Chip key={k} tone={SEGMENT_TONE[k]}>{SEGMENT_SHORT[k] || k}</Chip>)}
              </div>
            </td>
            <td className="td text-2xs">{r.last_vehicle || '—'}{r.vehicles > 1 ? ` +${r.vehicles - 1}` : ''}</td>
            <td className="td text-2xs text-muted">{(() => {
              const last = [r.last_checked, r.last_message].filter(Boolean).sort().pop();
              return last ? dateTime(last) : 'never';
            })()}</td>
            <td className="td">
              {r.blocked ? <Chip tone="wrong">Blocked</Chip> : r.paid ? <Chip tone="good">Paid</Chip> : null}
            </td>
          </tr>
        ))}
      </Table>
      {rows.length === 0 && <Empty>Nobody matches that.</Empty>}

      {err && <Banner tone="wrong" className="mt-3">{err}</Banner>}

      {limit && chosen.length > 0 && (
        <Banner tone={chosen.length > limit.remaining ? 'wrong' : 'info'} className="mt-4">
          {chosen.length > limit.remaining
            ? <>⚠️ <b>{count(chosen.length)}</b> chosen, but only <b>{count(limit.remaining)}</b> of the {count(limit.limit)}-person daily WhatsApp limit is left. The rest would fail — use <b>Send in batches</b>, choose fewer, or send later.</>
            : <>WhatsApp limit: {count(limit.used)} of {count(limit.limit)} used in the last 24 hours — this broadcast fits ({count(limit.remaining)} left). QuizPe shares the same limit.</>}
          {/* When the ticked customers can all be reached (broadcast room, 2026-10-06). */}
          {room && <div className="mt-1 text-2xs">For these {count(chosen.length)}: <CoverageLine room={room} n={chosen.length} /></div>}
        </Banner>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button className="btn-quiet" onClick={doPreview} disabled={!tpl || chosen.length === 0 || busy}>
          Preview {chosen.length > 0 ? `(${count(chosen.length)} chosen)` : ''}
        </button>
        <button className="btn-primary" onClick={() => setConfirming(true)}
          disabled={!preview?.ok || chosen.length === 0 || busy}>
          Send to {count(chosen.length)}
        </button>
        <button className="btn-quiet" onClick={() => setBatching(true)}
          disabled={!preview?.ok || chosen.length === 0 || busy}
          title="Send in parts, each 24 hours apart, never over the WhatsApp limit">
          Send in batches…
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
            <p className="mt-2 text-2xs text-muted">{count(preview.missing)} chosen number(s) were not found and will be left out.</p>
          )}
        </div>
      )}

      {batching && (
        <BatchSend body={body()} chosen={chosen.length} template={`${name} · ${lang}`} limit={limit}
          onClose={() => setBatching(false)}
          onCreated={() => { setBatching(false); setPicked(new Set()); setPreview(null); setNote(''); onPlanned?.(); }} />
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
      {open && <Targets broadcast={open} canSend={canSend} onChange={onChange} onClose={() => setOpen(null)} />}
    </div>
  );
}

/*
 * LIVE PROGRESS (user, 2026-09-27). Opens the moment a broadcast is queued, and
 * from any row of the list. Asks every 3 seconds while open: the job sends a
 * few a minute, and after "sent" Meta reports delivered and read on its own
 * time — so each number walks Waiting → Sent → Delivered → Read, or stops red
 * with the reason. Closing it does not stop anything; sending carries on.
 */
const STEPS = ['Waiting', 'Sent', 'Delivered', 'Read'];
function stageOf(t) {
  if (t.status === 'failed' || t.delivery === 'failed') return { step: -1, tone: 'wrong', word: 'Failed', why: t.delivery_error || t.error };
  if (t.status === 'skipped') return { step: -1, tone: 'info', word: 'Skipped', why: t.error };
  if (t.status === 'pending') return { step: 0, tone: 'watch', word: 'Waiting' };
  if (t.delivery === 'read') return { step: 3, tone: 'good', word: 'Read' };
  if (t.delivery === 'delivered') return { step: 2, tone: 'good', word: 'Delivered' };
  return { step: 1, tone: 'good', word: 'Sent' };
}
const SKIP_WHY = { opted_out: 'replied STOP', blocked: 'blocked', recipient_not_allowed: 'test mode — not on the allowed list', cancelled: 'stopped by you' };

function Targets({ broadcast, onClose, canSend, onChange }) {
  const [d, setD] = useState(null);
  const load = useCallback(() => api.broadcastTargets(broadcast.id).then(setD).catch(() => setD((x) => x || { targets: [] })), [broadcast.id]);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);

  const rows = d?.targets || [];
  const stages = rows.map(stageOf);
  const n = (f) => stages.filter(f).length;
  const waiting = n((s) => s.step === 0);
  const failed = n((s) => s.word === 'Failed');
  const skipped = n((s) => s.word === 'Skipped');
  const read = n((s) => s.step === 3);
  const delivered = n((s) => s.step >= 2);
  const sent = n((s) => s.step >= 1);
  const done = rows.length - waiting;
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;
  const perMin = d?.broadcast?.per_minute || 5;
  const mins = Math.ceil(waiting / perMin);

  return (
    <Modal title={`${broadcast.template_name} · ${broadcast.language}`} onClose={onClose} wide>
      {!d ? <Spinner /> : (
        <>
          {/* the whole broadcast */}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm font-semibold text-ink">
              {waiting ? `Sending… ${count(done)} of ${count(rows.length)}` : `Finished · ${count(rows.length)} customer(s)`}
            </div>
            <div className="text-2xs text-muted">
              {waiting ? `about ${mins} minute${mins === 1 ? '' : 's'} left · ${perMin} a minute, to protect your number's quality` : 'Delivered and read keep updating as phones report back.'}
            </div>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-shell" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-2xs">
            <Chip tone="watch">{count(waiting)} waiting</Chip>
            <Chip tone="good">{count(sent)} sent</Chip>
            <Chip tone="good">{count(delivered)} delivered</Chip>
            <Chip tone="good">{count(read)} read</Chip>
            {failed > 0 && <Chip tone="wrong">{count(failed)} failed</Chip>}
            {skipped > 0 && <Chip tone="info">{count(skipped)} skipped</Chip>}
            {canSend && waiting > 0 && (
              <button className="btn-quiet ml-auto !py-0.5 text-2xs"
                onClick={async () => { if (window.confirm('Stop whatever has not been sent yet?')) { await api.cancelBroadcast(broadcast.id); load(); onChange?.(); } }}>
                Stop the rest
              </button>
            )}
          </div>

          {/* number by number */}
          <div className="mt-3 max-h-[55vh] divide-y divide-line overflow-auto rounded-lg border border-line">
            {rows.map((t, i) => {
              const s = stages[i];
              return (
                <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <div className="min-w-[9rem] flex-1">
                    <div className="truncate text-sm font-semibold text-ink">{t.display_name || '—'}</div>
                    <div className="tabular text-2xs text-muted">{fmtMobile(t.mobile)}</div>
                  </div>
                  <div className="w-44" title={STEPS.join(' → ')}>
                    <div className="flex gap-1">
                      {STEPS.map((w, k) => (
                        <div key={w} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                          s.step < 0 ? (s.tone === 'wrong' ? 'bg-wrong-500' : 'bg-line')
                            : k <= s.step ? (k === 0 && s.step === 0 ? 'animate-pulse bg-watch-500' : 'bg-good-500') : 'bg-line'}`} />
                      ))}
                    </div>
                  </div>
                  <div className="w-44 text-right">
                    <Chip tone={s.tone}>{s.word}</Chip>
                    {s.why && <div className="mt-0.5 text-2xs text-muted">{SKIP_WHY[s.why] || s.why}</div>}
                    {!s.why && (t.delivery_at || t.sent_at) && <div className="mt-0.5 text-2xs text-muted">{dateTime(t.delivery_at || t.sent_at)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-2xs text-muted">
            Sent = WhatsApp accepted it · Delivered = it reached the phone · Read = opened (only if they have read receipts on).
            You can close this — sending carries on.
          </p>
        </>
      )}
    </Modal>
  );
}
