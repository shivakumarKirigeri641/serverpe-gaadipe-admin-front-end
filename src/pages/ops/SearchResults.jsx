import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Empty } from '../../components/ui.jsx';
import { describe } from '../../components/GlobalSearch.jsx';

/** Every match for a search, grouped — where the header's Enter lands. */
const GROUPS = [['vehicles', 'Vehicles'], ['customers', 'Customers'], ['payments', 'Payments'], ['reports', 'Reports'], ['events', 'Events']];

export default function SearchResults() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') || '';
  const [typed, setTyped] = useState(q);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { setTyped(q); if (q.trim().length < 2) { setD(null); return; } setD(undefined); api.search(q, 20).then(setD).catch(setError); }, [q]);
  const total = d ? GROUPS.reduce((s, [g]) => s + (d.groups[g] || []).length, 0) : 0;
  return (
    <Shell title="Search" subtitle={d ? `${total} result${total === 1 ? '' : 's'} for “${q}”` : ' '}>
      <form className="card mb-3 flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); setSp({ q: typed.trim() }); }}>
        <input className="input !py-2" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Vehicle number, customer, phone, payment / order / report / invoice ID" />
        <button className="btn-primary !py-2">Search</button>
      </form>
      {error ? <div className="card"><Failed error={error} /></div> : d === undefined ? <div className="card"><Skeleton rows={6} /></div> : !d ? (
        <Empty>Type at least two characters.</Empty>
      ) : !total ? <div className="card"><Empty>Nothing matches “{q}”.</Empty></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {GROUPS.filter(([g]) => (d.groups[g] || []).length).map(([g, label]) => (
            <div key={g} className="card overflow-hidden">
              <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">{label} <span className="text-2xs font-normal text-muted">{d.groups[g].length}</span></div>
              <ul className="divide-y divide-line">
                {d.groups[g].map((x) => { const [t1, t2] = describe(g, x); return (
                  <li key={`${g}${x.id || x.reg_no}`}><Link to={x.to} className="block px-4 py-2 hover:bg-shell/60">
                    <div className="font-mono text-sm font-semibold text-brand-deep">{t1}</div><div className="text-2xs text-muted">{t2}</div></Link></li>
                ); })}
              </ul>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-2xs text-muted">Referral IDs are not searched — GaadiPe has no referral programme for now.</p>
    </Shell>
  );
}
