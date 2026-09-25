import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../lib/api';

/**
 * The header's bell (user, 2026-09-25): critical, payment, API and system
 * alerts, newest first, each opening what it is about ("Payment mismatch
 * detected" → the reconciliation). The count is what this admin has not
 * seen; opening the panel marks everything seen. Checked every 30 seconds,
 * once for the whole panel.
 */
const cache = { at: 0, v: null, listeners: new Set() };
async function refresh(force = false) {
  if (!getToken()) return;                       // signed out: nothing to ask
  if (!force && Date.now() - cache.at < 30000 && cache.v) return;
  cache.at = Date.now();
  try { cache.v = await api.notifications(); cache.listeners.forEach((f) => f(cache.v)); } catch { /* next time */ }
}
setInterval(() => { if (!document.hidden) refresh(true); }, 30000);

const DOT = { critical: 'bg-wrong-500', warning: 'bg-watch-500', info: 'bg-brand', success: 'bg-good-500' };
const GROUP = { critical: 'Critical', payment: 'Payments', api: 'Vehicle API', system: 'System', other: 'Other' };

export default function Notifications({ Icon }) {
  const [v, setV] = useState(cache.v);
  const [open, setOpen] = useState(false);
  useEffect(() => { cache.listeners.add(setV); refresh(); return () => cache.listeners.delete(setV); }, []);
  const show = async () => {
    setOpen((o) => !o);
    if (!open && v?.unread) { await api.markNotificationsRead().catch(() => {}); refresh(true); }
  };
  const critical = v?.items.some((i) => i.unread && i.severity === 'critical');
  return (
    <div className="no-print relative">
      <button className="relative rounded-lg p-1.5 text-body hover:bg-shell" onClick={show} title="Notifications" aria-label="Notifications" aria-expanded={open}>
        <Icon />
        {v?.unread > 0 && (
          <span className={`absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white ${critical ? 'bg-wrong-500' : 'bg-watch-500'}`}>{v.unread}</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-40 max-h-[70vh] w-96 overflow-y-auto rounded-xl border border-line bg-white shadow-pop">
            <div className="flex items-center justify-between border-b border-line px-4 py-2"><b className="text-sm text-ink">Notifications</b>
              <Link to="/alerts" className="text-2xs text-brand hover:underline" onClick={() => setOpen(false)}>Alert center →</Link></div>
            {!v?.items.length ? <p className="px-4 py-6 text-center text-sm text-muted">Nothing to report.</p> : v.items.map((n) => (
              <Link key={n.id} to={n.to} onClick={() => setOpen(false)} className={`flex gap-2 border-b border-line/60 px-4 py-2 hover:bg-shell ${n.unread ? 'bg-brand/5' : ''}`}>
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[n.severity] || DOT.info}`} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{n.title}</span>
                  {n.text && <span className="line-clamp-2 block text-2xs text-body">{n.text}</span>}
                  <span className="text-[10px] text-muted">{GROUP[n.group]} · {n.status === 'resolved' ? 'resolved' : n.status} · {new Date(n.at).toLocaleString('en-IN', { hour12: false })}</span>
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
