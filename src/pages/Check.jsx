import { useState } from 'react';
import { api } from '../lib/api';
import { plate, date, daysTo, rupees, count, dateTime } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Chip, Banner, Spinner, Hint, Table } from '../components/ui.jsx';

/**
 * Look a vehicle up for yourself.
 *
 * WHY THIS SCREEN EXISTS: ULIP is free today. Every question that can be
 * answered by looking — is this plate real, what does a bus with 350 challans
 * actually return, did the fix work — should be answered now, while the answer
 * costs nothing. It goes through the same gateway a customer's check does, so
 * what appears here is what they would be shown.
 *
 * `Refresh` spends a live call instead of using the cache. It is a separate
 * button rather than the default, because the cache is what keeps the margin.
 */
export default function Check() {
  const [reg, setReg] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState(false);

  const run = async (refresh) => {
    const value = reg.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length < 5) { setError({ message: 'Enter a full registration number.' }); return; }
    setBusy(true); setError(null); setData(null);
    try {
      const out = await api.check(value, { refresh: refresh ? 1 : undefined, challans: 'all' });
      if (out.success === false) { setError({ message: out.message || 'Not found.' }); return; }
      setData(out);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const rc = data?.rc || {};
  const challans = data?.challans;

  return (
    <Shell title="Check a vehicle" subtitle="The same lookup a customer gets">
      <div className="card p-4">
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run(false); }}>
          <input className="input !max-w-xs" placeholder="KA02EX1480" value={reg}
            autoFocus onChange={(e) => setReg(e.target.value)} />
          <button className="btn-primary" disabled={busy}>{busy ? 'Looking…' : 'Check'}</button>
          <Hint note="Spends a live ULIP call instead of answering from the cache. Free today; the reason to be sparing is the day it is not.">
            <button type="button" className="btn-quiet" disabled={busy} onClick={() => run(true)}>
              Refresh from ULIP
            </button>
          </Hint>
        </form>
        <p className="mt-2 text-2xs text-muted">
          Looking a vehicle up here is recorded in the audit trail against your name.
        </p>
      </div>

      {error && <Banner tone="wrong" className="mt-4">{error.message}</Banner>}
      {busy && <Spinner label="Reading the Government records…" />}

      {data && (
        <div className="mt-4 space-y-4">
          <div className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="plate text-lg">{plate(data.vehicle_number)}</div>
                <div className="mt-1 text-sm text-ink">
                  {[rc.maker, rc.model].filter(Boolean).join(' ') || 'Unknown vehicle'}
                </div>
                <div className="text-2xs text-muted">
                  {[rc.fuel, rc.vehicle_class, rc.manufactured, rc.colour].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Hint right note={`Source ${data.source || '—'} · ${data.cached ? `cached, ${data.age_minutes} min old` : 'fresh from ULIP'} · ${data.latency_ms} ms`}>
                  <Chip tone={data.cached ? 'info' : 'brand'}>
                    {data.cached ? `cached ${data.age_minutes}m` : 'live'}
                  </Chip>
                </Hint>
                <Chip tone={data.ulip_calls_made ? 'watch' : 'good'}>
                  {data.ulip_calls_made} ULIP call{data.ulip_calls_made === 1 ? '' : 's'}
                </Chip>
              </div>
            </div>

            <div className="mt-4 grid gap-x-6 sm:grid-cols-2">
              <Pair label="RTO" value={rc.registered_at} />
              <Pair label="Registered on" value={rc.reg_date ? date(rc.reg_date) : null} />
              <Pair label="RC status" value={rc.status} />
              <Pair label="Owner serial" value={rc.owner_serial ? `${rc.owner_serial}` : null} />
              <Pair label="Financer" value={rc.financer || 'Not financed'} />
              <Pair label="Blacklist" value={rc.blacklist_status || 'None recorded'} />
              <Pair label="NOC" value={rc.noc_details || 'None recorded'} />
              <Pair label="Engine / seats" value={[rc.cubic_capacity && `${rc.cubic_capacity} cc`, rc.seats && `${rc.seats} seats`].filter(Boolean).join(' · ')} />
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-sm font-semibold text-ink">Documents</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[['Insurance', rc.insurance_upto], ['PUC', rc.pucc_upto], ['Fitness', rc.fitness_upto],
                ['Road tax', rc.tax_upto], ['Permit', rc.permit_upto], ['Registration', rc.reg_upto]]
                .filter(([, d]) => d).map(([label, d]) => {
                  const days = daysTo(d);
                  return (
                    <Chip key={label} tone={days < 0 ? 'wrong' : days <= 30 ? 'watch' : 'good'}>
                      {label} · {date(d)}
                    </Chip>
                  );
                })}
            </div>
          </div>

          {challans && (
            <div className="card p-4">
              <h2 className="text-sm font-semibold text-ink">
                Challans — {count(challans.pending_count || 0)} pending
                {challans.pending_amount_paise ? ` · ${rupees(challans.pending_amount_paise)}` : ''}
              </h2>
              {(challans.pending || []).length > 0 && (
                <div className="mt-3">
                  <Table head={<tr><th className="th">Date</th><th className="th">Number</th><th className="th">Offence · place</th><th className="th">Amount</th></tr>}>
                    {challans.pending.slice(0, 25).map((c, i) => (
                      <tr key={c.challan_no || i}>
                        <td className="td text-2xs text-muted">{date(c.challan_date)}</td>
                        <td className="td font-mono text-2xs">{c.challan_no}</td>
                        <td className="td">
                          <div>{c.offence || '—'}</div>
                          <div className="text-2xs text-muted">{c.place}</div>
                        </td>
                        <td className="td tabular">{rupees(c.amount_paise)}</td>
                      </tr>
                    ))}
                  </Table>
                  {challans.pending.length > 25 && (
                    <p className="mt-2 text-2xs text-muted">
                      Showing 25 of {challans.pending.length}.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">What this lookup cost</h2>
              <button className="btn-quiet !py-1.5 text-2xs" onClick={() => setRaw(!raw)}>
                {raw ? 'Hide raw response' : 'Show raw response'}
              </button>
            </div>
            <Table head={<tr><th className="th">Path</th><th className="th">Outcome</th><th className="th">Code</th><th className="th">Took</th></tr>}>
              {(data.calls || []).map((c, i) => (
                <tr key={i}>
                  <td className="td font-mono text-2xs">{c.path}</td>
                  <td className="td"><Chip tone={c.outcome === 'FOUND' ? 'good' : 'watch'}>{c.outcome}</Chip></td>
                  <td className="td text-2xs">{c.code}</td>
                  <td className="td tabular text-2xs">{c.ms} ms</td>
                </tr>
              ))}
            </Table>
            <p className="mt-2 text-2xs text-muted">Fetched {dateTime(data.fetched_at)}</p>
            {raw && (
              <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-ink/95 p-3 text-2xs text-white">
                {JSON.stringify(data, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}

const Pair = ({ label, value }) => (
  <div className="flex justify-between gap-3 border-b border-line/60 py-1.5">
    <span className="text-2xs uppercase tracking-wider text-muted">{label}</span>
    <span className="text-right text-sm text-ink">{value || '—'}</span>
  </div>
);
