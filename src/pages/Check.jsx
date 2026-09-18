import { useEffect, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { api } from '../lib/api';
import { plate, dateTime } from '../lib/format';
import { RcView, ChallanView, FastagView, FastagNotApplicable, Section, isTwoWheeler, EXPIRY_KEY, expiryOf, BAD_STATUS } from '../components/VehicleRecord.jsx';
import { Banner, Chip, Hint, Table } from '../components/ui.jsx';

/*
 * Check a vehicle — RC, eChallans and FASTag in full, laid out as the Pravesha
 * panel's check (user, 2026-09-18). The helpers and views below are that page's,
 * kept alike so the two panels read the same; the page at the bottom is
 * GaadiPe's, which gets all three records in one response.
 */

/* ─────────────────────────────────────────────────────────────── page ── */

const TABS = [
  { key: 'rc', label: 'RC' },
  { key: 'challans', label: 'eChallan' },
  { key: 'fastag', label: 'FASTag' },
  { key: 'lookup', label: 'Lookup' },
];

/**
 * Look a vehicle up for yourself — in full.
 *
 * The plate as it looks on the road, the facts people ask for first as tiles,
 * documents coloured by expiry, then every challan and every FASTag record,
 * with every other field the record returned one tap away. It goes through the
 * same gateway a customer's check does, so what appears here is what they are
 * shown once they pay.
 *
 * `Refresh from ULIP` spends a live call instead of using the cache. It is a
 * separate button rather than the default, because the cache keeps the margin.
 * Every check is written to the audit trail.
 */
export default function Check() {
  const [reg, setReg] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('rc');
  const [round, setRound] = useState(0);

  const run = async (refresh) => {
    const value = reg.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length < 5) { setError({ message: 'Enter a full registration number.' }); return; }
    setBusy(true); setError(null); setData(null);
    try {
      const out = await api.check(value, { refresh: refresh ? 1 : undefined, challans: 'all' });
      if (out.success === false) { setError({ message: out.message || 'Not found.' }); return; }
      setData(out);
      setRound((n) => n + 1);
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  const rc = data?.rc || {};
  const challans = data?.challans;
  const fastagNA = isTwoWheeler(rc) && !(data?.fastag?.tags || []).length;

  const badge = (key) => {
    if (!data) return null;
    if (key === 'rc') {
      const hits = Object.entries(rc).filter(([k, v]) => EXPIRY_KEY.test(k) && v).map(([, v]) => expiryOf(v)).filter((e) => e && e.state !== 'valid');
      if (hits.some((e) => e.state === 'expired') || BAD_STATUS.test(rc.status || '')) return <span className="chip ml-1.5 bg-wrong-500 text-white">expired</span>;
      if (hits.length) return <span className="chip ml-1.5 bg-watch-500 text-white">expiring</span>;
      return <span className="ml-1.5">✓</span>;
    }
    if (key === 'challans') {
      if (!challans) return <span className="ml-1.5 font-bold text-wrong-700">!</span>;
      const n = challans.summary?.total_pending ?? challans.pending_count ?? 0;
      return n ? <span className="chip ml-1.5 bg-wrong-500 text-white">{n}</span> : <span className="ml-1.5">✓</span>;
    }
    if (key === 'fastag') {
      if (fastagNA) return <span className="chip ml-1.5 bg-shell text-muted">N/A</span>;
      if (!data.fastag) return <span className="ml-1.5 font-bold text-wrong-700">!</span>;
      return <span className="ml-1.5">✓</span>;
    }
    return <span className="chip ml-1.5 bg-shell text-muted">{data.ulip_calls_made}</span>;
  };

  return (
    <Shell title="Check a vehicle" subtitle="RC, eChallans and FASTag in full · the same lookup a customer pays for · recorded in the audit trail">
      <form className="card mb-5 flex flex-wrap items-end gap-3 p-4" onSubmit={(e) => { e.preventDefault(); run(false); }}>
        <label className="min-w-[14rem] flex-1">
          <span className="label">Vehicle number</span>
          <input className="input font-mono text-lg uppercase tracking-wider" value={reg} autoFocus
            placeholder="KA01AB1234" maxLength={14} onChange={(e) => setReg(e.target.value)} />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Looking…' : 'Check'}</button>
        <Hint note="Spends a live ULIP call instead of answering from the cache. Free today; the reason to be sparing is the day it is not.">
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => run(true)}>Refresh from ULIP</button>
        </Hint>
      </form>

      {error && <Banner tone="wrong" className="mb-4">{error.message}</Banner>}
      {busy && (
        <div className="card flex items-center justify-center gap-3 p-8 text-sm text-muted">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
          Reading the Government records… a vehicle with a long challan history can take a minute.
        </div>
      )}

      {data && !busy && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? 'bg-brand text-white' : 'border border-line bg-white text-muted hover:text-ink'}`}>
                {t.label}{badge(t.key)}
              </button>
            ))}
            <span className="ml-auto font-mono text-sm font-semibold text-ink">{plate(data.vehicle_number)}</span>
          </div>

          <p className="mb-3 text-2xs text-muted">
            {data.source ? `${data.source} · ` : ''}
            {data.cached ? `from cache, ${data.age_minutes ?? 0} min old` : 'fresh from ULIP'}
            {` · ${data.ulip_calls_made} ULIP call${data.ulip_calls_made === 1 ? '' : 's'} · ${data.latency_ms} ms`}
          </p>

          <div key={`${round}:${tab}`} className="cv-rise">
            {tab === 'rc' && <RcView body={{ rc, vehicle_number: data.vehicle_number }} />}
            {tab === 'challans' && (challans
              ? <ChallanView body={challans} />
              : <Banner tone="watch">The challan record could not be read{data.challans_error ? `: ${data.challans_error}` : '.'}</Banner>)}
            {tab === 'fastag' && (fastagNA ? <FastagNotApplicable /> : data.fastag
              ? <FastagView body={{ fastag: data.fastag }} />
              : <Banner tone="watch">The FASTag record could not be read{data.fastag_error ? `: ${data.fastag_error}` : '.'}</Banner>)}
            {tab === 'lookup' && <LookupView data={data} />}
          </div>
        </>
      )}
    </Shell>
  );
}

/* What the lookup cost, call by call, and the whole response. */
function LookupView({ data }) {
  const [raw, setRaw] = useState(false);
  return (
    <Section title="What this lookup cost" right={
      <button type="button" className="btn-quiet !py-1.5 text-2xs" onClick={() => setRaw(!raw)}>{raw ? 'Hide raw response' : 'Show raw response'}</button>
    }>
      <div className="-m-5">
        {(data.calls || []).length ? (
          <Table head={<tr><th className="th">Path</th><th className="th">Outcome</th><th className="th">Code</th><th className="th">Took</th></tr>}>
            {data.calls.map((c, i) => (
              <tr key={i}>
                <td className="td font-mono text-2xs">{c.path}</td>
                <td className="td"><Chip tone={c.outcome === 'FOUND' ? 'good' : 'watch'}>{c.outcome}</Chip></td>
                <td className="td text-2xs">{c.code}</td>
                <td className="td tabular text-2xs">{c.ms} ms</td>
              </tr>
            ))}
          </Table>
        ) : <p className="px-5 py-4 text-sm text-muted">Answered entirely from the cache — no ULIP call made.</p>}
        <p className="px-5 py-3 text-2xs text-muted">Fetched {dateTime(data.fetched_at)}</p>
        {raw && (
          <pre className="mx-5 mb-5 max-h-96 overflow-auto rounded-lg bg-ink/95 p-3 text-2xs text-white">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    </Section>
  );
}
