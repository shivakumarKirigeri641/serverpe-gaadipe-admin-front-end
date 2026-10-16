import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { snack } from './Live.jsx';

/**
 * ONE MESSAGE TO EVERYONE TICKED (user, 2026-10-14: "in Hot leads, select multiple contacts
 * within 24 hrs, or all, then one message to all those"). Server: admin/replyMany.js.
 *
 * Everyone on Hot leads is inside their 24-hour window, so the message is a free reply —
 * sent one person at a time, a few seconds apart, never in one burst. {name} becomes each
 * person's first name. Up to three of the bot's own buttons, as in a single reply.
 */
let catalog = null;
const loadCatalog = () => (catalog ||= api.waReplyButtons().then((r) => r.buttons || []).catch(() => { catalog = null; return []; }));

const TONE = { sent: 'text-good-700', skipped: 'text-watch-700', failed: 'text-wrong-700', 'not sent': 'text-muted', waiting: 'text-muted' };

/* presetText / presetButtons (2026-10-16): Hot leads' email and feedback tabs start the box
   with the message and buttons that fit — still editable before sending. */
export default function ReplyMany({ people, onClear, onDone, presetText = '', presetButtons = null }) {
  const [text, setText] = useState(presetText);
  const [buttons, setButtons] = useState(presetButtons ? [...presetButtons, '', '', ''].slice(0, 3) : ['', '', '']);
  const [list, setList] = useState([]);
  const [job, setJob] = useState(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);
  useEffect(() => { let live = true; loadCatalog().then((b) => { if (live) setList(b); }); return () => { live = false; }; }, []);
  useEffect(() => () => clearInterval(timer.current), []);

  const chosen = buttons.filter(Boolean);
  const byId = Object.fromEntries(list.map((b) => [b.id, b]));
  const tooLong = chosen.length > 0 && text.trim().length > 1024;
  const n = people.length;
  const running = job && !job.done;

  const watch = (id) => {
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const j = await api.waReplyManyStatus(id);
        setJob(j);
        if (j.done) { clearInterval(timer.current); snack(`Done: ${j.sent} sent${j.skipped ? `, ${j.skipped} skipped` : ''}${j.failed ? `, ${j.failed} failed` : ''}`); onDone?.(); }
      } catch { clearInterval(timer.current); }
    }, 2000);
  };

  const send = async () => {
    if (!n || !text.trim() || tooLong) return;
    const first = people[0]?.name ? String(people[0].name).split(/\s+/)[0] : 'there';
    const sample = text.trim().replace(/\{name\}/gi, first);
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Send this to ${n} ${n === 1 ? 'person' : 'people'}, one every few seconds?\n\n${sample.slice(0, 300)}`)) return;
    setBusy(true);
    try {
      const j = await api.waReplyMany(people.map((p) => p.mobile), text.trim(), chosen);
      setJob(j); watch(j.id);
    } catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
  };
  const stop = async () => { try { setJob(await api.waReplyManyStop(job.id)); } catch (e) { snack(e.message, 'wrong'); } };

  if (job) {
    const left = Math.max(0, job.total - job.sent - job.skipped - job.failed);
    return (
      <div className="card mb-4 border-brand/40 p-4" data-test="reply-many-progress">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <b className="text-ink">{job.done ? 'Finished' : job.stopped ? 'Stopping…' : `Sending — one every ${job.gap_seconds}s`}</b>
          <span className="text-good-700">✓ {job.sent} sent</span>
          {job.skipped > 0 && <span className="text-watch-700">⏭ {job.skipped} skipped</span>}
          {job.failed > 0 && <span className="text-wrong-700">⚠ {job.failed} failed</span>}
          {!job.done && <span className="text-muted">{left} to go · about {Math.ceil((left * job.gap_seconds) / 60)} min</span>}
          <span className="ml-auto flex gap-2">
            {running && !job.stopped && <button type="button" className="btn-quiet !py-1.5 text-2xs" onClick={stop}>■ Stop</button>}
            {job.done && <button type="button" className="btn-primary !py-1.5 text-2xs" onClick={() => { setJob(null); setText(presetText); setButtons(presetButtons ? [...presetButtons, '', '', ''].slice(0, 3) : ['', '', '']); onClear(); }}>New message</button>}
          </span>
        </div>
        <ul className="mt-3 grid gap-x-4 gap-y-1 text-2xs sm:grid-cols-2 lg:grid-cols-3">
          {job.people.map((p, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-ink">{p.name || 'Unknown'}</span>
              <span className="tabular text-muted">••{p.tail}</span>
              <span className={`ml-auto ${TONE[p.status] || ''}`}>{p.status}{p.note ? ` — ${p.note}` : ''}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!n) return null;
  return (
    <div className="card sticky top-2 z-10 mb-4 border-good-500/40 p-4 shadow-lg" data-test="reply-many">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <b className="text-ink">💬 One message to {n} {n === 1 ? 'person' : 'people'}</b>
        <span className="text-2xs text-muted">free — all are inside their 24-hour window · sent one at a time, a few seconds apart</span>
        <button type="button" className="ml-auto text-2xs text-brand hover:underline" onClick={onClear}>Clear selection</button>
      </div>
      <div className="flex items-end gap-2">
        <textarea className="input min-h-[60px] flex-1 resize-y text-sm" rows={3} maxLength={1000} value={text}
          placeholder="Hi {name}! …   ({name} becomes each person's first name)" onChange={(e) => setText(e.target.value)} />
        <button type="button" className="btn-primary !py-2" disabled={busy || !text.trim() || tooLong} onClick={send}>
          {busy ? 'Starting…' : `Send to ${n}`}
        </button>
      </div>
      {list.length > 0 && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {buttons.map((v, i) => (
            <label key={i} className="block text-[10px] text-muted">Button {i + 1}
              <select className="input mt-0.5 !py-1 text-2xs" value={v}
                onChange={(e) => setButtons((b) => { const x = [...b]; x[i] = e.target.value; return x; })}>
                <option value="">— none —</option>
                {list.map((b) => <option key={b.id} value={b.id} disabled={buttons.includes(b.id) && v !== b.id}>{b.title}</option>)}
              </select>
              {v && byId[v] && <span className="mt-0.5 block leading-snug text-body">When tapped: {byId[v].does}</span>}
            </label>
          ))}
        </div>
      )}
      <p className="mt-2 text-[10px] text-muted">
        Keep it a service message (an update, help, an apology) — offers only to people who chose offers.
        Anyone who has not agreed on WhatsApp, said STOP, or whose window closes before their turn is skipped.
        {tooLong ? ' With buttons the message can be at most 1024 characters.' : ''}
      </p>
    </div>
  );
}
