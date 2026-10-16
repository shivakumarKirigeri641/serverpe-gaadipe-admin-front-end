import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import ReplyMany from '../../components/ReplyMany.jsx';
import { snack } from '../../components/Live.jsx';
import { ago, plate } from '../../lib/format';

/**
 * HOT LEADS → EMAIL NOT CONFIRMED / FEEDBACK (user, 2026-10-16), each in two parts:
 *   Inside 24 h   free WhatsApp reply to everyone ticked (Reply many), ready-made text and buttons
 *   Outside 24 h  email: the confirmation link again, or the one-tap feedback email
 * No WhatsApp template anywhere. Server: admin/engage.js — it refuses repeats (3 days for a
 * confirmation email, 14 for a feedback ask) whatever is ticked here.
 */
const TEXT = {
  email: 'Hi {name} 👋 Quick tip from GaadiPe: add your email as a *backup* for your vehicle alerts — if WhatsApp is ever unavailable, your challan alerts, expiry reminders and reports still reach you. 📧\n\nTap *Email for alerts* below, type your email and enter the 4-digit code. Takes 30 seconds 🙏',
  feedback: 'Hi {name} 👋 How useful has GaadiPe been for you? One tap below helps us a lot 🙏',
};
const BUTTONS = { email: ['menu_email', 'menu'], feedback: ['fb_good', 'fb_ok', 'fb_bad'] };

function Row({ r, kind, ticked, onTick, outside }) {
  const blocked = outside && !r.can_email;
  const why = !blocked ? null
    : kind === 'email' ? (!r.has_address ? 'no email given — can only be asked on WhatsApp' : `confirmation email sent ${ago(r.last_mail)} — wait 3 days`)
      : (!r.email_ok ? 'no confirmed email — can only be asked on WhatsApp' : `asked ${ago(r.last_asked)} — wait 14 days`);
  return (
    <li className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${ticked ? 'border-brand bg-brand/5' : 'border-line bg-white'} ${blocked ? 'opacity-60' : ''}`}>
      <input type="checkbox" className="h-4 w-4 accent-brand" disabled={blocked} checked={ticked} onChange={onTick} aria-label={`Select ${r.name || 'this person'}`} />
      <b className="text-ink">{r.name || 'Unknown'}</b>
      <span className="tabular text-2xs text-muted">••••••{String(r.mobile).slice(-4)}</span>
      {r.reg_no && <span className="rounded bg-shell px-1.5 py-0.5 font-mono text-2xs font-semibold text-ink">{plate(r.reg_no)}</span>}
      {kind === 'email' && r.paid && <span className="rounded-full bg-good-50 px-2 py-0.5 text-[10px] font-semibold text-good-700">Paid</span>}
      {r.email && <span className="text-2xs text-muted">✉ {r.email}{kind === 'email' ? ' (not confirmed)' : ''}</span>}
      <span className="ml-auto text-2xs text-muted">
        {kind === 'feedback' && r.paid_at ? `paid ${ago(r.paid_at)} · ` : ''}{r.last_inbound_at ? `last wrote ${ago(r.last_inbound_at)}` : 'never wrote'}
        {kind === 'feedback' && r.last_asked && !blocked ? ` · asked ${ago(r.last_asked)}` : ''}
      </span>
      <Link className="text-2xs text-brand hover:underline" to={`/journey?mobile=${r.mobile}`}>Journey →</Link>
      {why && <span className="w-full text-[11px] text-watch-700">{why}</span>}
    </li>
  );
}

function Part({ title, note, rows, kind, outside, onReload }) {
  const [ticked, setTicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const can = rows.filter((r) => !outside || r.can_email);
  const toggle = (id) => setTicked((s) => { const x = new Set(s); if (x.has(id)) x.delete(id); else x.add(id); return x; });
  const all = can.length > 0 && can.every((r) => ticked.has(r.user_id));
  const chosen = rows.filter((r) => ticked.has(r.user_id));

  const email = async () => {
    const n = chosen.length;
    // eslint-disable-next-line no-alert
    if (!window.confirm(kind === 'email' ? `Send the confirmation email again to ${n}?` : `Send the one-tap feedback email to ${n}?`)) return;
    setBusy(true);
    try {
      const out = kind === 'email' ? await api.engageConfirmEmail(chosen.map((r) => r.user_id)) : await api.engageFeedbackEmail(chosen.map((r) => r.user_id));
      snack(kind === 'email' ? `${out.queued} confirmation email${out.queued === 1 ? '' : 's'} queued${out.skipped ? ` · ${out.skipped} skipped` : ''}`
        : `${out.sent} sent${out.failed ? ` · ${out.failed} failed` : ''}${out.skipped ? ` · ${out.skipped} skipped` : ''}`);
      setTicked(new Set()); onReload();
    } catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
  };

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <span className="rounded-full bg-shell px-2 py-0.5 text-[10px] font-semibold text-body">{rows.length}</span>
        {can.length > 0 && (
          <label className="ml-2 flex cursor-pointer items-center gap-1.5 text-2xs font-semibold text-ink">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={all}
              onChange={() => setTicked(all ? new Set() : new Set(can.map((r) => r.user_id)))} />
            {all ? 'Untick all' : `Select all ${can.length}`}
          </label>
        )}
        {outside && chosen.length > 0 && (
          <button type="button" className="btn-primary ml-auto !py-1.5 text-2xs" disabled={busy} onClick={email}>
            {busy ? 'Sending…' : kind === 'email' ? `✉ Send confirmation email to ${chosen.length}` : `✉ Send feedback email to ${chosen.length}`}
          </button>
        )}
      </div>
      <p className="mt-1 text-2xs text-muted">{note}</p>
      {!outside && chosen.length > 0 && (
        <div className="mt-3">
          <ReplyMany key={kind} people={chosen.map((r) => ({ mobile: r.mobile, name: r.name }))} presetText={TEXT[kind]} presetButtons={BUTTONS[kind]}
            onClear={() => setTicked(new Set())} onDone={onReload} />
        </div>
      )}
      {rows.length ? (
        <ul className="mt-3 space-y-1.5">
          {rows.map((r) => <Row key={r.user_id} r={r} kind={kind} outside={outside} ticked={ticked.has(r.user_id)} onTick={() => toggle(r.user_id)} />)}
        </ul>
      ) : <p className="mt-3 text-sm text-muted">Nobody here right now.</p>}
    </section>
  );
}

export default function EngageTab({ kind, data, onReload }) {
  const d = data?.[kind];
  if (!d) return null;
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Part kind={kind} rows={d.inside} onReload={onReload} title="💬 Inside 24 hours — free WhatsApp reply"
        note={kind === 'email'
          ? 'They wrote in the last 24 hours. Tick and send: a free message with the “Email for alerts” button (they type their email, then a 4-digit code).'
          : 'Paid customers who never gave feedback and wrote in the last 24 hours. A free message with the 😊 / 🙂 / 😞 buttons — one tap saves their rating.'} />
      <Part kind={kind} rows={d.outside} onReload={onReload} outside title="✉ Outside 24 hours — by email"
        note={kind === 'email'
          ? 'No WhatsApp template is used. Those who gave an address get the confirmation link again (at most every 3 days); those with no address can only be asked when they next write.'
          : 'No WhatsApp template is used. Those with a confirmed email get a one-tap rating email (at most every 14 days); the rest can only be asked when they next write.'} />
    </div>
  );
}
