import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { rupees, count, change, ago } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Stat, Hint, Banner, Failed, Spinner, Chip } from '../components/ui.jsx';

/**
 * The screen the day starts on.
 *
 * WHAT IT ANSWERS, IN ORDER: is anything broken, did anyone pay, is anyone
 * talking to us, and what is it all costing. Everything else belongs on its own
 * screen — a dashboard that shows everything is one nobody reads.
 *
 * Refreshed on a slow timer rather than on a button: the figures move on their
 * own all day, and a stale dashboard is the one thing this screen must never be.
 */
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async (quiet = false) => {
    try {
      const [d, h] = await Promise.all([api.dashboard(), api.health()]);
      setData(d); setHealth(h); setError(null);
    } catch (e) {
      if (!quiet) setError(e);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 30000);
    return () => clearInterval(t);
  }, [load]);

  if (error && !data) return <Shell title="Dashboard"><Failed error={error} onRetry={load} /></Shell>;
  if (!data) return <Shell title="Dashboard"><Spinner /></Shell>;

  const m = data.money.all_time;
  const today = data.money.today;
  const users = change(data.users.today, data.users.yesterday);
  const checks = change(data.checks.today, data.checks.yesterday);
  const pays = change(data.payments.today, data.payments.yesterday);

  /* Only the troubles that need a person. A green wall of "0 problems" trains
     the reader to stop looking at this strip. */
  const troubles = health ? [
    health.payments_stuck && { label: `${health.payments_stuck} payment${health.payments_stuck === 1 ? '' : 's'} started but never finished`, to: '/documents' },
    health.reports_missing && { label: `${health.reports_missing} paid report${health.reports_missing === 1 ? '' : 's'} not issued`, to: '/documents' },
    health.invoices_missing && { label: `${health.invoices_missing} payment${health.invoices_missing === 1 ? '' : 's'} without an invoice`, to: '/documents' },
    health.send_failures && { label: `${health.send_failures} message${health.send_failures === 1 ? '' : 's'} rejected by WhatsApp today`, to: '/live' },
    health.watches_failing && { label: `${health.watches_failing} vehicle${health.watches_failing === 1 ? '' : 's'} failing their checks`, to: '/vehicles' },
  ].filter(Boolean) : [];

  return (
    <Shell title="Dashboard" subtitle={`Updated ${ago(data.as_of)}`}>
      {troubles.length > 0 && (
        <Banner tone="watch" className="mb-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold">Needs a look:</span>
            {troubles.map((t) => (
              <button key={t.label} className="underline underline-offset-2" onClick={() => navigate(t.to)}>
                {t.label}
              </button>
            ))}
          </div>
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Paid today" value={count(data.payments.today)} sub={pays.text}
          note="Payments captured today, against yesterday at the same point. A payment counts when the money actually arrived, not when the link was sent."
          onClick={() => navigate('/documents')} />
        <Stat label="Earned today" value={rupees(today.gross_paise)}
          sub={`${rupees(today.take_home_paise)} take-home`}
          note="Gross is what customers paid, GST included. Take-home is what is left after GST is remitted and Razorpay's fee and its GST are paid." />
        <Stat label="Checks today" value={count(data.checks.today)} sub={checks.text}
          note="Vehicles looked up today. Repeats inside the free window are not counted, so this is real demand rather than people re-reading a report." />
        <Stat label="New people today" value={count(data.users.today)} sub={users.text}
          note="Mobile numbers seen for the first time today."
          onClick={() => navigate('/customers')} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Customers" value={count(data.users.total)}
          sub={`${count(data.vehicles.total)} vehicles known`}
          onClick={() => navigate('/customers')}
          note="Everyone who has ever messaged GaadiPe, and every distinct vehicle any of them has checked." />
        <Stat label="Being watched" value={count(data.watching.watches)}
          sub={`${count(data.watching.subscriptions)} paid and live`}
          note="Vehicles under active monitoring right now. Each one is re-checked on its own schedule and its owner is messaged only when something changes." />
        <Stat label="Reports sold" value={count(data.reports.total)}
          sub={`${count(data.reports.today)} today`}
          onClick={() => navigate('/documents')}
          note="Full reports issued. Each one is a numbered document kept in the database, so a lost file can be sent again." />
        <Stat label="In conversation" value={count(data.whatsapp.in_window)}
          sub={`${count(data.whatsapp.messages_today)} messages today`}
          tone={data.whatsapp.send_failures_today ? 'wrong' : 'info'}
          onClick={() => navigate('/live')}
          note="People whose last message was inside 24 hours — the window in which GaadiPe may reply freely. Outside it, only an approved template will deliver." />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ink">Money, all time</h2>
            <p className="text-2xs text-muted">Where every rupee taken has actually gone.</p>
          </div>
          <div className="divide-y divide-line">
            <Row label="Gross collected" value={rupees(m.gross_paise, { decimals: true })}
              note="Everything customers paid, GST included — the figure Razorpay shows." />
            <Row label="GST inside it (18%)" value={`− ${rupees(m.gst_paise, { decimals: true })}`}
              note="Prices are GST-inclusive, so the tax is backed out of the price rather than added to it. ₹19 is ₹16.10 + ₹2.90." />
            <Row label={`Razorpay fee (${m.fee_percent}% + GST)`}
              value={`− ${rupees(m.gateway_fee_paise + m.gateway_fee_gst_paise, { decimals: true })}`}
              note="An estimate from the fee percentage in settings, not a figure read from Razorpay. UPI is nil today and cards are about 2% — correct it in Prices & settings and every figure here follows." />
            <Row label="Take-home" value={rupees(m.take_home_paise, { decimals: true })} strong
              note="What is left after the tax and the gateway. ULIP is free today, so this is close to profit — until it is not, and then this screen will show that too." />
          </div>
        </div>

        <div className="card">
          <div className="border-b border-line px-5 py-3">
            <h2 className="text-sm font-semibold text-ink">Upstream</h2>
            <p className="text-2xs text-muted">What the Government data is costing.</p>
          </div>
          <div className="divide-y divide-line">
            <Row label="ULIP calls today" value={count(data.ulip.calls_today)}
              note="Live lookups spent today. Free while ULIP is free — and the reason every call is recorded is so the day it is not, the cost per customer is already known." />
            <Row label="Served from cache" value={count(data.ulip.cache_hits_today)}
              note="Answers given without spending a call. The higher this is against the line above, the better the margin survives a price list." />
            <Row label="Blocked" value={count(data.blocks)}
              note="Mobile numbers and vehicles GaadiPe will not serve." />
            <Row label="Feedback" value={count(data.feedback)}
              note="Messages customers typed after tapping Feedback." />
          </div>
        </div>
      </div>

      <p className="mt-4 text-2xs text-muted">
        Everything on this screen counts an Indian day, midnight to midnight IST.
      </p>
    </Shell>
  );
}

const Row = ({ label, value, note, strong }) => (
  <div className="flex items-center justify-between px-5 py-2.5">
    <Hint note={note}>
      <span className={`text-sm ${strong ? 'font-semibold text-ink' : 'text-body'} ${note ? 'cursor-help border-b border-dotted border-muted/50' : ''}`}>
        {label}
      </span>
    </Hint>
    <span className={`tabular text-sm ${strong ? 'font-semibold text-ink' : 'text-body'}`}>{value}</span>
  </div>
);
