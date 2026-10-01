import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Table, Hint } from '../../components/ui.jsx';
import { rs, num } from './common.jsx';

/**
 * WHATSAPP OPERATIONS (user, 2026-09-25) — what WhatsApp costs and what it
 * brings in: today, yesterday, 7 and 30 days side by side. Messages, receipts,
 * blocks and the chat funnel stay on the WhatsApp Command Center. Costs are
 * estimates at the per-category rates in Settings until Meta billing is
 * imported, and say so.
 */
export default function WhatsAppOps() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.whatsappEconomics()); } catch (e) { setError(e); } }, []);
  useEffect(() => { load(); }, [load]);
  const W = d?.windows || [];
  const row = (label, f, note) => (
    <tr key={label}>
      <td className="td text-ink">{note ? <Hint note={note}><span>{label}</span></Hint> : label}</td>
      {W.map((w) => <td key={w.range} className="td tabular">{f(w)}</td>)}
    </tr>
  );
  const cats = [...new Set(W.flatMap((w) => w.categories.map((c) => c.category)))];
  return (
    <Shell title="WhatsApp operations" subtitle="Cost, revenue and contribution" actions={<Link to="/whatsapp" className="btn-quiet !py-1.5 text-2xs">Messages & delivery →</Link>}>
      {error && !d ? <div className="card"><Failed error={error} onRetry={load} /></div> : !d ? <div className="card"><Skeleton rows={10} /></div> : (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <Table head={<tr><th className="th" />{W.map((w) => <th key={w.range} className="th">{w.label}</th>)}</tr>}>
              {row('Messages received', (w) => num(w.received))}
              {row('Messages sent', (w) => num(w.sent))}
              {row('Unique WhatsApp users', (w) => num(w.users))}
              {row('User-initiated conversations', (w) => num(w.user_initiated), d.notes.conversations)}
              {row('Business-initiated (templates)', (w) => num(w.business_initiated), d.notes.conversations)}
              {cats.map((c) => row(`${c.charAt(0)}${c.slice(1).toLowerCase()} templates`, (w) => {
                const x = w.categories.find((y) => y.category === c);
                return x ? `${num(x.messages)} · ${rs(x.cost_paise)}` : '—';
              }, `At ${rs(d.rates[c] ?? d.rates.OTHER)} per message (Settings).`))}
              {row('WhatsApp cost', (w) => <b>{rs(w.cost_paise)}</b>, d.notes.estimate)}
              {row('WhatsApp revenue', (w) => rs(w.revenue_paise), 'Payments whose conversion channel was WhatsApp (ledger).')}
              {row('Payments completed', (w) => num(w.payments))}
              {row('Reports delivered', (w) => num(w.reports_delivered))}
              {row('Cost per paying customer', (w) => (w.cost_per_paying_customer_paise == null ? '—' : rs(w.cost_per_paying_customer_paise)))}
              {row('Cost per report delivered', (w) => (w.cost_per_report_paise == null ? '—' : rs(w.cost_per_report_paise)))}
              {row('WhatsApp contribution', (w) => <b className={w.contribution_paise < 0 ? 'text-wrong-700' : 'text-good-700'}>{rs(w.contribution_paise)}</b>, d.notes.contribution)}
            </Table>
          </div>
          <div className="space-y-0.5 text-2xs text-muted"><p>{d.notes.estimate}</p><p>{d.notes.contribution}</p></div>
          <BroadcastCosts />
        </div>
      )}
    </Shell>
  );
}

/*
 * BROADCASTS & THEIR COST (user, 2026-10-01): every broadcast — sent, delivered,
 * read, failed — and what it cost at its template's Meta category rate; then
 * all template messages month by month. Estimates until Meta's invoice is imported.
 */
function BroadcastCosts() {
  const [b, setB] = useState(null);
  useEffect(() => { api.broadcastCosts().then(setB).catch(() => setB(null)); }, []);
  if (!b) return null;
  const pct = (a, of) => (of ? `${Math.round((a / of) * 100)}%` : '—');
  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        {[['Broadcasts', num(b.total.broadcasts)], ['Messages sent by broadcasts', num(b.total.sent)], ['Broadcast cost (estimate)', rs(b.total.cost_paise)]].map(([l, v]) => (
          <div key={l} className="card px-4 py-3"><div className="text-2xs font-semibold uppercase tracking-wider text-muted">{l}</div><div className="mt-1 text-xl font-bold text-ink">{v}</div></div>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Broadcasts</div>
        {!b.broadcasts.length ? <p className="p-4 text-sm text-muted">No broadcasts yet.</p> : (
          <Table head={<tr>{['Sent on', 'Template', 'Category', 'Sent', 'Delivered', 'Read', 'Failed / skipped', 'Rate', 'Cost'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
            {b.broadcasts.map((x) => (
              <tr key={x.id}>
                <td className="td text-2xs">{new Date(x.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td className="td font-mono text-2xs">{x.template_name}</td>
                <td className="td text-2xs">{x.category.charAt(0)}{x.category.slice(1).toLowerCase()}</td>
                <td className="td tabular">{num(x.sent)}</td>
                <td className="td tabular">{num(x.delivered)} <span className="text-2xs text-muted">{pct(x.delivered, x.sent)}</span></td>
                <td className="td tabular">{num(x.read)} <span className="text-2xs text-muted">{pct(x.read, x.sent)}</span></td>
                <td className="td tabular text-2xs">{num(x.failed)} / {num(x.skipped)}</td>
                <td className="td tabular text-2xs">{rs(x.rate_paise)}</td>
                <td className="td tabular font-semibold">{rs(x.cost_paise)}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <div className="card overflow-x-auto">
        <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">All template messages, by month</div>
        <Table head={<tr>{['Month', 'Messages', 'By category', 'Cost (estimate)'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
          {b.months.map((m) => (
            <tr key={m.month}>
              <td className="td">{new Date(`${m.month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</td>
              <td className="td tabular">{num(m.messages)}</td>
              <td className="td text-2xs">{Object.entries(m.categories).map(([c, n]) => `${c.charAt(0)}${c.slice(1).toLowerCase()} ${n}`).join(' · ')}</td>
              <td className="td tabular font-semibold">{rs(m.cost_paise)}</td>
            </tr>
          ))}
        </Table>
        <p className="px-4 py-2 text-2xs text-muted">Rates: marketing {rs(b.rates.MARKETING)} · utility {rs(b.rates.UTILITY)} per message (Configuration). Replies inside the 24-hour window are free.</p>
      </div>
    </>
  );
}
