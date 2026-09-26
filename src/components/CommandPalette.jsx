import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { allowed } from '../lib/session';

/**
 * QUICK FIND (user, 2026-09-26) — Ctrl+K (⌘K) from any screen, or the header's
 * "Quick find" button. Type what you want in your own words:
 *
 *   How do I…   plain questions ("is the email confirmed", "switch off test
 *               mode", "download GST") → the screen, and what to do there
 *   Screens     every screen, by name, group or everyday word
 *   Settings    common settings by what they do → Settings, filtered to it
 *   Jump to     a vehicle number, a phone, a payment / order / report ID →
 *               straight to that record (or a search for it)
 *   Recent, Pinned  the screens you use (☆ pins one; kept in this browser)
 *
 * Front end only: it knows the panel, and hands anything about data to the
 * screens and the existing search.
 */

/* Questions people ask, the screen that answers each, and what to do there. */
const TASKS = [
  ['Is a customer’s email confirmed?', '/journey', 'Search their number — the Email line says Confirmed / Not confirmed.', 'customer email verified confirm'],
  ['Turn customer-email test mode off', '/settings?q=customer_email_only_to', 'Empty customer_email_only_to and save.', 'test mode live email'],
  ['Stop admin WhatsApp notices going only to my number', '/settings?q=notify_wa_only_from', 'Empty notify_wa_only_from and save.', 'test mode notice admin whatsapp'],
  ['See one customer’s whole story', '/journey', 'Search their number: every step, message, payment.', 'customer history timeline person'],
  ['Read a customer’s WhatsApp chat', '/conversations', 'Open their conversation.', 'messages chat whatsapp'],
  ['Who is chatting right now', '/live', 'Live chats as they happen.', 'now live chat online'],
  ['What is happening right now', '/activity', 'Every event, live; pause any time.', 'live stream events now'],
  ['Today’s revenue and numbers', '/', 'Business Health — Today’s summary at the top.', 'today revenue sales money summary'],
  ['Find a payment by Razorpay / order ID', '/search', 'Paste the pay_… or order_… ID in the search.', 'payment razorpay order transaction'],
  ['Why did a payment fail', '/payments/failures', 'Failure reasons from Razorpay.', 'payment failed error declined'],
  ['Payments started but not finished', '/payments/abandoned', 'Who left at checkout, and why if known.', 'abandoned unpaid checkout left'],
  ['Check payments against Razorpay', '/payments/reconciliation', 'Run reconciliation; review anything that does not match.', 'reconcile mismatch razorpay'],
  ['Refunds', '/payments/refunds', 'Refunds made at Razorpay (read-only).', 'refund'],
  ['Download GST / accounting CSV', '/finance/export', 'Pick the month / quarter / FY, then download.', 'gst tax accounts csv export ca'],
  ['Profit on each transaction', '/profitability?tab=transactions', 'GST, gateway, API and WhatsApp cost per payment.', 'profit margin net contribution'],
  ['Change the report price', '/configuration', 'Report price → Change.', 'price 19 29 rupees'],
  ['Change the GST rate', '/configuration', 'GST rate → Change (owner).', 'gst rate tax percent'],
  ['Switch payments / WhatsApp / website off, or maintenance mode', '/flags', 'Feature flags — confirm the switch.', 'maintenance switch off disable pause'],
  ['Everything about a vehicle', '/vehicles', 'Type the number; open the vehicle.', 'vehicle rc car bike registration'],
  ['Check a vehicle from the records API', '/check', 'Look a vehicle up yourself.', 'lookup rc check vahan'],
  ['Vehicles with expired insurance', '/vehicles?insurance=expired', 'Filtered list.', 'insurance expired'],
  ['Vehicles with expired PUC', '/vehicles?puc=expired', 'Filtered list.', 'puc pollution expired'],
  ['Vehicles with pending challans', '/vehicles?view=challans', 'Filtered list.', 'challan fine pending'],
  ['Blacklisted vehicles', '/vehicles?view=blacklisted', 'Filtered list.', 'blacklist ntbt noc'],
  ['Was a report delivered?', '/reports/delivery', 'Delivered, link-only, failed — and paid-without-report.', 'report pdf delivered sent'],
  ['Download a report or invoice', '/documents', 'Reports & invoices.', 'pdf invoice report download'],
  ['Give someone a free report', '/free-reports', 'Free reports.', 'free credit'],
  ['Send a WhatsApp broadcast', '/campaigns', 'Campaigns → Broadcast; only APPROVED templates send.', 'broadcast announcement template bulk'],
  ['Are my WhatsApp templates approved?', '/campaigns', 'Broadcast shows each template’s status from Meta.', 'template approved meta status'],
  ['Email customers', '/customer-emails', 'Only confirmed, subscribed addresses receive it.', 'email campaign newsletter'],
  ['WhatsApp cost', '/whatsapp/operations', 'Cost by category, per paying customer, contribution.', 'whatsapp cost meta billing'],
  ['Where customers come from', '/attribution', 'Source → campaign → customers.', 'source campaign utm google ads marketing'],
  ['Where people drop off', '/drop-off', 'The funnel, stage by stage.', 'funnel conversion drop'],
  ['Repeat customers', '/retention', 'New vs returning, cohorts.', 'retention repeat returning cohort'],
  ['Is everything working?', '/health', 'Every service with its status.', 'health status down up working'],
  ['Did the background jobs run?', '/jobs', 'Status, last run, errors; run or pause.', 'jobs cron background failed'],
  ['Server CPU, memory, disk, SSL', '/infrastructure', 'The server and certificates.', 'server cpu ram disk ssl domain pm2'],
  ['Records API speed and cost', '/api-providers', 'VAHAN, eChallan, FASTag side by side.', 'api ulip vahan latency slow'],
  ['Back up the database', '/backups', 'Backup status; the owner downloads from Settings.', 'backup database restore'],
  ['Who changed what', '/audit', 'Audit log — filter by words or dates.', 'audit log history who changed'],
  ['Add an admin or change a role', '/people', 'Admin users (owner).', 'admin user role add staff'],
  ['What can each role do', '/permissions', 'The permission matrix.', 'permissions roles access'],
  ['Mute or tune an alert', '/alert-rules', 'Thresholds and mute.', 'alert threshold mute notification'],
  ['Team tasks', '/tasks', 'Create, assign, complete.', 'task todo follow up'],
  ['Export data to CSV', '/exports', 'Vehicles, customers, payments, revenue, API logs, audit.', 'export csv excel download'],
  ['Block a number or vehicle', '/blocks', 'Blocked.', 'block ban spam'],
  ['Animation and refresh settings', '/preferences', 'Display & motion.', 'animation motion refresh speed'],
];

/* Common settings by what they do (→ Settings, filtered). */
const SETTINGS = [
  ['customer_email_only_to', 'Customer email test mode'], ['customer_email_enabled', 'Customer emails on / off'],
  ['notify_wa_only_from', 'Admin WhatsApp notices — test number'], ['backup_scheduled_enabled', 'Scheduled server backups'],
  ['whatsapp_cost_paise_marketing', 'WhatsApp marketing cost'], ['whatsapp_cost_paise_utility', 'WhatsApp utility cost'],
  ['razorpay_fee_percent', 'Razorpay fee %'], ['alert_daily_revenue_target_paise', 'Daily revenue target alert'],
  ['report_valid_days', 'Report download window'], ['admin_session_hours', 'Admin session length'],
  ['vehicle_expiring_days', '“Expiring soon” days'], ['admin_report_access_enabled', 'Owner report-access switch'],
];

const RECENT_KEY = 'gp.qf.recent'; const PIN_KEY = 'gp.qf.pinned';
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };

/** Remember a visited screen (the Shell calls this). */
export function rememberVisit(to, label) {
  if (!to || to.startsWith('/search')) return;
  const next = [{ to, label }, ...load(RECENT_KEY).filter((r) => r.to !== to)].slice(0, 8);
  keep(RECENT_KEY, next);
}

/* Every word must appear somewhere; earlier and whole-word hits rank higher. */
function score(hay, words) {
  const h = hay.toLowerCase();
  let s = 0;
  for (const w of words) {
    const i = h.indexOf(w);
    if (i < 0) return -1;
    s += (i === 0 ? 6 : 0) + (new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(h) ? 3 : 1);
  }
  return s;
}

/* What the typed text looks like: a vehicle, a phone, an ID. */
function jumps(q) {
  const t = q.trim(); if (!t) return [];
  const plate = t.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = t.replace(/\D/g, '');
  const out = [];
  if (/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(plate) && plate.length >= 6) out.push({ label: `Open vehicle ${plate}`, to: `/vehicles/${plate}`, hint: 'Its full profile.' });
  if (/^\d{10,12}$/.test(digits) && digits.length === t.replace(/[\s+-]/g, '').length) out.push({ label: `Customer with number ${digits.slice(-10)}`, to: `/journey?mobile=${digits.slice(-10)}`, hint: 'Their whole journey.' });
  if (/^(pay|order|plink)_/i.test(t)) out.push({ label: `Find payment ${t}`, to: `/search?q=${encodeURIComponent(t)}`, hint: 'In payments.' });
  if (/^(RPT|INV)/i.test(t)) out.push({ label: `Find ${t}`, to: `/search?q=${encodeURIComponent(t)}`, hint: 'Report or invoice.' });
  if (t.length >= 2) out.push({ label: `Search all data for “${t}”`, to: `/search?q=${encodeURIComponent(t)}`, hint: 'Vehicles, customers, payments, reports, events.' });
  return out;
}

export default function CommandPalette({ nav, can, open, onClose }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const [pinned, setPinned] = useState(() => load(PIN_KEY));
  const box = useRef(null);
  const list = useRef(null);
  useEffect(() => { if (open) { setQ(''); setAt(0); setTimeout(() => box.current?.focus(), 10); } }, [open]);

  const screens = useMemo(() => nav.flatMap((g) => g.items.map((i) => ({ to: i.to, label: i.label, group: g.group, icon: i.icon }))), [nav]);
  const canOpen = (to) => screens.some((s) => to.split('?')[0].startsWith(s.to.split('?')[0])) || ['/search', '/journey', '/customer-emails', '/preferences'].some((p) => to.startsWith(p));

  const sections = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) {
      const pins = pinned.map((to) => screens.find((s) => s.to === to)).filter(Boolean).map((s) => ({ ...s, hint: s.group, pin: true }));
      const recent = load(RECENT_KEY).filter((r) => !pinned.includes(r.to)).slice(0, 6).map((r) => ({ to: r.to, label: r.label || r.to, hint: 'Recently opened' }));
      return [['Pinned', pins], ['Recent', recent],
        ['Try asking', TASKS.slice(0, 6).filter(([, to]) => canOpen(to)).map(([label, to, hint]) => ({ label, to, hint }))]].filter(([, r]) => r.length);
    }
    const rank = (rows) => rows.filter((r) => r.s >= 0).sort((a, b) => b.s - a.s);
    const tasks = rank(TASKS.filter(([, to]) => canOpen(to)).map(([label, to, hint, kw]) => ({ label, to, hint, s: score(`${label} ${kw}`, words) }))).slice(0, 6);
    const scr = rank(screens.map((s) => ({ ...s, hint: s.group, s: score(`${s.label} ${s.group}`, words) }))).slice(0, 8);
    const sets = allowed(can, 'settings')
      ? rank(SETTINGS.map(([key, label]) => ({ label, to: `/settings?q=${key}`, hint: key, s: score(`${label} ${key.replace(/_/g, ' ')}`, words) }))).slice(0, 4) : [];
    // A vehicle, phone or ID goes first; the general data search is the last resort, so
    // for plain words the first (Enter) answer is a task or screen.
    const j = jumps(q);
    const direct = j.filter((x) => !x.label.startsWith('Search all data'));
    const general = j.filter((x) => x.label.startsWith('Search all data'));
    return [['Jump to', direct], ['How do I…', tasks], ['Screens', scr], ['Settings', sets], ['Search the data', general]].filter(([, r]) => r.length);
  }, [q, screens, pinned, can]); // eslint-disable-line react-hooks/exhaustive-deps

  const flat = sections.flatMap(([, rows]) => rows);
  const go = (r) => { onClose(); navigate(r.to); };
  const pin = (to) => setPinned((p) => { const n = p.includes(to) ? p.filter((x) => x !== to) : [...p, to].slice(-8); keep(PIN_KEY, n); return n; });
  useEffect(() => { list.current?.querySelector(`[data-i="${at}"]`)?.scrollIntoView({ block: 'nearest' }); }, [at]);
  if (!open) return null;

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt((i) => Math.min(flat.length - 1, i + 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAt((i) => Math.max(0, i - 1)); }
    if (e.key === 'Enter' && flat[at]) { e.preventDefault(); go(flat[at]); }
    if (e.key === 'Escape') onClose();
  };
  let n = -1;
  return (
    <div className="m-overlay fixed inset-0 z-[60] flex items-start justify-center bg-ink/30 px-4 pt-[10vh]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Quick find" className="m-modal w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-white shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-muted" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={box} value={q} onChange={(e) => { setQ(e.target.value); setAt(0); }} onKeyDown={onKey}
            className="w-full bg-transparent py-3.5 text-[15px] text-ink outline-none placeholder:text-muted"
            placeholder="What do you want to do? e.g. “email confirmed”, “GST”, KA01AB1234" aria-label="Quick find" />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">Esc</kbd>
        </div>
        <div ref={list} className="nav-scroll max-h-[60vh] overflow-y-auto py-1">
          {!flat.length ? <p className="px-4 py-6 text-center text-sm text-muted">Nothing matches “{q}”. Try other words — or press Enter on “Search all data”.</p> : sections.map(([title, rows]) => (
            <div key={title} className="py-1">
              <div className="px-4 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">{title}</div>
              {rows.map((r) => {
                n += 1; const i = n; const Icon = r.icon;
                return (
                  <div key={`${title}${r.to}${r.label}`} data-i={i} onMouseEnter={() => setAt(i)}
                    className={`group flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors duration-100 ${i === at ? 'bg-brand/8' : ''}`} onClick={() => go(r)}>
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-shell text-muted">
                      {Icon ? <Icon /> : <span className="text-[11px]">{title === 'How do I…' ? '?' : title === 'Settings' ? '⚙' : title === 'Jump to' ? '→' : '•'}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm ${i === at ? 'font-semibold text-brand-deep' : 'text-ink'}`}>{r.label}</span>
                      {r.hint && <span className="block truncate text-[11px] text-muted">{r.hint}</span>}
                    </span>
                    {(title === 'Screens' || title === 'Pinned') && (
                      <button type="button" onClick={(e) => { e.stopPropagation(); pin(r.to); }} aria-label={pinned.includes(r.to) ? 'Unpin' : 'Pin to the top'}
                        className={`text-sm ${pinned.includes(r.to) ? 'text-watch-500' : 'text-line group-hover:text-muted'}`}>{pinned.includes(r.to) ? '★' : '☆'}</button>
                    )}
                    {i === at && <kbd className="rounded border border-line px-1.5 text-[10px] text-muted">↵</kbd>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-line bg-shell/60 px-4 py-1.5 text-[10px] text-muted">
          <span>↑↓ move · ↵ open · ☆ pin</span><span>Ctrl K anywhere</span>
        </div>
      </div>
    </div>
  );
}
