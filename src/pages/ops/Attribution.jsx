import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { usePeriod } from '../../components/Period.jsx';
import { Failed, Skeleton, Empty, Table, Modal } from '../../components/ui.jsx';
import { dateTime } from '../../lib/format';
import { rs, num, pct } from './common.jsx';

/**
 * CAMPAIGNS & ATTRIBUTION (user, 2026-09-25) — every source, then every
 * campaign inside one, from visitors to net contribution; by first touch
 * (never overwritten) or last touch. A row drills to its campaigns, then to
 * the customers behind them, then to their journey, vehicle and payment.
 * No ad spend is recorded, so there is no CAC or ROAS.
 */
export default function Attribution() {
  const [sp, setSp] = useSearchParams();
  const source = sp.get('source') || '';
  const model = sp.get('model') === 'last' ? 'last' : 'first';
  const [params, controls, key] = usePeriod('attribution', { defaultRange: '30d', withCompare: false });
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [people, setPeople] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.attribution({ ...params, model, source: source || undefined })); } catch (e) { setError(e); } }, [key, model, source]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const set = (p) => setSp(Object.fromEntries(Object.entries({ source, model, ...p }).filter(([, v]) => v && v !== 'first')));
  const openPeople = async (campaign) => {
    setPeople({ title: campaign ? `${d.source_label} · ${campaign}` : d.rows.find((r) => r.key === campaign)?.label, rows: null });
    const out = await api.attributionPeople({ source: source || campaign, campaign: source ? campaign : undefined, model });
    setPeople((p) => ({ ...p, rows: out.rows }));
  };
  const cols = ['Visitors', 'WhatsApp starts', 'Vehicle searches', 'Lookups', 'Payment attempts', 'Payments', 'Revenue', 'GST', 'API', 'Gateway', 'WhatsApp cost', 'Net', 'Conversion', ''];
  return (
    <Shell title="Campaigns & attribution" subtitle={d ? `${d.range.label}${source ? ` · ${d.source_label}` : ''}` : ' '}
      actions={<>
        <select className="input !w-auto !py-1.5 text-sm" value={model} onChange={(e) => set({ model: e.target.value })}>
          <option value="first">First touch</option><option value="last">Last touch</option>
        </select>{controls}
      </>}>
      {source && <button className="btn-quiet mb-3 !py-1 text-2xs" onClick={() => set({ source: '' })}>← All sources</button>}
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : !d.rows.length ? <Empty>No data available for this period.</Empty> : (
          <Table head={<tr><th className="th">{source ? 'Campaign' : 'Source'}</th>{cols.map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
            {d.rows.map((r) => (
              <tr key={r.key} className="cursor-pointer hover:bg-shell/60" onClick={() => (source ? openPeople(r.key) : set({ source: r.key }))}>
                <td className="td font-semibold text-ink">{r.label}{r.family && <div className="text-2xs font-normal text-muted">{r.family}</div>}</td>
                <td className="td tabular">{num(r.visitors)}</td><td className="td tabular">{num(r.wa_starts)}</td><td className="td tabular">{num(r.searches)}</td>
                <td className="td tabular">{num(r.lookups)}</td><td className="td tabular">{num(r.attempts)}</td><td className="td tabular">{num(r.payments)}</td>
                <td className="td tabular">{rs(r.revenue_paise)}</td><td className="td tabular">{rs(r.gst_paise)}</td><td className="td tabular">{rs(r.api_cost_paise)}</td>
                <td className="td tabular">{rs(r.gateway_paise)}</td><td className="td tabular">{rs(r.whatsapp_cost_paise)}</td>
                <td className={`td tabular font-semibold ${r.net_paise < 0 ? 'text-wrong-700' : 'text-ink'}`}>{rs(r.net_paise)}</td>
                <td className="td tabular">{pct(r.conversion_pct)}<div className="text-2xs text-muted">of {r.conversion_base}</div></td>
                <td className="td text-2xs text-brand">{source ? 'Customers →' : 'Campaigns →'}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      {d && <div className="mt-2 space-y-0.5 text-2xs text-muted"><p>{d.notes.model}</p><p>{d.notes.net}</p><p>{d.notes.spend} {d.notes.referral}</p></div>}
      {people && (
        <Modal wide title={people.title || 'Customers'} subtitle="Open a customer’s journey, then their vehicle or payment" onClose={() => setPeople(null)}>
          {!people.rows ? <Skeleton rows={4} /> : !people.rows.length ? <Empty>No customers.</Empty> : (
            <Table head={<tr>{['Customer', 'First seen', 'Last active', 'Purchased', 'Revenue', 'Last vehicle', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
              {people.rows.map((x) => (
                <tr key={x.id}>
                  <td className="td font-mono">{x.mobile || `#${x.id}`}</td><td className="td text-2xs">{dateTime(x.created_at)}</td><td className="td text-2xs">{dateTime(x.last_active)}</td>
                  <td className="td tabular">{num(x.paid)}</td><td className="td tabular">{rs(x.revenue_paise)}</td>
                  <td className="td font-mono">{x.last_reg ? <Link className="text-brand-deep hover:underline" to={`/vehicles/${x.last_reg}`}>{x.last_reg}</Link> : '—'}</td>
                  <td className="td"><Link className="btn-quiet !px-2 !py-1 text-2xs" to={`/journey?user=${x.id}`}>Journey</Link></td>
                </tr>
              ))}
            </Table>
          )}
        </Modal>
      )}
    </Shell>
  );
}
