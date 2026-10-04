import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Modal } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { ago } from '../../lib/format';

/**
 * GIFT FULL REPORTS (user, 2026-10-04). Pick paying customers — only people
 * who have paid for a report appear — give each N full reports valid for D
 * days, and tell them on WhatsApp with an approved template. On WhatsApp,
 * "Full report" then uses a gift instead of asking for money until none are
 * left. Back end: src/admin/gifts.js.
 */
const FIELDS = [
  ['gift_count', 'Number of free reports'], ['gift_expiry', 'Valid until (date)'],
  ['first_name', 'Customer first name'], ['full_name', 'Customer full name'], ['last_vehicle', 'Their last vehicle'],
];

/*
 * THE AUTOMATIC GIFT (user, 2026-10-04): switch on a rule and every paying
 * customer who qualifies gets it once per round, the next time they use
 * GaadiPe on WhatsApp — no message to send. "Start a new round" gives
 * everyone a fresh one.
 */
function AutoGift({ onChanged }) {
  const [a, setA] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.giftAuto().then((x) => { setA(x); setF({
    on: x.rule.on, count: String(x.rule.count), days: String(x.rule.days), min_paid: String(x.rule.min_paid),
    paid_within_days: x.rule.paid_within_days == null ? '' : String(x.rule.paid_within_days) }); }).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  if (!a || !f) return <Skeleton rows={3} />;

  const save = async (patch = {}) => {
    setBusy(true);
    try {
      const r = await api.setGiftAuto({ ...f, ...patch });
      snack(r.rule.on ? `On — ${r.eligible} paying customer${r.eligible === 1 ? '' : 's'} qualify` : 'Automatic gift is off');
      load(); onChanged?.();
    } catch (e) { snack(e.message || 'Could not save', 'wrong'); } finally { setBusy(false); }
  };
  const field = (k, label, w = '!w-20') => (
    <label className="text-2xs font-semibold text-muted" htmlFor={`ag-${k}`}>{label}
      <input id={`ag-${k}`} className={`input mt-1 ${w}`} inputMode="numeric" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <section className={`card p-4 ${a.rule.on ? 'border-good-500/40 bg-good-50/40' : ''}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink">🎁 Automatic gift for paying customers</h2>
          <p className="text-2xs text-muted">
            Every paying customer who qualifies gets the gift once, the next time they use GaadiPe on WhatsApp — they see “🎁 You have {f.count} free full
            reports” with their next check. No message is sent, so it costs nothing until a report is used.
          </p>
        </div>
        <button type="button" role="switch" aria-checked={f.on} disabled={busy}
          onClick={() => save({ on: !a.rule.on })}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${a.rule.on ? 'bg-brand' : 'bg-line'}`}>
          <span className={`inline-block h-6 w-6 rounded-full bg-white shadow transition ${a.rule.on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {field('count', 'Free reports each')}
        {field('days', 'Valid for (days)')}
        {field('min_paid', 'Paid at least (times)')}
        {field('paid_within_days', 'Paid within last (days, empty = any time)', '!w-28')}
        <button type="button" className="btn-quiet !py-2 text-sm" disabled={busy} onClick={() => save({ on: a.rule.on })}>Save</button>
        {a.rule.on && <button type="button" className="btn-quiet !py-2 text-sm" disabled={busy}
          onClick={() => window.confirm('Start a new round? Every qualifying paying customer gets a fresh gift when they next come back.') && save({ on: true, new_round: true })}>Start a new round</button>}
      </div>
      <p className="mt-3 text-2xs text-body">
        {a.rule.on
          ? <>Round started {ago(a.rule.started_at)} · <b className="text-ink">{a.eligible}</b> paying customers qualify · <b className="text-ink">{a.received}</b> have received it so far.</>
          : <>Off. {a.eligible} paying customers would qualify with these settings.</>}
      </p>
    </section>
  );
}

export default function GiftReports() {
  const [q, setQ] = useState('');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [count, setCount] = useState('2');
  const [days, setDays] = useState('30');
  const [note, setNote] = useState('');
  const [tpls, setTpls] = useState([]);
  const [tpl, setTpl] = useState('');
  const [vars, setVars] = useState([]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.giftCustomers({ q: q || undefined }).then((x) => { setD(x); setError(null); }).catch(setError), [q]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);
  useEffect(() => { api.broadcasts().then((b) => setTpls((b.templates?.templates || b.templates || []).filter((t) => t.sendable))).catch(() => {}); }, []);

  const template = useMemo(() => tpls.find((t) => `${t.name}|${t.language}` === tpl), [tpls, tpl]);
  useEffect(() => { setVars((template?.variables || []).map(() => '')); }, [template]);

  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = () => setPicked((s) => (d && s.size === d.rows.length ? new Set() : new Set((d?.rows || []).map((r) => r.id))));

  const grant = async () => {
    setBusy(true);
    try {
      const r = await api.grantGifts({
        userIds: [...picked], count: Number(count), days: Number(days), note,
        message: template ? { template_name: template.name, language: template.language, variables: vars } : null,
      });
      snack(`Gave ${r.each} free report${r.each === 1 ? '' : 's'} to ${r.customers} customer${r.customers === 1 ? '' : 's'}${r.broadcast?.ok ? ' · message queued' : ''}`);
      if (r.broadcast && !r.broadcast.ok) snack(`Gifts given, but the message was not sent: ${r.broadcast.message || r.broadcast.error}`, 'wrong');
      setConfirm(false); setPicked(new Set()); load();
    } catch (e) { snack(e.message || 'Could not give', 'wrong'); } finally { setBusy(false); }
  };
  const revoke = async (r) => {
    if (!window.confirm(`Take back ${r.gifts_left} unused free report(s) from ${r.name || r.masked}?`)) return;
    await api.revokeGifts(r.id).catch((e) => snack(e.message, 'wrong')); load();
  };

  const s = d?.summary;
  return (
    <Shell title="Gift full reports" subtitle="Give paying customers free full reports — used on WhatsApp instead of paying">
      <AutoGift onChanged={load} />
      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink">Or give to chosen customers now</h2>
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Given', s.given], ['Used', s.used], ['Still open', s.open], ['Customers', s.customers]].map(([l, v]) => (
            <div key={l} className="card px-3 py-2"><div className="text-2xs font-semibold uppercase tracking-wider text-muted">{l}</div><div className="tabular text-xl font-semibold text-ink">{v}</div></div>
          ))}
        </div>
      )}

      <section className="card mb-4 grid gap-3 p-4 md:grid-cols-[auto_auto_1fr] md:items-end">
        <label className="text-2xs font-semibold text-muted" htmlFor="g-count">Free reports each
          <input id="g-count" className="input mt-1 !w-24" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <label className="text-2xs font-semibold text-muted" htmlFor="g-days">Valid for (days)
          <input id="g-days" className="input mt-1 !w-24" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <label className="text-2xs font-semibold text-muted" htmlFor="g-note">Note for the record (optional)
          <input id="g-note" className="input mt-1" placeholder="e.g. Diwali thank-you" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="md:col-span-3">
          <label className="text-2xs font-semibold text-muted" htmlFor="g-tpl">Tell them on WhatsApp (approved template, optional)</label>
          <select id="g-tpl" className="input mt-1" value={tpl} onChange={(e) => setTpl(e.target.value)}>
            <option value="">Don’t send a message</option>
            {tpls.map((t) => <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>{t.name} ({t.language}) · {t.category}</option>)}
          </select>
          {template && (
            <div className="mt-2 rounded-lg bg-shell p-3">
              <p className="whitespace-pre-wrap text-2xs text-body">{template.body}</p>
              {template.variables?.map((v, i) => (
                <label key={v} className="mt-2 flex items-center gap-2 text-2xs text-muted" htmlFor={`g-var-${i}`}>
                  <span className="w-10 font-mono">{`{{${v}}}`}</span>
                  <input id={`g-var-${i}`} className="input !py-1 text-2xs" list="g-fields" placeholder="Pick a field or type text"
                    value={vars[i] || ''} onChange={(e) => setVars((a) => a.map((x, j) => (j === i ? e.target.value : x)))} />
                </label>
              ))}
              <datalist id="g-fields">{FIELDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</datalist>
              <p className="mt-2 text-[10px] text-muted">Fields: gift_count (e.g. 2), gift_expiry (the date), first_name, full_name, last_vehicle. Anything else is sent as typed.</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 md:col-span-3">
          <span className="text-sm text-body"><b className="text-ink">{picked.size}</b> selected</span>
          <button type="button" className="btn-primary ml-auto" disabled={!picked.size || busy} onClick={() => setConfirm(true)}>Give free reports…</button>
        </div>
      </section>

      <div className="mb-2 flex items-center gap-2">
        <input className="input !w-64 !py-1.5 text-sm" placeholder="Search name or last digits" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn-quiet !py-1.5 text-2xs" onClick={all}>{d && picked.size === d.rows.length && d.rows.length ? 'Clear all' : 'Select all shown'}</button>
      </div>
      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : !d.rows.length ? (
        <div className="card p-8 text-center text-sm text-muted">No paying customers match. Only people who have paid for a report can be given free ones.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-2xs text-muted">
              <th className="w-8 px-3 py-2" /><th className="px-3 py-2">Customer</th><th className="px-3 py-2 text-right">Paid</th>
              <th className="px-3 py-2">Last paid</th><th className="px-3 py-2">Free reports left</th><th className="px-3 py-2" />
            </tr></thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.id} className={`border-b border-line/60 last:border-0 ${picked.has(r.id) ? 'bg-brand/5' : ''}`}>
                  <td className="px-3 py-2"><input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name || r.masked}`} /></td>
                  <td className="px-3 py-2">{r.name || 'Unknown'} <span className="tabular text-2xs text-muted">{r.masked}</span></td>
                  <td className="px-3 py-2 text-right tabular">{r.paid}×</td>
                  <td className="px-3 py-2 text-2xs text-muted">{ago(r.last_paid)}</td>
                  <td className="px-3 py-2">{r.gifts_left ? <span className="rounded-full bg-good-50 px-2 py-0.5 text-2xs font-semibold text-good-700">🎁 {r.gifts_left}</span> : <span className="text-2xs text-muted">—</span>}</td>
                  <td className="px-3 py-2 text-right">{r.gifts_left > 0 && <button type="button" className="btn-quiet !py-1 text-2xs" onClick={() => revoke(r)}>Take back</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <Modal title="Give free full reports?" onClose={() => setConfirm(false)} busy={busy}
          footer={<>
            <button type="button" className="btn-quiet" onClick={() => setConfirm(false)} disabled={busy}>Cancel</button>
            <button type="button" className="btn-primary" onClick={grant} disabled={busy}>{busy ? 'Giving…' : 'Give'}</button>
          </>}>
          <p className="text-sm text-body">
            <b className="text-ink">{count}</b> free full report{Number(count) === 1 ? '' : 's'} each to <b className="text-ink">{picked.size}</b> customer{picked.size === 1 ? '' : 's'},
            valid for <b className="text-ink">{days} days</b>. {template ? <>They will be told with <b className="text-ink">{template.name}</b> (a WhatsApp template, charged by Meta).</> : 'No message is sent.'}
          </p>
          <p className="mt-2 text-2xs text-muted">Each free report costs you the vehicle lookup (about ₹3 while VAHAN is down) and no GST invoice is made.</p>
        </Modal>
      )}
    </Shell>
  );
}
