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
  // Everyone (user, 2026-10-06): every open chat in one list — checked, said hi, opened payment, or just paid.
  ['everyone', '👥 Everyone', 'Every open chat — checked a vehicle, said hi, opened payment, or paid in the last two days.'],
];
const STAGE = {
  checkout: ['🔥 Opened payment', 'bg-wrong-50 text-wrong-700'],
  checked: ['🌡 Checked', 'bg-watch-50 text-watch-700'],
  messaged: ['💬 Messaged', 'bg-shell text-body'],
  paid: ['✅ Paid', 'bg-good-50 text-good-700'],
};
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
  paid: [
    'Thank you for your purchase! 🙏 If anything in the report for {reg} is unclear, just reply here — happy to help.',
    'Thank you! 🙏 Know someone checking a vehicle? GaadiPe works for any number, right here on WhatsApp.',
  ],
};

/* Name, number, vehicle or what they wrote — lower case, spaces ignored. */
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, '');
const matches = (l, q) => !q || [l.name, l.mobile, l.reg_no, l.last_message].some((v) => norm(v).includes(q));

export default function HotLeads() {
  const [tab, setTab] = useState('checkout');
  const [q, setQ] = useState('');
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

  const inTab = (l) => tab === 'everyone' || l.stage === tab;
  const needle = norm(q);
  const shown = d ? d.leads.filter((l) => inTab(l) && matches(l, needle)) : [];
  const inTabTotal = d ? d.leads.filter(inTab).length : 0;

  return (
    <Shell title="Hot leads" subtitle="People whose WhatsApp window is open and who have not paid yet — a reply is free">
      {d && (
        <div className="mb-3 flex flex-wrap items-end gap-1 border-b border-line" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
              {label} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${tab === k ? 'bg-brand text-white' : 'bg-shell text-body'}`}>{d.counts?.[k] || 0}</span>
            </button>
          ))}
          {/* Search in every tab (user, 2026-10-06): name, number, vehicle or what they wrote. */}
          <input className="input mb-1.5 ml-auto !w-64 !py-1.5 text-sm" type="search" value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, number, vehicle, message" aria-label="Search leads" />
        </div>
      )}
      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : !shown.length ? (
        <div className="card p-8 text-center text-sm text-muted">
          {q && inTabTotal ? <>Nobody in this tab matches “{q}”. <button type="button" className="text-brand hover:underline" onClick={() => setQ('')}>Clear search</button></>
            : <>Nobody here right now. {TABS.find(([k]) => k === tab)[2]}</>}
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-body">
            {TABS.find(([k]) => k === tab)[2]} Newest first. Replies are written by you; nothing is sent automatically.
            {q ? ` Showing ${shown.length} of ${inTabTotal} matching “${q}”.` : ''}
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {shown
              // Newest first, by when they reached this stage.
              .sort((a, b) => new Date(b.at || b.last_inbound_at) - new Date(a.at || a.last_inbound_at))
              .map((l) => (
              <article key={l.mobile} className="card p-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <b className="text-ink">{l.name || 'Unknown'}</b>
                  {tab === 'everyone' && STAGE[l.stage] && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STAGE[l.stage][1]}`}>{STAGE[l.stage][0]}</span>
                  )}
                  <span className="tabular text-2xs text-muted">••••••{String(l.mobile).slice(-4)}</span>
                  {l.reg_no && <span className="rounded bg-shell px-1.5 py-0.5 font-mono text-2xs font-semibold text-ink">{plate(l.reg_no)}</span>}
                  {l.paid_before > 0 && <span className="rounded-full bg-good-50 px-2 py-0.5 text-[10px] font-semibold text-good-700">Paid before ×{l.paid_before}</span>}
                  <Link className="ml-auto text-2xs text-brand hover:underline" to={`/journey?mobile=${l.mobile}`}>Journey →</Link>
                </div>
                <p className="mt-1 text-2xs text-muted">
                  {l.stage === 'paid' ? `Paid ${ago(l.paid_at)} · ` : l.stage === 'checkout' ? `Checkout ${rupees(l.amount_paise)} opened ${ago(l.checkout_at)} · ` : l.stage === 'checked' ? `Free check ${ago(l.checked_at)} · ` : ''}last wrote {ago(l.last_inbound_at)}
                </p>
                {l.last_message && <p className="mt-2 rounded-lg bg-shell px-3 py-2 text-2xs text-body">“{l.last_message}”</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(IDEAS[l.stage] || []).map((t, i) => (
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
