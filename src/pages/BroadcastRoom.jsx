import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { Banner, Modal } from '../components/ui.jsx';
import { snack } from '../components/Live.jsx';
import { count, mobile as fmtMobile, dateTime } from '../lib/format';

/*
 * THE BROADCAST ROOM (user, 2026-10-06; back end src/admin/broadcastRoom.js).
 *
 * Meta counts the DIFFERENT people GaadiPe and QuizPe message first in a moving
 * 24 hours. Each person's slot frees 24 hours after their last message, so room
 * comes back in steps, not at midnight. This shows:
 *   - how many can be messaged right now, and when more frees up
 *   - for the customers ticked below: how many now, and when all are covered
 *   - today's suggested batch (announcement template only), and
 *   - the way to Meta's next limit.
 */

/** "4 pm today", "11:30 am tomorrow", "Thu 9 am". */
export function when(iso) {
  const d = new Date(iso);
  const t = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined, hour12: true }).replace(/\s+/g, ' ').toLowerCase();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(new Date())) / 864e5);
  return diff === 0 ? `${t} today` : diff === 1 ? `${t} tomorrow` : `${d.toLocaleDateString('en-IN', { weekday: 'short' })} ${t}`;
}

/** For n people: how many go now and when the rest fit — [{ at|null, n }], and when all are done. */
export function coverage(room, n) {
  if (!room || !n) return { steps: [], done: null, left: 0 };
  const steps = [];
  let left = n;
  const now = Math.min(left, room.suggest_now);
  if (now > 0) { steps.push({ at: null, n: now }); left -= now; }
  // Room frees as earlier sends turn 24 h old (the buffer and plans stay held).
  let free = room.suggest_now - now;
  for (const o of room.opens || []) {
    if (left <= 0) break;
    free += o.n;
    const take = Math.min(left, free);
    if (take > 0) { steps.push({ at: o.at, n: take }); left -= take; free -= take; }
  }
  // Past the last open slot, a full day's room every 24 hours.
  let day = 1;
  const daily = Math.max(1, room.limit - room.buffer);
  while (left > 0 && day < 30) {
    const at = new Date(Date.now() + day * 24 * 3600e3).toISOString();
    const take = Math.min(left, daily);
    steps.push({ at, n: take, approx: true }); left -= take; day += 1;
  }
  return { steps, done: steps.length ? steps[steps.length - 1].at : null, left };
}

export function useRoom() {
  const [room, setRoom] = useState(null);
  const load = useCallback(() => api.broadcastRoom().then(setRoom).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);
  return [room, load];
}

/** One line under the audience: "74 now · 60 at 4 pm today · all done by 11 am tomorrow". */
export function CoverageLine({ room, n }) {
  if (!room || !n) return null;
  const c = coverage(room, n);
  return (
    <span>
      {c.steps.slice(0, 4).map((s, i) => (
        <span key={i}>{i ? ' · ' : ''}<b className="text-ink">{count(s.n)}</b> {s.at ? `${s.approx ? 'about ' : ''}${when(s.at)}` : 'now'}</span>
      ))}
      {c.steps.length > 4 ? ' · …' : ''}
      {c.done && <> → <b className="text-ink">all covered by {when(c.done)}</b></>}
    </span>
  );
}

/** The room card at the top of Broadcast. */
export function RoomCard({ room, canSend, onSent }) {
  const [batch, setBatch] = useState(false);
  if (!room) return null;
  const pct = Math.min(100, Math.round(((room.used + room.queued) / Math.max(1, room.limit)) * 100));
  const next = (room.opens || []).slice(0, 4);
  const fullAt = (room.opens || []).find((o) => o.free_after >= room.limit)?.at;
  return (
    <div className="card mt-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-wider text-muted">📣 Broadcast room · Meta’s moving 24 hours</div>
          <div className="mt-1 text-lg font-bold text-ink">
            You can broadcast to <span className="text-brand">{count(room.suggest_now)}</span> customers right now
          </div>
          <div className="mt-0.5 text-2xs text-muted">
            {count(room.limit)} limit · {count(room.used)} used in the last 24 h
            {room.quizpe_linked ? ` (GaadiPe ${count(room.gaadipe)}, QuizPe ${count(room.quizpe)})` : ' (QuizPe not linked — its sends are not counted)'}
            {room.queued ? ` · ${count(room.queued)} waiting to send` : ''}
            {room.booked ? ` · ${count(room.booked)} booked by batch plans` : ''}
            {` · ${count(room.buffer)} kept free for alerts and live customers`}
          </div>
        </div>
        {canSend && (
          <button className="btn-primary" disabled={room.suggest_now < 1} onClick={() => setBatch(true)}
            title="Pick today’s customers for the announcement template">
            Today’s batch ({count(room.suggest_now)})
          </button>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-shell" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full ${pct >= 90 ? 'bg-wrong-500' : pct >= 70 ? 'bg-watch-500' : 'bg-good-500'}`} style={{ width: `${pct}%`, transition: 'width .8s ease' }} />
      </div>
      <div className="mt-3 text-2xs text-body">
        {next.length ? (
          <>
            <b className="text-ink">More room opens:</b>{' '}
            {next.map((o, i) => <span key={o.at}>{i ? ' · ' : ''}<b className="text-ink">+{count(o.n)}</b> at {when(o.at)}</span>)}
            {(room.opens || []).length > next.length ? ' · …' : ''}
            {fullAt && <> → <b className="text-ink">all {count(room.limit)} free by {when(fullAt)}</b></>}
          </>
        ) : <>Nobody has been messaged in the last 24 hours, so the whole limit is free.</>}
      </div>
      <p className="mt-1 text-[10px] text-muted">
        Each person’s slot frees 24 hours after their last message. Messaging someone already counted today does not take another slot.
        Replies inside an open chat do not count.
      </p>
      {batch && <TodaysBatch onClose={() => setBatch(false)} onSent={() => { setBatch(false); onSent?.(); }} />}
    </div>
  );
}

/** Today's batch: the suggested customers, the announcement template, typed SEND. */
function TodaysBatch({ onClose, onSent }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [off, setOff] = useState(() => new Set());
  const [tplKey, setTplKey] = useState('');
  const [vars, setVars] = useState(['', '']);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.broadcastRoomSuggest().then((x) => {
      setD(x);
      const t = (x.templates || []).find((y) => y.sendable);
      if (t) { setTplKey(`${t.name}|${t.language}`); setVars(t.variables.map(() => '')); }
    }).catch((e) => setErr(e.message));
  }, []);
  const tpl = (d?.templates || []).find((t) => `${t.name}|${t.language}` === tplKey) || null;
  const chosen = (d?.rows || []).filter((r) => !off.has(r.mobile));
  const filled = tpl && vars.length === tpl.variables.length && vars.every((v) => v.trim());
  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const out = await api.broadcastRoomSend({ template_name: tpl.name, language: tpl.language, variables: vars.map((v) => v.trim()),
        mobiles: chosen.map((r) => r.mobile), confirm: 'SEND' });
      if (!out.ok) { setErr(out.message || 'Could not queue it.'); return; }
      snack(`Queued for ${count(out.recipients)} — sent a few a minute`);
      onSent(out);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  let text = tpl?.body || '';
  vars.forEach((v, i) => { text = text.split(`{{${i + 1}}}`).join(v || `{{${i + 1}}}`); });
  return (
    <Modal title="Today’s batch" subtitle="Announcement template · fits Meta’s moving 24 hours" onClose={onClose} busy={busy} wide>
      {!d && !err && <p className="text-sm text-muted">Picking customers…</p>}
      {err && <Banner tone="wrong">{err}</Banner>}
      {d && (
        <>
          <p className="text-sm text-body">
            <b className="text-ink">{count(d.size)}</b> customers picked{d.eligible > d.size ? ` (of ${count(d.eligible)} who could get it)` : ''}.
            First those who never had a broadcast, then the most recently active. Left out: STOP and blocked, anyone messaged in the
            last 24 hours or with an open chat, anyone broadcast to in the last {d.gap_days} days, and numbers where two broadcasts failed.
          </p>
          {!(d.templates || []).some((t) => t.sendable) ? (
            <Banner tone="watch" className="mt-3">No approved announcement template (gp_announcement_…) yet — this batch can only use that one.</Banner>
          ) : (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block"><span className="label">Template</span>
                  <select className="input" value={tplKey} onChange={(e) => { setTplKey(e.target.value); const t = d.templates.find((y) => `${y.name}|${y.language}` === e.target.value); setVars((t?.variables || []).map(() => '')); }}>
                    {d.templates.filter((t) => t.sendable).map((t) => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} · {t.language}</option>)}
                  </select>
                </label>
                {tpl?.variables.map((n, i) => (
                  <label key={n} className={`block ${i ? 'sm:col-span-2' : ''}`}><span className="label">{i === 0 ? `{{${n}}} Title` : `{{${n}}} Message`}</span>
                    {i === 0
                      ? <input className="input" maxLength={60} value={vars[i] || ''} onChange={(e) => setVars((v) => v.map((x, j) => (j === i ? e.target.value : x)))} placeholder="New: check challans for free" />
                      : <textarea className="input resize-y" rows={3} maxLength={900} value={vars[i] || ''}
                          onChange={(e) => { const t = e.target.value.replace(/\s*\n\s*/g, ' · '); setVars((v) => v.map((x, j) => (j === i ? t : x))); }}
                          placeholder="One paragraph, the same words for everyone" />}
                  </label>
                ))}
              </div>
              {tpl && <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-line bg-shell p-3 text-2xs text-body">{tpl.header_text ? `${tpl.header_text}\n\n` : ''}{text}{tpl.footer ? `\n\n— ${tpl.footer}` : ''}</pre>}
            </>
          )}
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-line">
            {d.rows.map((r) => (
              <label key={r.mobile} className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-2xs last:border-0">
                <input type="checkbox" checked={!off.has(r.mobile)} onChange={() => setOff((s) => { const n = new Set(s); n.has(r.mobile) ? n.delete(r.mobile) : n.add(r.mobile); return n; })} />
                <span className="w-40 truncate font-semibold text-ink">{r.name || '—'}</span>
                <span className="w-28 text-muted">{fmtMobile(r.mobile)}</span>
                <span className="flex-1 text-muted">{r.why}{r.last_active ? ` · active ${dateTime(r.last_active)}` : ''}</span>
              </label>
            ))}
            {!d.rows.length && <div className="p-3 text-2xs text-muted">Nobody fits today — everyone was messaged recently or has an open chat.</div>}
          </div>
          <label className="mt-3 block">
            <span className="label">Type SEND to queue {count(chosen.length)}</span>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="SEND" />
          </label>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn-primary" onClick={send} disabled={typed !== 'SEND' || busy || !filled || !chosen.length}>
              {busy ? 'Queuing…' : `Send to ${count(chosen.length)}`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

const QUALITY = { GREEN: ['🟢 High', 'text-good-700'], YELLOW: ['🟡 Medium', 'text-watch-700'], RED: ['🔴 Low', 'text-wrong-700'] };

/** The way to Meta's next limit. */
export function TierCard() {
  const [t, setT] = useState(null);
  useEffect(() => { api.broadcastRoomTier().then(setT).catch(() => {}); }, []);
  if (!t) return null;
  const q = QUALITY[t.quality] || ['—', 'text-muted'];
  return (
    <div className="card mt-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-ink">
          🚀 Next WhatsApp limit: {count(t.limit)} → {t.next ? count(t.next) : 'Unlimited'}
        </div>
        <span className="text-2xs text-muted">
          Quality <b className={q[1]}>{q[0]}</b>
          {t.verified_note ? ` · ${t.verified_note}` : t.business_verification ? ` · Business verification: ${t.business_verification}` : ''}
          {t.checked_at ? ` · from Meta ${dateTime(t.checked_at)}` : ''}
        </span>
      </div>
      {t.quality_note && <Banner tone="watch" className="mt-2">{t.quality_note}</Banner>}
      {/* All of these together raise the limit (Meta support, 2026-10-06). */}
      <div className={`mt-3 grid gap-3 ${(t.paths || []).length >= 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        {(t.paths || []).map((p) => {
          const pct = p.need ? Math.min(100, Math.round((p.have / p.need) * 100)) : p.done ? 100 : 0;
          return (
            <div key={p.key} className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-ink">
                <span>{p.done ? '✅ ' : ''}{p.label}</span>
                {p.need ? <span className="text-muted">{count(p.have)} / {count(p.need)}</span> : <span className="text-muted">{p.status}</span>}
              </div>
              {p.need ? (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-shell">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
              ) : null}
              <p className="mt-1.5 text-2xs text-muted">
                {p.per_day ? <>About <b className="text-ink">{count(p.per_day)} more different people a day</b> for the next 7 days gets there. </> : null}
                {p.note}
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted">
        Different customers messaged: {count(t.unique_7d)} in 7 days, {count(t.unique_30d)} in 30 days (GaadiPe and QuizPe together).
        Steady daily batches to people who know GaadiPe beat one big blast — blocks and reports lower quality, and low quality can lower the limit.
      </p>
    </div>
  );
}
