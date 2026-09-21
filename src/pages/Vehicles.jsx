import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { plate, count, date, dateTime, ago, daysTo, mobile as fmtMobile } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { RcView, ChallanView, FastagView, FastagNotApplicable, isTwoWheeler } from '../components/VehicleRecord.jsx';
import { Table, Chip, Hint, Modal, Empty, Spinner, Failed, Banner, Pager, PAGE_SIZE } from '../components/ui.jsx';
import { useSession, allowed } from '../lib/session';

/**
 * Every vehicle GaadiPe has ever looked at.
 *
 * The list answers "which vehicles are we spending lookups on, and for whom".
 * Opening one shows the stored record, everyone who has checked it, the reports
 * issued against it, and what each lookup cost — which together are the answer
 * to almost any question that starts "why does this vehicle…".
 */
export default function Vehicles() {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [q]);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.vehicles({ q, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })); }
    catch (e) { setError(e); }
  }, [q, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);
  useAutoRefresh(load);

  return (
    <Shell title="Vehicles" subtitle={data ? `${count(data.total)} known` : ' '}
      actions={
        <input className="input !w-56 !py-1.5 text-sm" placeholder="Registration number"
          value={q} onChange={(e) => setQ(e.target.value)} />
      }>
      <div className="card">
        {error ? <Failed error={error} onRetry={load} />
          : !data ? <Spinner />
          : !data.rows.length ? <Empty>{q ? `No vehicle matches “${q}”.` : 'No vehicles checked yet.'}</Empty>
          : (
            <Table head={
              <tr>
                <th className="th">Vehicle</th>
                <th className="th">Checked by</th>
                <th className="th">Alerts on for</th>
                <th className="th">Next to expire</th>
                <th className="th">Last seen</th>
                <th className="th">State</th>
              </tr>
            }>
              {data.rows.map((v) => {
                const docs = [
                  ['Insurance', v.insurance_upto], ['PUC', v.pucc_upto], ['Fitness', v.fitness_upto],
                  ['Road tax', v.tax_upto], ['Permit', v.permit_upto],
                ].filter(([, d]) => d).map(([label, d]) => ({ label, d, days: daysTo(d) }))
                  .sort((a, b) => a.days - b.days);
                const worst = docs[0];
                return (
                  <tr key={v.id} className="cursor-pointer transition hover:bg-shell/70"
                    onClick={() => setOpen(v.reg_no)}>
                    <td className="td">
                      <div className="plate">{plate(v.reg_no)}</div>
                      <div className="text-2xs text-muted">
                        {[v.maker, v.model].filter(Boolean).join(' ') || '—'}
                      </div>
                    </td>
                    <td className="td tabular">{count(v.checked_by)}</td>
                    <td className="td tabular">{count(v.watchers)}</td>
                    <td className="td">
                      {worst ? (
                        <Hint note={`${worst.label} valid until ${date(worst.d)}`}>
                          <Chip tone={worst.days < 0 ? 'wrong' : worst.days <= 30 ? 'watch' : 'good'}>
                            {worst.label} {worst.days < 0 ? 'expired' : `${worst.days}d`}
                          </Chip>
                        </Hint>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="td text-2xs text-muted">{ago(v.last_seen_at)}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {v.blocked && <Chip tone="wrong">Blocked</Chip>}
                        {v.financer && <Chip tone="watch">Financed</Chip>}
                        {v.rc_status && !/^ACTIVE/i.test(v.rc_status) && <Chip tone="watch">{v.rc_status}</Chip>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        {data && <Pager page={page} total={data.total} onPage={setPage} />}
      </div>

      {open && <VehicleDetail regNo={open} onClose={() => setOpen(null)} onChanged={load} />}
    </Shell>
  );
}

function VehicleDetail({ regNo, onClose, onChanged }) {
  const { can } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('rc');

  const load = useCallback(async () => {
    try { setData(await api.vehicle(regNo)); } catch (e) { setError(e); }
  }, [regNo]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const block = async () => {
    const reason = window.prompt('Why is this vehicle being blocked? (recorded against your name)');
    if (reason === null) return;
    setBusy(true);
    try { await api.block('vehicle', regNo, reason); await load(); onChanged?.(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };

  const v = data?.vehicle;
  const snap = data?.snapshots || {};
  const challanN = snap.challan?.data?.summary?.total_pending ?? snap.challan?.data?.pending_count ?? 0;
  const heldFor = ['rc', 'challan', 'fastag']
    .filter((k) => snap[k])
    .map((k) => `${{ rc: 'RC', challan: 'eChallan', fastag: 'FASTag' }[k]} fetched ${dateTime(snap[k].fetched_at)}${snap[k].source ? ` (${snap[k].source})` : ''}`)
    .join(' · ');

  return (
    <Modal wide busy={busy} onClose={onClose} title={plate(regNo)}
      subtitle={v ? [v.maker, v.model].filter(Boolean).join(' ') : ''}
      footer={allowed(can, 'block') && data && !data.blocked && (
        <button className="btn-danger" disabled={busy} onClick={block}>Block this vehicle</button>
      )}>
      {error ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <>
          {data.blocked && (
            <Banner tone="wrong">
              This vehicle is blocked. It is not looked up for anyone, and its watches are skipped.
            </Banner>
          )}

          {/* THE RECORD IN FULL (user, 2026-09-18): the same views as "Check a
              vehicle", drawn from the record already held — no lookup is spent. */}
          <div className="flex flex-wrap items-center gap-2">
            {[['rc', 'RC'], ['challans', challanN ? `eChallan (${challanN})` : 'eChallan'], ['fastag', 'FASTag'],
              ['activity', `Customers & lookups (${data.watchers.length})`]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === k ? 'bg-brand text-white' : 'border border-line bg-white text-muted hover:text-ink'}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-2xs text-muted">{heldFor || 'No record held for this vehicle yet.'}</p>

          {tab !== 'activity' && (
            <div key={tab} className="cv-rise">
              {tab === 'rc' && (snap.rc ? <RcView body={{ rc: snap.rc.data, vehicle_number: regNo }} /> : <Empty>No RC record held for this vehicle.</Empty>)}
              {tab === 'challans' && (snap.challan ? <ChallanView body={snap.challan.data} /> : <Empty>No challan record held for this vehicle.</Empty>)}
              {tab === 'fastag' && (isTwoWheeler(snap.rc?.data) && !(snap.fastag?.data?.tags || []).length ? <FastagNotApplicable />
                : snap.fastag ? <FastagView body={{ fastag: snap.fastag.data }} /> : <Empty>No FASTag record held for this vehicle.</Empty>)}
            </div>
          )}

          {tab === 'activity' && (<>
          <div>
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">
              Checked by ({data.watchers.length})
            </h3>
            {data.watchers.length ? (
              <Table head={<tr><th className="th">Customer</th><th className="th">Checks</th><th className="th">Last</th><th className="th">Alerts</th></tr>}>
                {data.watchers.map((w) => (
                  <tr key={w.user_id}>
                    <td className="td">
                      <div className="text-ink">{w.name || 'Unknown'}</div>
                      <div className="tabular text-2xs text-muted">{fmtMobile(w.mobile)}</div>
                    </td>
                    <td className="td tabular">{count(w.check_count)}</td>
                    <td className="td text-2xs text-muted">{ago(w.last_checked_at)}</td>
                    <td className="td">{w.watching ? <Chip tone="good">🔔 On</Chip> : <span className="text-muted">—</span>}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty>Nobody has checked this vehicle.</Empty>}
          </div>

          <div>
            <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">
              Recent lookups
            </h3>
            {data.calls.length ? (
              <Table head={<tr><th className="th">When</th><th className="th">Dataset</th><th className="th">Path</th><th className="th">Outcome</th><th className="th">Took</th></tr>}>
                {data.calls.slice(0, 15).map((c, i) => (
                  <tr key={i}>
                    <td className="td text-2xs text-muted">{dateTime(c.created_at)}</td>
                    <td className="td">{c.dataset}</td>
                    <td className="td font-mono text-2xs">{c.cache_hit ? 'cache' : c.provider_path}</td>
                    <td className="td">
                      <Chip tone={c.outcome === 'FOUND' || c.cache_hit ? 'good' : 'watch'}>
                        {c.cache_hit ? 'CACHED' : c.outcome}
                      </Chip>
                    </td>
                    <td className="td tabular text-2xs">{c.duration_ms ? `${c.duration_ms} ms` : '—'}</td>
                  </tr>
                ))}
              </Table>
            ) : <Empty>No lookups recorded.</Empty>}
          </div>

          {data.reports.length > 0 && (
            <div>
              <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">
                Reports issued
              </h3>
              <ul className="space-y-1 text-sm">
                {data.reports.map((r) => (
                  <li key={r.id} className="flex justify-between border-b border-line/60 py-1">
                    <span className="font-mono text-2xs">{r.report_number}</span>
                    <span className="text-2xs text-muted">
                      {dateTime(r.created_at)}
                      {r.valid_until && ` · downloadable until ${date(r.valid_until)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          </>)}
        </>
      )}
    </Modal>
  );
}

const Pair = ({ label, value }) => (
  <div className="flex justify-between gap-3 border-b border-line/60 py-1.5">
    <span className="text-2xs uppercase tracking-wider text-muted">{label}</span>
    <span className="text-right text-sm text-ink">{value || '—'}</span>
  </div>
);
