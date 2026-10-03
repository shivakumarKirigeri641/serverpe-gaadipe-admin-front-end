import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import ReplyBox from '../../components/ReplyBox.jsx';
import { Failed, Skeleton } from '../../components/ui.jsx';
import { ago, plate, rupees } from '../../lib/format';

/**
 * HOT LEADS (user, 2026-10-03): people who opened the ₹19 checkout in the last
 * two days and have not paid, whose WhatsApp window is still open — so a reply
 * from here is free. The warmest sales there are; each card has a reply box.
 */
const IDEAS = [
  'Hi! Your full report for {reg} is ready to unlock — it shows insurance, PUC, tax, fitness and challan details. Tap the payment link above whenever you’re ready. 🙏',
  'Hi! Did the payment page give any trouble? If you share what happened, I’ll help you finish it. 🙏',
];

export default function HotLeads() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.hotLeads().then((x) => { setD(x); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  return (
    <Shell title="Hot leads" subtitle="Opened the ₹19 checkout, not paid yet, and their WhatsApp window is open — a reply is free">
      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : !d.leads.length ? (
        <div className="card p-8 text-center text-sm text-muted">Nobody right now. People appear here when they open the ₹19 checkout and do not pay.</div>
      ) : (
        <>
          <p className="mb-3 text-sm text-body"><b className="text-ink">{d.leads.length}</b> {d.leads.length === 1 ? 'person' : 'people'} — newest checkout first. Replies are written by you; nothing is sent automatically.</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {d.leads.map((l) => (
              <article key={l.payment_id} className="card p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <b className="text-ink">{l.name || 'Unknown'}</b>
                  <span className="tabular text-2xs text-muted">••••••{String(l.mobile).slice(-4)}</span>
                  {l.reg_no && <span className="rounded bg-shell px-1.5 py-0.5 font-mono text-2xs font-semibold text-ink">{plate(l.reg_no)}</span>}
                  {l.paid_before > 0 && <span className="rounded-full bg-good-50 px-2 py-0.5 text-[10px] font-semibold text-good-700">Paid before ×{l.paid_before}</span>}
                  <Link className="ml-auto text-2xs text-brand hover:underline" to={`/journey?mobile=${l.mobile}`}>Journey →</Link>
                </div>
                <p className="mt-1 text-2xs text-muted">Checkout {rupees(l.amount_paise)} opened {ago(l.checkout_at)} · last wrote {ago(l.last_inbound_at)}</p>
                {l.last_message && <p className="mt-2 rounded-lg bg-shell px-3 py-2 text-2xs text-body">“{l.last_message}”</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {IDEAS.map((t, i) => (
                    <button key={i} type="button" className="btn-quiet !px-2 !py-1 text-[10px]"
                      onClick={() => navigator.clipboard?.writeText(t.replace('{reg}', l.reg_no || 'your vehicle')).catch(() => {})}>
                      Copy idea {i + 1}
                    </button>
                  ))}
                </div>
                <div className="mt-2"><ReplyBox mobile={l.mobile} lastInboundAt={l.last_inbound_at} onSent={load} /></div>
              </article>
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}
