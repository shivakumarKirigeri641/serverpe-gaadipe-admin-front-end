import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Shell from '../components/Shell.jsx';
import { api } from '../lib/api';
import { plate, dateTime, ago } from '../lib/format';
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
  // Arriving from a vehicle profile ("Check it now"): the number is filled in, not looked up.
  const [sp] = useSearchParams();
  const [reg, setReg] = useState(() => (sp.get('reg') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12));
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('rc');
  const [round, setRound] = useState(0);

  // Close the open vehicle and start again (user, 2026-10-01).
  const inputRef = useRef(null);
  const clear = () => {
    setData(null); setError(null); setReg(''); setTab('rc');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const [history, setHistory] = useState(null);
  const loadHistory = () => api.checkHistory().then((h) => setHistory(h.rows || [])).catch(() => setHistory([]));
  useEffect(() => { loadHistory(); }, []);

  const run = async (refresh, value = reg.toUpperCase().replace(/[^A-Z0-9]/g, '')) => {
    if (value.length < 5) { setError({ message: 'Enter a full registration number.' }); return; }
    setBusy(true); setError(null); setData(null);
    try {
      const out = await api.check(value, { refresh: refresh ? 1 : undefined, challans: 'all' });
      if (out.success === false) { setError({ message: out.message || 'Not found.' }); return; }
      setData(out);
      setRound((n) => n + 1);
      loadHistory();
    } catch (e) { setError(e); } finally { setBusy(false); }
  };

  /* A vehicle from "Vehicles you checked": its saved record, instantly and with
     no ULIP call (user, 2026-10-01); a live check only if nothing is saved. */
  const openSaved = async (r) => {
    setReg(r.reg_no); setTab('rc');
    if (!r.saved_at) { run(false, r.reg_no); return; }
    setBusy(true); setError(null); setData(null);
    try {
      setData(await api.checkSaved(r.reg_no));
      setRound((n) => n + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
          <span className="relative block">
            <input ref={inputRef} className="input pr-10 font-mono text-lg uppercase tracking-wider" value={reg} autoFocus
              placeholder="KA01AB1234" maxLength={14} onChange={(e) => setReg(e.target.value)} />
            {(reg || data || error) && (
              <button type="button" onClick={clear} aria-label="Clear" title="Clear"
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted transition hover:bg-shell hover:text-ink">✕</button>
            )}
          </span>
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
            <button type="button" onClick={clear} className="btn-quiet !px-3 !py-2 text-sm" title="Close this vehicle">← Back to list</button>
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${tab === t.key ? 'bg-brand text-white' : 'border border-line bg-white text-muted hover:text-ink'}`}>
                {t.label}{badge(t.key)}
              </button>
            ))}
            <span className="ml-auto font-mono text-sm font-semibold text-ink">{plate(data.vehicle_number)}</span>
          </div>

          {data.saved ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-2xs text-body">
              <span>📁 <b>Saved record</b> — fetched {dateTime(data.fetched_at)} ({ago(data.fetched_at)}) · {data.source} · no ULIP call</span>
              <button type="button" className="btn-quiet ml-auto !py-1 text-2xs" disabled={busy} onClick={() => run(true, data.vehicle_number)}>↻ Refresh live from ULIP</button>
            </div>
          ) : (
            <p className="mb-3 text-2xs text-muted">
              {data.source ? `${data.source} · ` : ''}
              {data.cached ? `from cache, ${data.age_minutes ?? 0} min old` : 'fresh from ULIP'}
              {` · ${data.ulip_calls_made} ULIP call${data.ulip_calls_made === 1 ? '' : 's'} · ${data.latency_ms} ms`}
            </p>
          )}

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

      <CheckedList rows={history} current={data?.vehicle_number} onOpen={openSaved} />
    </Shell>
  );
}

/*
 * VEHICLES YOU CHECKED (user, 2026-10-01): every vehicle you have looked up
 * here, newest first — make and model, how often and when, its documents and
 * challans at a glance. Tap one and it opens in full above from its saved
 * record (RC, every challan, FASTag tags and IDs), without spending a lookup.
 */
const DOCS = [['insurance_upto', 'Insurance'], ['pucc_upto', 'PUC'], ['fitness_upto', 'Fitness'], ['tax_upto', 'Tax']];
const daysTo = (d) => (d ? Math.round((new Date(d) - Date.now()) / 864e5) : null);
function DocChip({ label, date }) {
  const n = daysTo(date);
  if (n == null) return null;
  const tone = n < 0 ? 'bg-wrong-50 text-wrong-700' : n <= 30 ? 'bg-watch-50 text-watch-700' : 'bg-good-50 text-good-700';
  return <span className={`chip ${tone}`} title={`${label}: ${dateTime(date).split(',')[0]}`}>{n < 0 ? '✕' : n <= 30 ? '!' : '✓'} {label}</span>;
}
function CheckedList({ rows, current, onOpen }) {
  const [q, setQ] = useState('');
  if (!rows) return null;
  const words = q.trim().toLowerCase();
  const shown = rows.filter((r) => !words || `${r.reg_no} ${r.maker || ''} ${r.model || ''}`.toLowerCase().includes(words));
  return (
    <div className="card mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-gradient-to-r from-brand/10 to-transparent px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">Vehicles you checked <span className="font-normal text-muted">· {rows.length}</span></h2>
        <input className="input ml-auto !w-56 !py-1.5 text-sm" placeholder="Filter by plate, make, model" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!shown.length ? <p className="px-4 py-6 text-sm text-muted">{rows.length ? 'Nothing matches that.' : 'Vehicles you check here will be listed, so you can open them again without a new lookup.'}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-muted">
                <th className="px-4 py-2">Vehicle</th><th className="px-3 py-2">Make · model</th><th className="px-3 py-2">Documents</th>
                <th className="px-3 py-2 text-right">Challans</th><th className="px-3 py-2 text-right">Checked</th><th className="px-3 py-2">Last checked</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.reg_no} onClick={() => onOpen(r)}
                  className={`cursor-pointer border-b border-line/60 transition-colors hover:bg-brand/[0.05] ${current === r.reg_no ? 'bg-brand/[0.07]' : ''}`}
                  style={{ animation: `cv-row .35s ease-out ${Math.min(i, 20) * 0.025}s both` }}>
                  <td className="px-4 py-2.5"><span className="plate">{plate(r.reg_no)}</span></td>
                  <td className="max-w-[260px] px-3 py-2.5">
                    {r.maker || r.model ? (
                      <>
                        <span className="block truncate font-medium text-ink" title={r.model}>{r.model || '—'}</span>
                        <span className="block truncate text-2xs text-muted">{[r.maker, r.vehicle_class, r.fuel].filter(Boolean).join(' · ')}</span>
                      </>
                    ) : <span className="text-2xs text-muted">Not saved yet — tap to check live</span>}
                  </td>
                  <td className="px-3 py-2.5"><span className="flex flex-wrap gap-1">{DOCS.map(([k, l]) => <DocChip key={k} label={l} date={r[k]} />)}</span></td>
                  <td className="px-3 py-2.5 text-right">{r.challans_pending == null ? <span className="text-muted">—</span>
                    : r.challans_pending ? <span className="chip bg-wrong-50 text-wrong-700">{r.challans_pending} pending</span> : <span className="text-good-700">0</span>}</td>
                  <td className="px-3 py-2.5 text-right tabular text-body">{r.times}×</td>
                  <td className="px-3 py-2.5 text-2xs text-muted" title={dateTime(r.last_at)}>{ago(r.last_at)}</td>
                  <td className="px-3 py-2.5 text-right text-2xs font-semibold text-brand-deep">{r.saved_at ? 'Open →' : 'Check →'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <style>{`@keyframes cv-row { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }`}</style>
    </div>
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
