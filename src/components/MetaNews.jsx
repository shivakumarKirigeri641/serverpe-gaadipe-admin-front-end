import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { chime } from '../lib/sound';

/*
 * META'S NEWS AS A DIALOG (user, 2026-10-05: "must be modal dialog and must
 * go on my tap/click"). Messaging limit decisions, number cap, quality,
 * display name reviews and account alerts from Meta (back end
 * routes/whatsapp.js accountNews) — unlike other pop-ups this one does not
 * fade away: it covers the panel until "Got it" is clicked. Escape and
 * clicking outside do nothing. The click acknowledges it on the server, so it
 * shows once — on any device, including one opened later.
 *
 * GOOD NEWS GETS ITS OWN CELEBRATION (user, 2026-10-05: "a unique
 * celebration animation") — not the milestone confetti, not the feedback
 * stars: WhatsApp chat bubbles rising, a green ring pulsing, a rocket taking
 * off, and the limit counting up from 250 to the new one.
 */
const POLL_MS = 60000;

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** What the good news is, or null: a raised limit / number cap, an approved name. */
function goodNews(n) {
  const text = `${n.title || ''}\n${n.description || ''}`;
  if (/FAILED|REJECT|DEFERRED|NEED_MORE_INFO|DOWNGRADE|FLAGGED|RESTRICT|DISABLED/i.test(text)) return null;
  const limit = /Limit:\s*(\d{4,})/i.exec(text) || /Current limit:\s*TIER_(\d+K?)/i.exec(text);
  const cap = /Phone number cap:\s*(\d+)/i.exec(text);
  if (limit) {
    const raw = String(limit[1]).toUpperCase();
    const to = raw.endsWith('K') ? Number(raw.slice(0, -1)) * 1000 : Number(raw);
    if (to > 250) return { kind: 'limit', to, cap: cap ? Number(cap[1]) : null };
  }
  if (cap && Number(cap[1]) > 2) return { kind: 'cap', cap: Number(cap[1]) };
  if (/APPROVED/i.test(text) && /name/i.test(text)) return { kind: 'name' };
  return null;
}

/* The limit climbing from 250 — eased, about 1.8 s. */
function Counter({ to }) {
  const [v, setV] = useState(reduced() ? to : 250);
  useEffect(() => {
    if (reduced()) return undefined;
    let raf; const start = performance.now(); const dur = 1800;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      setV(Math.round(250 + (to - 250) * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <span className="tabular">{v.toLocaleString('en-IN')}</span>;
}

/* Chat bubbles and ticks floating up behind the card. */
function Bubbles() {
  if (reduced()) return null;
  const items = Array.from({ length: 22 }, (_, i) => ({
    left: (i * 37) % 100, delay: (i % 11) * 0.28, dur: 3.2 + (i % 5) * 0.5, size: 18 + (i % 4) * 8,
    glyph: ['💬', '✅', '💚', '📈', '💬', '🚀'][i % 6],
  }));
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((b, i) => (
        <span key={i} className="gp-meta-bubble" style={{ left: `${b.left}%`, fontSize: b.size, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s` }}>{b.glyph}</span>
      ))}
    </div>
  );
}

const STYLE = `
@keyframes gpMetaRise { 0% { transform: translateY(0) scale(.6); opacity: 0 } 12% { opacity: 1 } 100% { transform: translateY(-110vh) scale(1.1); opacity: 0 } }
@keyframes gpMetaRing { 0% { transform: scale(.8); opacity: .7 } 100% { transform: scale(1.9); opacity: 0 } }
@keyframes gpMetaRocket { 0% { transform: translate(-30px, 40px) rotate(0deg); opacity: 0 } 30% { opacity: 1 } 100% { transform: translate(40px, -60px) rotate(-8deg); opacity: 0 } }
@keyframes gpMetaPop { 0% { transform: scale(.85); opacity: 0 } 60% { transform: scale(1.03); opacity: 1 } 100% { transform: scale(1) } }
.gp-meta-bubble { position: absolute; bottom: -40px; animation-name: gpMetaRise; animation-timing-function: ease-out; animation-iteration-count: infinite; }
.gp-meta-ring { position: absolute; inset: 0; border-radius: 9999px; border: 3px solid #12a150; animation: gpMetaRing 1.6s ease-out infinite; }
.gp-meta-rocket { position: absolute; right: 18px; top: 18px; font-size: 28px; animation: gpMetaRocket 2.4s ease-in-out infinite; }
.gp-meta-card { animation: gpMetaPop .45s ease-out both; }
@media (prefers-reduced-motion: reduce) { .gp-meta-ring, .gp-meta-rocket, .gp-meta-card { animation: none } }
`;

export default function MetaNews() {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const heard = useRef(new Set());
  const load = useCallback(() => api.metaNews().then((x) => setRows(x.rows || [])).catch(() => {}), []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, [load]);

  const cur = rows[0];
  const good = cur ? goodNews(cur) : null;
  // One sound per new item: the milestone fanfare for good news.
  useEffect(() => {
    if (cur && !heard.current.has(cur.id)) {
      heard.current.add(cur.id);
      chime(good ? { kind: 'milestone' } : { kind: 'alert', severity: cur.severity === 'info' ? 'info' : 'critical' });
    }
  }, [cur, good]);

  if (!cur) return null;
  const done = async () => {
    setBusy(true);
    try { await api.ackAlert(cur.id); } catch { /* shown again next time */ }
    setRows((r) => r.slice(1));
    setBusy(false);
  };
  const when = new Date(cur.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 ${good ? 'bg-[#063b2a]/80' : 'bg-ink/60'}`}
      role="dialog" aria-modal="true" aria-labelledby="meta-news-title">
      <style>{STYLE}</style>
      {good && <Bubbles />}
      <div className="gp-meta-card relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-2xl">
        {good && <span className="gp-meta-rocket" aria-hidden="true">🚀</span>}
        {good ? (
          <div className="text-center">
            <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
              <span className="gp-meta-ring" aria-hidden="true" />
              <span className="gp-meta-ring" style={{ animationDelay: '.8s' }} aria-hidden="true" />
              <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-good-500 text-4xl text-white shadow-lg">🎉</span>
            </div>
            <div className="mt-3 text-2xs font-semibold uppercase tracking-wider text-good-700">Good news from Meta{rows.length > 1 ? ` · 1 of ${rows.length}` : ''}</div>
            <h2 id="meta-news-title" className="mt-1 text-xl font-bold text-ink">
              {good.kind === 'limit' ? 'WhatsApp limit raised!' : good.kind === 'cap' ? 'More phone numbers allowed!' : 'Display name approved!'}
            </h2>
            {good.kind === 'limit' && (
              <div className="mt-3">
                <div className="text-4xl font-extrabold text-good-700"><Counter to={good.to} /></div>
                <div className="text-xs text-muted">customers a day you can message first — up from 250</div>
              </div>
            )}
            {good.cap && <div className="mt-2 text-sm text-body">Phone numbers allowed: <b className="text-ink">{good.cap}</b> (was 2)</div>}
            <p className="mt-3 whitespace-pre-line rounded-lg bg-good-50 p-3 text-left text-xs text-body">{cur.description || '—'}</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <span className={`flex h-11 w-11 items-center justify-center rounded-full text-2xl ${cur.severity === 'info' ? 'bg-brand/10' : 'bg-watch-50'}`}>📣</span>
              <div>
                <div className="text-2xs font-semibold uppercase tracking-wider text-muted">Message from Meta{rows.length > 1 ? ` · 1 of ${rows.length}` : ''}</div>
                <h2 id="meta-news-title" className="text-base font-bold text-ink">{String(cur.title || '').replace(/^📣\s*/, '')}</h2>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-line rounded-lg bg-shell p-3 text-sm text-body">{cur.description || '—'}</p>
          </>
        )}
        <p className={`mt-2 text-2xs text-muted ${good ? 'text-center' : ''}`}>
          {when}{' · '}<Link to="/alerts" className="text-brand hover:underline" onClick={done}>See all alerts</Link>
        </p>
        <button type="button" autoFocus disabled={busy} onClick={done}
          className={`mt-5 w-full ${good ? 'btn bg-good-500 text-white hover:opacity-90' : 'btn-primary'}`}>
          {busy ? '…' : rows.length > 1 ? 'Got it — next' : good ? 'Awesome — got it' : 'Got it'}
        </button>
      </div>
    </div>
  );
}
