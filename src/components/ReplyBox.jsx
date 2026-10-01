import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { snack } from './Live.jsx';

/**
 * REPLY FROM THE PANEL (user, 2026-10-01). Inside the customer's 24-hour window
 * a plain message is free and allowed; the box says how long is left and goes
 * quiet when it closes — after that only an approved template can reach them.
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

export default function ReplyBox({ mobile, lastInboundAt, onSent }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(t); }, []);
  const open = left(lastInboundAt) > 0;

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await api.waReply(mobile, text.trim()); setText(''); snack('Sent on WhatsApp'); onSent?.(); }
    catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
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
        <button type="button" className="btn-primary !py-2" disabled={busy || !text.trim()} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
      </div>
      <p className="mt-1 text-[10px] text-muted">Ctrl + Enter to send · it goes from the GaadiPe number, and the bot continues as usual after.</p>
    </div>
  );
}
