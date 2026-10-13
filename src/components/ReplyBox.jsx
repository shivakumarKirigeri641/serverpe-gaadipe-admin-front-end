import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { snack } from './Live.jsx';

/**
 * REPLY FROM THE PANEL (user, 2026-10-01). Inside the customer's 24-hour window
 * a plain message is free and allowed; the box says how long is left and goes
 * quiet when it closes — after that only an approved template can reach them.
 *
 * WITH BUTTONS (user, 2026-10-13: "Hot leads — 1, 2 or 3 selectable buttons, a dropdown
 * of all possible buttons and what each does when tapped"). Each comes from the bot's
 * own list (server whatsapp/replyButtons.js), so a tap does what it does anywhere else.
 */
const left = (lastInboundAt) => {
  if (!lastInboundAt) return 0;
  return Math.max(0, new Date(lastInboundAt).getTime() + 24 * 3600e3 - Date.now());
};
export const windowLeft = (lastInboundAt) => {
  const ms = left(lastInboundAt);
  if (!ms) return null;
  const h = Math.floor(ms / 3600e3); const m = Math.floor((ms % 3600e3) / 60e3);
  return h ? `${h}h ${m}m` : `${m}m`;
};

// The catalogue, fetched once for every reply box on the page.
let catalog = null;
const loadCatalog = () => (catalog ||= api.waReplyButtons().then((r) => r.buttons || []).catch(() => { catalog = null; return []; }));

export default function ReplyBox({ mobile, lastInboundAt, onSent }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [buttons, setButtons] = useState(['', '', '']);
  const [list, setList] = useState([]);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { let live = true; loadCatalog().then((b) => { if (live) setList(b); }); return () => { live = false; }; }, []);
  const open = left(lastInboundAt) > 0;
  const chosen = buttons.filter(Boolean);
  const byId = Object.fromEntries(list.map((b) => [b.id, b]));
  const tooLong = chosen.length > 0 && text.trim().length > 1024;

  const send = async () => {
    if (!text.trim() || tooLong) return;
    setBusy(true);
    try {
      await api.waReply(mobile, text.trim(), chosen);
      setText(''); setButtons(['', '', '']);
      snack(chosen.length ? `Sent on WhatsApp with ${chosen.length} button${chosen.length === 1 ? '' : 's'}` : 'Sent on WhatsApp'); onSent?.();
    } catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <div className="rounded-lg border border-line bg-shell/60 px-3 py-2 text-2xs text-muted">
        🔒 Their 24-hour window is closed, so a free reply is not possible. Only an approved template (Broadcast) can reach them now.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-good-500/30 bg-good-50/50 p-2.5">
      <div className="mb-1.5 flex items-center justify-between text-2xs">
        <span className="font-semibold text-good-700">💬 Reply on WhatsApp — free</span>
        <span className="text-muted">Window closes in <b className="text-ink">{windowLeft(lastInboundAt)}</b></span>
      </div>
      <div className="flex items-end gap-2">
        <textarea className="input min-h-[44px] flex-1 resize-y text-sm" rows={2} maxLength={1000} value={text}
          placeholder="Type your reply…" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} />
        <button type="button" className="btn-primary !py-2" disabled={busy || !text.trim() || tooLong} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
      </div>

      {/* Up to three buttons under the message */}
      {list.length > 0 && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {buttons.map((v, i) => (
            <label key={i} className="block text-[10px] text-muted">Button {i + 1}
              <select className="input mt-0.5 !py-1 text-2xs" value={v}
                onChange={(e) => setButtons((b) => { const x = [...b]; x[i] = e.target.value; return x; })}>
                <option value="">— none —</option>
                {list.map((b) => (
                  <option key={b.id} value={b.id} disabled={buttons.includes(b.id) && v !== b.id}>{b.title}</option>
                ))}
              </select>
              {v && byId[v] && <span className="mt-0.5 block leading-snug text-body">When tapped: {byId[v].does}</span>}
            </label>
          ))}
        </div>
      )}
      {chosen.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="How the buttons will look">
          {chosen.map((id) => <span key={id} className="rounded-full border border-[#0a84c1]/40 bg-white px-2.5 py-0.5 text-2xs font-semibold text-[#0a84c1]">{byId[id]?.title || id}</span>)}
        </div>
      )}
      <p className="mt-1 text-[10px] text-muted">
        Ctrl + Enter to send · it goes from the GaadiPe number, and the bot continues as usual after.
        {tooLong ? ' With buttons the message can be at most 1024 characters.' : ''}
      </p>
    </div>
  );
}
