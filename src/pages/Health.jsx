import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { count, ago } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { AnimatedGauge, AnimatedStatus } from '../lib/motion.jsx';
import { Spinner, Failed, Banner } from '../components/ui.jsx';

/**
 * Is anything quietly broken?
 *
 * EACH LINE IS A FAILURE THE CUSTOMER FEELS, not a server metric: a payment
 * taken with nothing delivered, an alert that never arrived, an invoice that
 * was never issued. CPU and memory belong in the hosting dashboard; this screen
 * exists to catch the things that would otherwise be discovered by a customer
 * writing in.
 *
 * A clean bill of health is stated plainly, so a green screen means checked
 * rather than not-yet-looked.
 */
const CHECKS = [
  {
    key: 'payments_stuck',
    label: 'Payments started but never finished',
    good: 'Every payment link opened recently was either paid or abandoned normally.',
    bad: 'A payment link was opened more than ten minutes ago and never completed. Usually somebody changing their mind — but if the customer says they paid, the reconciler should have recovered it.',
    to: '/documents',
  },
  {
    key: 'reports_missing',
    label: 'Paid reports not issued',
    good: 'Every paid report has been issued.',
    bad: 'Somebody paid for a report that was never produced, most likely because the records service was down. They can reply "report" to get it, and the panel can resend.',
    to: '/documents',
  },
  {
    key: 'invoices_missing',
    label: 'Payments without an invoice',
    good: 'Every captured payment has a tax invoice.',
    bad: 'A payment has no invoice. This is a statutory document — it must exist for every paid supply.',
    to: '/documents',
  },
  {
    key: 'send_failures',
    label: 'Messages WhatsApp rejected today',
    good: 'Every message sent today was accepted by WhatsApp.',
    bad: 'Meta rejected one or more messages. The usual causes are the 24-hour window closing, or a template that is not approved.',
    to: '/live',
  },
  {
    key: 'lookup_failures',
    label: 'Failed lookups today',
    good: 'Every Government lookup today succeeded.',
    bad: 'ULIP refused or timed out. A handful is normal; a wall of them means ULIP is down or this host has fallen off their allow-list.',
    to: '/check',
  },
  {
    key: 'watches_failing',
    label: 'Vehicles failing their checks',
    good: 'Every watched vehicle is being checked successfully.',
    bad: 'A watched vehicle has failed several checks in a row and is being backed off. Its owner is not being told anything.',
    to: '/vehicles',
  },
];

/* Every service GaadiPe depends on, one state each (phase 6). */
const LEVEL = {
  operational: ['Operational', 'bg-good-500', 'text-good-700'], warning: ['Warning', 'bg-watch-500', 'text-watch-700'],
  degraded: ['Degraded', 'bg-watch-500', 'text-watch-700'], down: ['Down', 'bg-wrong-500', 'text-wrong-700'],
};
/* The dials: bounded figures only, coloured by the same thresholds as the alerts. */
function Dials({ s }) {
  const by = Object.fromEntries(s.services.map((x) => [x.key, x]));
  const t = s.thresholds || {};
  const api = by.records_api?.metrics || {}; const wa = by.whatsapp_api?.metrics || {};
  const rateTone = (err, lim) => (err == null ? 'muted' : err >= lim ? 'wrong' : err > 0 ? 'watch' : 'good');
  const pctTone = (v, lim) => (v == null ? 'muted' : v >= lim ? 'wrong' : v >= lim * 0.85 ? 'watch' : 'good');
  const lat = api.p95_ms; const latLim = t.api_p95_ms || 8000;
  const mem = by.backend?.metrics?.server_memory_pct; const disk = by.storage?.metrics?.used_pct;
  return (
    <div className="card mb-4 grid grid-cols-2 gap-4 p-4 md:grid-cols-5">
      <AnimatedGauge label="Vehicle API success" value={api.calls ? 100 - api.error_pct : null} text={api.calls ? `${Math.round(100 - api.error_pct)}%` : null}
        tone={rateTone(api.calls ? api.error_pct : null, t.api_error_pct || 20)} caption={api.calls ? `${api.calls} calls, last hour` : 'No calls in the last hour'} />
      <AnimatedGauge label="API latency (p95)" value={lat} max={latLim * 1.5} text={lat == null ? null : `${lat} ms`}
        tone={lat == null ? 'muted' : lat > latLim ? 'wrong' : lat > latLim * 0.7 ? 'watch' : 'good'} caption={`Threshold ${latLim} ms · avg ${api.avg_ms ?? '—'} ms`} />
      <AnimatedGauge label="WhatsApp success" value={wa.sent ? 100 - wa.error_pct : null} text={wa.sent ? `${Math.round(100 - wa.error_pct)}%` : null}
        tone={rateTone(wa.sent ? wa.error_pct : null, t.wa_failure_pct || 10)} caption={wa.sent ? `${wa.sent} sent, last hour` : 'Nothing sent in the last hour'} />
      <AnimatedGauge label="Server memory" value={mem} text={mem == null ? null : `${mem}%`} tone={pctTone(mem, t.memory_pct || 90)} caption={`Alert at ${t.memory_pct || 90}%`} />
      <AnimatedGauge label="Disk used" value={disk} text={disk == null ? null : `${disk}%`} tone={pctTone(disk, t.disk_pct || 80)} caption={`Alert at ${t.disk_pct || 80}%`} />
    </div>
  );
}

function Services() {
  const [s, setS] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => api.healthServices().then(setS).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);
  if (!s) return <Spinner />;
  const [overall, , overallTone] = LEVEL[s.overall] || LEVEL.operational;
  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Services</h2>
        <span className={`text-2xs font-semibold ${overallTone}`}>Overall: {overall}</span>
      </div>
      <Dials s={s} />
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {s.services.map((x) => {
          const [word, , tone] = LEVEL[x.level] || LEVEL.operational;
          return (
            <div key={x.key} role="button" tabIndex={0} aria-expanded={open === x.key}
              className="card m-press cursor-pointer px-4 py-3 transition-colors duration-150 hover:bg-shell/50"
              onClick={() => setOpen(open === x.key ? null : x.key)} onKeyDown={(e) => e.key === 'Enter' && setOpen(open === x.key ? null : x.key)}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink">{x.name}</span>
                <span className={tone}><AnimatedStatus level={x.level} label={word} /></span>
              </div>
              <p className="mt-1 text-2xs text-muted">{x.message}</p>
              <p className="text-[10px] text-muted">Checked {ago(s.at)}{x.last_ok ? ` · last success ${ago(x.last_ok)}` : ''}{x.metrics?.response_ms != null ? ` · ${x.metrics.response_ms} ms` : ''}</p>
              {open === x.key && (
                <div className="m-drop mt-2 space-y-0.5 border-t border-line pt-2 text-2xs text-body">
                  {Object.entries(x.metrics || {}).map(([k, v]) => <div key={k}>{k.replace(/_/g, ' ')}: <b>{v == null ? '—' : String(v)}</b></div>)}
                  {x.last_ok && <div>Last success: <b>{ago(x.last_ok)}</b></div>}
                  {x.last_failure && <div>Last failure: <b className="text-wrong-700">{ago(x.last_failure)}</b></div>}
                  {x.last_webhook && <div>Last webhook: <b>{ago(x.last_webhook)}</b></div>}
                  {x.last_error && <div className="text-wrong-700">Error: {x.last_error}</div>}
                  {x.jobs && x.jobs.map((j) => (
                    <div key={j.name} className={j.late ? 'text-wrong-700' : j.state === 'error' ? 'text-watch-700' : ''}>
                      {j.name}: every {j.every_s}s · {j.runs ? `last ran ${ago(j.last_end)} (${j.last_ms} ms)` : 'waiting for its first run'}
                      {j.late ? ' · LATE' : ''}{j.last_error ? ` · error: ${j.last_error}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink">Checks</h2>
    </div>
  );
}

export default function Health() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try { setError(null); setData(await api.health()); } catch (e) { setError(e); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const troubles = data ? CHECKS.filter(c => Number(data[c.key]) > 0) : [];

  return (
    <Shell title="System health" subtitle={data ? `Checked ${ago(data.at)}` : ' '}
      actions={<button className="btn-quiet !py-1.5 text-2xs" onClick={load}>Check again</button>}>

      <Services />
      {error ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <>
          {!troubles.length && (
            <Banner tone="good" className="mb-4">
              Nothing needs attention. Every payment has its report and invoice, every message was accepted,
              and every watched vehicle is being checked.
            </Banner>
          )}

          <div className="space-y-2">
            {CHECKS.map((c) => {
              const n = Number(data[c.key] || 0);
              const bad = n > 0;
              return (
                <div key={c.key}
                  className={`card flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${
                    bad ? 'border-wrong-500/25' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${bad ? 'bg-wrong-500' : 'bg-good-500'}`} />
                    <div>
                      <div className="text-sm font-semibold text-ink">{c.label}</div>
                      <p className="mt-0.5 max-w-2xl text-2xs text-muted">{bad ? c.bad : c.good}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`tabular text-2xl font-semibold ${bad ? 'text-wrong-700' : 'text-muted'}`}>
                      {count(n)}
                    </span>
                    {bad && (
                      <button className="btn-quiet !py-1.5 text-2xs" onClick={() => navigate(c.to)}>Look</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-2xs text-muted">
            Re-checked every minute while this screen is open.
          </p>
        </>
      )}
    </Shell>
  );
}
