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
/* Tabs by how far they got (user, 2026-10-04), each with its own reply ideas. */
const TABS = [
  ['checkout', '🔥 Opened payment', 'Opened the ₹19 checkout, did not pay — the warmest.'],
  ['checked', '🌡 Checked a vehicle', 'Saw the free check, did not tap ₹19.'],
  ['messaged', '💬 Just messaged', 'Wrote to GaadiPe, no vehicle checked yet.'],
];
const IDEAS = {
  checkout: [
    'Hi! Your full report for {reg} is ready to unlock — it shows insurance, PUC, tax, fitness and challan details. Tap the payment link above whenever you’re ready. 🙏',
    'Hi! Did the payment page give any trouble? If you share what happened, I’ll help you finish it. 🙏',
  ],
  checked: [
    'Hi! The free check for {reg} showed the basics. The full report has the exact insurance, PUC, tax and fitness dates and every challan — want me to send it? 🙏',
    'Hi! Any question about {reg}? Happy to help before you decide. 🙏',
  ],
  messaged: [
    'Hi! Send me any vehicle number, like KA01AB1234, and I’ll show its details right here — the basic check is free. 🙏',
    'Hi! How can I help you today? 🙏',
  ],
};

export default function HotLeads() {
  const [tab, setTab] = useState('checkout');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.hotLeads().then((x) => { setD(x); setError(null); }).catch(setError), []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);
  // Open on the warmest tab that has someone in it, once.
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    if (!d || picked) return;
    const first = TABS.find(([k]) => d.counts?.[k]);
    if (first) setTab(first[0]);
    setPicked(true);
  }, [d, picked]);

  return (
    <Shell title="Hot leads" subtitle="People whose WhatsApp window is open and who have not paid yet — a reply is free">
      {d && (
        <div className="mb-3 flex flex-wrap gap-1 border-b border-line" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {label} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${tab === k ? 'bg-brand text-white' : 'bg-shell text-body'}`}>{d.counts?.[k] || 0}</span>
            </button>
          ))}
        </div>
      )}
      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : !d.leads.filter((l) => l.stage === tab).length ? (
        <div className="card p-8 text-center text-sm text-muted">Nobody here right now. {TABS.find(([k]) => k === tab)[2]}</div>
      ) : (
        <>
          <p className="mb-3 text-sm text-body">{TABS.find(([k]) => k === tab)[2]} Newest first. Replies are written by you; nothing is sent automatically.</p>
          <div className="grid gap-3 lg:grid-cols-2">
            {d.leads.filter((l) => l.stage === tab).map((l) => (
              <article key={l.mobile} className="card p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <b className="text-ink">{l.name || 'Unknown'}</b>
                  <span className="tabular text-2xs text-muted">••••••{String(l.mobile).slice(-4)}</span>
                  {l.reg_no && <span className="rounded bg-shell px-1.5 py-0.5 font-mono text-2xs font-semibold text-ink">{plate(l.reg_no)}</span>}
                  {l.paid_before > 0 && <span className="rounded-full bg-good-50 px-2 py-0.5 text-[10px] font-semibold text-good-700">Paid before ×{l.paid_before}</span>}
                  <Link className="ml-auto text-2xs text-brand hover:underline" to={`/journey?mobile=${l.mobile}`}>Journey →</Link>
                </div>
                <p className="mt-1 text-2xs text-muted">
                  {l.stage === 'checkout' ? `Checkout ${rupees(l.amount_paise)} opened ${ago(l.checkout_at)} · ` : l.stage === 'checked' ? `Free check ${ago(l.checked_at)} · ` : ''}last wrote {ago(l.last_inbound_at)}
                </p>
                {l.last_message && <p className="mt-2 rounded-lg bg-shell px-3 py-2 text-2xs text-body">“{l.last_message}”</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {IDEAS[l.stage].map((t, i) => (
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
