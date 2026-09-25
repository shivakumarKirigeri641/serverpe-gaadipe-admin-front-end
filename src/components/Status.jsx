import { Check } from '../lib/motion.jsx';
import { Hint } from './ui.jsx';

/**
 * Status pictures driven only by real records (motion system, 2026-09-25).
 * Nothing here runs on a timer or pretends: a spinner means a payment really
 * is in progress, a check means it really completed.
 */

/* ─────────────────────────────── payment ─────────────────────────────── */

/**
 * Paid: a check that draws itself. Pending: a small spinner — only while the
 * checkout is genuinely young (started under 30 minutes ago); older than that
 * it is "not completed", still. Failed: a cross. Refunded: said so.
 */
export function AnimatedPaymentStatus({ status, createdAt, failed = false }) {
  const young = createdAt && Date.now() - new Date(createdAt).getTime() < 30 * 60000;
  const view = status === 'paid' ? ['Paid', 'text-good-700', <Check key="c" />]
    : status === 'refunded' ? ['Refunded', 'text-watch-700', <span key="r" aria-hidden="true">↺</span>]
      : failed ? ['Failed', 'text-wrong-700', <span key="x" aria-hidden="true" className="m-chip-in font-bold">✕</span>]
        : young ? ['In progress', 'text-watch-700', <span key="s" aria-hidden="true" className="m-spin inline-block h-3 w-3 rounded-full border-2 border-watch-500/30 border-t-watch-500" />]
          : ['Not completed', 'text-muted', <span key="n" aria-hidden="true">○</span>];
  return <span className={`inline-flex items-center gap-1 text-2xs font-semibold ${view[1]}`}>{view[2]}{view[0]}</span>;
}

/* ─────────────────────────────── steps ─────────────────────────────── */

/** A row of steps, each done / current / failed / not reached, joined by lines. */
function Steps({ steps, label }) {
  const firstOpen = steps.findIndex((s) => s.state !== 'done');
  return (
    <ol className="m-stagger flex flex-wrap items-center gap-y-2" aria-label={label}>
      {steps.map((s, i) => {
        const state = s.state === 'done' ? 'done' : s.state === 'failed' ? 'failed' : i === firstOpen && s.state === 'current' ? 'current' : 'todo';
        const dot = { done: 'bg-good-500 text-white', failed: 'bg-wrong-500 text-white', current: 'bg-watch-500 text-white m-dot-warning', todo: 'bg-shell text-muted border border-line' }[state];
        return (
          <li key={s.key} className="flex items-center" style={{ '--i': i }}>
            {i > 0 && (
              <span className="mx-1 h-0.5 w-6 overflow-hidden rounded bg-line md:w-10" aria-hidden="true">
                {steps[i - 1].state === 'done' && <span className="m-grow-x block h-full bg-good-500" style={{ animationDelay: `${i * 60}ms` }} />}
              </span>
            )}
            <Hint note={s.note || `${s.label}: ${{ done: 'done', failed: 'failed', current: 'in progress', todo: 'not reached' }[state]}`}>
              <span className="flex items-center gap-1.5">
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${dot}`}>
                  {state === 'done' ? <Check size={11} className="text-white" /> : state === 'failed' ? '✕' : i + 1}
                </span>
                <span className={`text-2xs font-semibold ${state === 'todo' ? 'text-muted' : state === 'failed' ? 'text-wrong-700' : 'text-ink'}`}>
                  {s.label}<span className="sr-only"> — {state}</span>
                </span>
              </span>
            </Hint>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One person's journey as connected stages, from their real events:
 * VISIT → SEARCH → WHATSAPP → REPORT → PAYMENT. Completed is solid; the next
 * one, if they are part-way, pulses; a failed payment shows as failed; the
 * rest are muted.
 */
export function JourneyStages({ items }) {
  const has = (re) => items.some((i) => re.test(i.name || '') || (i.kind === 'message' && re.test('whatsapp_message')));
  const reached = {
    visit: has(/^(session_started|page_view|whatsapp_cta_clicked)$/),
    search: has(/^(whatsapp_vehicle_received|vehicle_search_success|vehicle_search_failed)$/),
    whatsapp: has(/^(whatsapp_chat_started|whatsapp_message|whatsapp_greeting|terms_accepted)/),
    report: has(/^report_generated$/),
    payment: has(/^payment_success$/),
  };
  const payFailed = !reached.payment && has(/^payment_failed$/);
  const started = !reached.payment && has(/^payment_(started|page_viewed)$/);
  const order = [['visit', 'Visit', 'Came to the website'], ['search', 'Search', 'Asked about a vehicle'], ['whatsapp', 'WhatsApp', 'Talked to GaadiPe on WhatsApp'],
    ['report', 'Report', 'A full report was generated'], ['payment', 'Payment', 'Paid for a report']];
  const steps = order.map(([key, label, note]) => ({
    key, label, note,
    state: reached[key] ? 'done' : key === 'payment' && payFailed ? 'failed' : key === 'payment' && started ? 'current' : 'todo',
  }));
  // Someone who came straight to WhatsApp never "visited": that step is simply not part of their journey.
  if (!reached.visit && (reached.whatsapp || reached.search)) steps[0] = { ...steps[0], state: 'todo', note: 'Came straight to WhatsApp — no website visit.' };
  const next = steps.findIndex((s) => s.state === 'todo' && steps.slice(0, steps.indexOf(s)).some((p) => p.state === 'done'));
  if (next > 0 && !steps.some((s) => s.state === 'current' || s.state === 'failed')) steps[next] = { ...steps[next], state: 'current' };
  return <Steps steps={steps} label="Customer journey" />;
}

/** A paid report's making, from its transaction's real events. */
export function AnimatedReportStatus({ events = [], report }) {
  const has = (n) => events.some((e) => e.name === n);
  const steps = [
    { key: 'verified', label: 'Vehicle verified', state: has('vehicle_search_success') ? 'done' : 'todo' },
    { key: 'collected', label: 'Data collected', state: has('vehicle_api_success') || report ? 'done' : 'todo' },
    { key: 'assembled', label: 'Report assembled', state: report || has('report_generated') ? 'done' : has('payment_success') ? 'current' : 'todo' },
    { key: 'delivered', label: 'Delivered', state: has('report_delivered') ? 'done' : report ? 'current' : 'todo',
      note: has('report_delivered') ? 'Sent to the customer' : 'No delivery recorded yet' },
  ];
  return <Steps steps={steps} label="Report" />;
}

/** One API call: request → processing → response, and how long it took. */
export function AnimatedAPIStatus({ ok, cached, ms: took }) {
  const tone = cached ? 'bg-muted' : ok ? 'bg-good-500' : 'bg-wrong-500';
  const word = cached ? 'Served from cache' : ok ? 'Response OK' : 'Failed';
  return (
    <span className="inline-flex items-center gap-1.5 text-2xs" aria-label={`${word}${took != null ? `, ${took} ms` : ''}`}>
      <span className="text-muted">Request</span>
      <span className="relative h-0.5 w-10 overflow-hidden rounded bg-line"><span className={`m-grow-x absolute inset-0 ${tone}`} /></span>
      <span className="text-muted">{cached ? 'cache' : 'provider'}</span>
      <span className="relative h-0.5 w-10 overflow-hidden rounded bg-line"><span className={`m-grow-x absolute inset-0 ${tone}`} style={{ animationDelay: '120ms' }} /></span>
      <span className={`font-semibold ${cached ? 'text-muted' : ok ? 'text-good-700' : 'text-wrong-700'}`}>{word}</span>
      {took != null && <span className="tabular text-muted">· {took} ms</span>}
    </span>
  );
}
