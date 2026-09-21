import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { mobile as fmtMobile, ago, dateTime, count, plate as fmtPlate, duration } from '../lib/format';
import Shell from '../components/Shell.jsx';
import CustomerActivity from '../components/CustomerActivity.jsx';
import { Chip, Empty, Spinner, Failed, Hint, Modal } from '../components/ui.jsx';

/**
 * What is happening right now.
 *
 * POLLED, NOT PUSHED: a few seconds of delay costs nothing here, and polling
 * survives a restart, a proxy and a laptop waking from sleep without any
 * reconnect logic to get wrong. The poll asks only for what happened after the
 * last message it saw, so the cost does not grow with the day.
 *
 * The left column is conversations, newest first. The right is the raw stream —
 * every message in and out as it lands, which is the thing worth watching while
 * a change is being tested.
 */
const TICK_MS = 4000;

export default function Live() {
  const [pulse, setPulse] = useState(null);
  const [stream, setStream] = useState([]);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [openMobile, setOpenMobile] = useState(null);
  const [visitors, setVisitors] = useState(null);
  const [openVisit, setOpenVisit] = useState(null);
  const [paused, setPaused] = useState(false);
  const since = useRef(null);

  const poll = useCallback(async () => {
    try {
      const out = await api.pulse(since.current);
      since.current = out.last_message_id || since.current;
      setPulse(out);
      if (out.messages.length) {
        // Newest last, capped: a screen left open all day must not grow until
        // the tab runs out of memory.
        setStream((s) => [...s, ...out.messages].slice(-200));
      }
    } catch (e) { setError(e); }
  }, []);

  const loadRows = useCallback(async () => {
    try { setRows((await api.conversations({ q, limit: 60 })).rows); }
    catch (e) { setError(e); }
  }, [q]);

  const loadVisitors = useCallback(async () => {
    try { setVisitors((await api.visitors(30)).rows); } catch { /* the next tick retries */ }
  }, []);

  useEffect(() => { loadRows(); loadVisitors(); }, [loadRows, loadVisitors]);
  useEffect(() => {
    poll();
    if (paused) return undefined;
    const t = setInterval(() => { poll(); loadRows(); loadVisitors(); }, TICK_MS);
    return () => clearInterval(t);
  }, [poll, loadRows, loadVisitors, paused]);

  return (
    <Shell title="Live"
      subtitle={pulse ? `${count(pulse.active_15m)} active in the last 15 minutes · updated ${ago(pulse.at)}` : ' '}
      actions={
        <>
          <input className="input !w-48 !py-1.5 text-sm" placeholder="Number or name"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn-quiet !py-1.5 text-2xs" onClick={() => setPaused(!paused)}>
            {paused ? 'Resume' : 'Pause'}
          </button>
        </>
      }>

      {error && !rows ? <Failed error={error} onRetry={loadRows} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Active now" value={count(pulse?.active_15m ?? 0)} note="People whose last message arrived in the last 15 minutes." />
            <Tile label="In the 24-hour window" value={count(pulse?.active_24h ?? 0)} note="People GaadiPe may still reply to freely. Outside this window only an approved template delivers." />
            <Tile label="Checks, last 15 min" value={count(pulse?.checks_15m ?? 0)} />
            <Tile label="Paying right now" value={count(pulse?.paying_now ?? 0)} note="Payment links opened in the last 30 minutes that have not completed yet." />
          </div>

          <OnSite rows={visitors} onOpen={setOpenVisit} />

          <CustomerActivity tick={pulse?.at} />

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <div className="card lg:col-span-3">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">Conversations</h2>
                <span className="text-2xs text-muted">Tap to read the whole thread</span>
              </div>
              {!rows ? <Spinner /> : !rows.length ? <Empty>Nobody has messaged yet.</Empty> : (
                <div className="divide-y divide-line">
                  {rows.map((r) => (
                    <button key={r.id} onClick={() => setOpenMobile(r.mobile)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-shell/70">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        r.in_window ? 'bg-good-500' : 'bg-line'}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-ink">
                            {r.profile_name || r.wa_profile_name || 'Unknown'}
                          </span>
                          <span className="tabular text-2xs text-muted">{fmtMobile(r.mobile)}</span>
                          {r.blocked && <Chip tone="wrong">Blocked</Chip>}
                          {r.has_paid && <Chip tone="good">Paid</Chip>}
                        </span>
                        <span className="mt-0.5 block truncate text-2xs text-muted">
                          {r.last_direction === 'out' ? '↩ ' : ''}{r.last_body || '—'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-2xs text-muted">{ago(r.last_inbound_at)}</span>
                        <Hint right note={`State: ${r.state}${r.state_reason ? ` — ${r.state_reason}` : ''}`}>
                          <span className="text-2xs text-brand-deep">{r.state}</span>
                        </Hint>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="card lg:col-span-2">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">As it happens</h2>
                {!paused && <span className="flex items-center gap-1.5 text-2xs text-muted">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good-500" />live</span>}
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {!stream.length ? <Empty>Waiting for the next message…</Empty> : (
                  <ul className="divide-y divide-line">
                    {[...stream].reverse().map((m) => (
                      <li key={m.id} className="px-4 py-2">
                        <div className="flex items-center gap-2 text-2xs">
                          <span className={m.direction === 'out' ? 'text-brand-deep' : 'text-ink'}>
                            {m.direction === 'out' ? 'out' : 'in'}
                          </span>
                          <span className="tabular text-muted">{fmtMobile(m.mobile)}</span>
                          <span className="text-muted">{ago(m.created_at)}</span>
                          {m.error_message && <Chip tone="wrong">failed</Chip>}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-sm text-body">{m.body || `[${m.message_type}]`}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {openMobile && <Thread mobile={openMobile} onClose={() => setOpenMobile(null)} />}
      {openVisit && <Visit visit={openVisit} onClose={() => setOpenVisit(null)} />}
    </Shell>
  );
}

function Thread({ mobile, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.thread(mobile).then((d) => setRows(d.rows)).catch(setError);
  }, [mobile]);

  return (
    <Modal wide title={fmtMobile(mobile)} subtitle="The whole conversation, oldest first" onClose={onClose}>
      {error ? <Failed error={error} /> : !rows ? <Spinner /> : (
        <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
          {rows.map((m) => (
            <div key={m.id} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                m.direction === 'out' ? 'bg-brand/8 text-ink' : 'bg-shell text-body'}`}>
                <div className="whitespace-pre-wrap break-words">{m.body || `[${m.message_type}]`}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs text-muted">
                  <span>{dateTime(m.created_at)}</span>
                  {m.template_name && <span>template {m.template_name}</span>}
                  {m.delivery && <span>{m.delivery.status}</span>}
                  {m.error_message && <span className="text-wrong-700">{m.error_message}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

const Tile = ({ label, value, note }) => (
  <Hint note={note}>
    <div className="card px-4 py-3">
      <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{label}</div>
      <div className="tabular mt-1 text-2xl font-semibold text-ink">{value}</div>
    </div>
  </Hint>
);

/*
 * ON THE SITE NOW (user, 2026-09-21): every signed-in customer active in the
 * last 30 minutes — who they are, the page they are on, the vehicle they are
 * looking at and the last thing they did. Signed-out visits stay listed, marked
 * offline, until they age out. Tap a row for the whole visit, step by step.
 */
const ACTIONS = {
  viewing: 'Viewing', check: 'Checked a vehicle', check_paid: 'Checked a vehicle (paid)',
  view_vehicle: 'Opened a vehicle', view_vehicle_paid: 'Opened a vehicle (paid)',
  buy_open: 'Opened Buy report', buy_close: 'Closed Buy report', pay_start: 'Went to payment',
  pay_cancel: 'Cancelled payment', view_report: 'Viewed report PDF', download_report: 'Downloaded report',
  view_invoice: 'Viewed invoice', download_invoice: 'Downloaded invoice', signed_out: 'Signed out',
  share: 'Shared', print: 'Printed',
};
const actionLabel = (a) => ACTIONS[a] || a || '—';

const PAGES = [
  [/^\/app\/vehicle\//, 'Vehicle page'], [/^\/app\/check/, 'Check a vehicle'], [/^\/app\/reports/, 'My reports'],
  [/^\/app\/invoices/, 'My invoices'], [/^\/app\/profile/, 'Profile'], [/^\/app\/?$/, 'Dashboard'],
  [/^\/login/, 'Sign in'], [/^\/help/, 'Help'], [/^\/$/, 'Home'],
];
const pageLabel = (p) => {
  if (!p) return '—';
  const hit = PAGES.find(([re]) => re.test(p));
  return hit ? hit[1] : p;
};

const STATE = {
  online: ['Online', 'good'], idle: ['Idle', 'watch'], signed_out: ['Offline · signed out', 'info'],
  expired: ['Offline · expired', 'info'],
};

function OnSite({ rows, onOpen }) {
  const online = (rows || []).filter((r) => r.state === 'online').length;
  return (
    <div className="card mt-4">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">On the site now</h2>
        <span className="text-2xs text-muted">
          {rows ? `${count(online)} online · last 30 minutes · tap for the whole visit` : ' '}
        </span>
      </div>
      {!rows ? <Spinner /> : !rows.length ? <Empty>No signed-in visitors in the last 30 minutes.</Empty> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-2xs uppercase tracking-wider text-muted">
              <tr>
                {['Customer', 'Status', 'Page', 'Vehicle', 'Doing', 'Visit', 'Device'].map((h) => (
                  <th key={h} className="px-4 py-2 font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const [label, tone] = STATE[r.state] || [`Offline · ${r.state}`, 'info'];
                return (
                  <tr key={r.id} onClick={() => onOpen(r)} className="cursor-pointer align-top transition hover:bg-shell/70">
                    <td className="px-4 py-2">
                      <div className="font-semibold text-ink">{r.name || 'No name yet'}</div>
                      <div className="tabular text-2xs text-muted">{fmtMobile(r.mobile)}{r.has_paid ? ' · paid before' : ''}</div>
                    </td>
                    <td className="px-4 py-2">
                      <Chip tone={tone}>{label}</Chip>
                      <div className="mt-0.5 text-2xs text-muted">{ago(r.ended_at || r.last_used_at)}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-ink">{pageLabel(r.current_page)}</div>
                      <div className="max-w-[14rem] truncate text-2xs text-muted">{r.current_page || ''}</div>
                    </td>
                    <td className="px-4 py-2 tabular">
                      {r.current_reg_no ? fmtPlate(r.current_reg_no) : '—'}
                      {r.vehicles > 1 && <div className="text-2xs text-muted">{count(r.vehicles)} this visit</div>}
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-ink">{r.current_action === 'click' && r.current_detail ? <>Clicked “{r.current_detail}”</> : actionLabel(r.current_action)}</div>
                      <div className="text-2xs text-muted">{r.current_at ? ago(r.current_at) : ''}</div>
                    </td>
                    <td className="px-4 py-2 text-2xs text-muted">
                      <div>since {ago(r.created_at)}</div>
                      <div>{count(r.pages)} pages · {count(r.request_count)} requests</div>
                    </td>
                    <td className="px-4 py-2 text-2xs text-muted">
                      <div>{r.device || '—'}</div>
                      <div className="tabular">{r.ip || ''}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Visit({ visit, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.visitorTrail(visit.id).then((d) => setRows(d.rows)).catch(setError);
  }, [visit.id]);

  const seconds = Math.max(0, (new Date(visit.ended_at || visit.last_used_at) - new Date(visit.created_at)) / 1000);
  return (
    <Modal wide title={`${visit.name || 'Customer'} · ${fmtMobile(visit.mobile)}`}
      subtitle={`Signed in ${dateTime(visit.created_at)} · ${duration(seconds)} · ${visit.device || ''}`}
      onClose={onClose}>
      {visit.vehicle_list?.length ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 text-2xs">
          <span className="text-muted">Vehicles this visit:</span>
          {visit.vehicle_list.map((v) => <Chip key={v}>{fmtPlate(v)}</Chip>)}
        </div>
      ) : null}
      {error ? <Failed error={error} /> : !rows ? <Spinner /> : !rows.length ? <Empty>Nothing recorded for this visit yet.</Empty> : (
        <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
          {rows.map((a) => (
            <li key={a.id} className="flex items-start gap-3 py-2 text-sm">
              <span className="w-36 shrink-0 tabular text-2xs text-muted">{dateTime(a.created_at)}</span>
              <span className="min-w-0 flex-1">
                <span className="text-ink">{a.kind === 'page' ? `Opened ${pageLabel(a.page)}` : a.kind === 'click' ? `Clicked “${a.detail?.label || a.detail?.href || ''}”` : actionLabel(a.action)}</span>
                {a.reg_no && <span className="ml-2 tabular text-brand-deep">{fmtPlate(a.reg_no)}</span>}
                {a.detail?.number && <span className="ml-2 text-2xs text-muted">{a.detail.number}</span>}
                {a.page && <span className="block truncate text-2xs text-muted">{a.page}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
