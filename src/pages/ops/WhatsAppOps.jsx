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
        </div>
      )}
    </Shell>
  );
}
