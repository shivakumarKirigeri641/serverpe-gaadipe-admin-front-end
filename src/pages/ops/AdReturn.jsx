import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Hint } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { count, rupees } from '../../lib/format';

/**
 * WHAT EACH AD BROUGHT (user, 2026-10-03). Per Meta ad: people, people who
 * checked, people who paid, reports, revenue — against the spend you enter
 * from Ads Manager — so the ad to keep is the one with the lowest cost per
 * paying customer and the highest revenue per rupee. Back end: opsExtras.adReturn.
 */
export default function AdReturn() {
  const [days, setDays] = useState(30);
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState({});
  const load = useCallback(() => api.adReturn({ days }).then((x) => { setD(x); setError(null); }).catch(setError), [days]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const save = async (a) => {
    const v = edit[a.ad_key];
    try {
      await api.saveAdReturnSpend({ ad_key: a.ad_key, label: a.label, rupees: Number(v) });
      snack('Spend saved'); setEdit((e) => ({ ...e, [a.ad_key]: undefined })); load();
    } catch (e) { snack(e.message || 'Could not save', 'wrong'); }
  };
  const best = d ? Math.min(...d.ads.filter((a) => a.cost_per_payer != null).map((a) => a.cost_per_payer)) : null;

  return (
    <Shell title="What each ad brought" subtitle="Per Meta ad: people, payers and revenue against what you spent on it"
      actions={
        <select className="input !w-auto !py-1.5 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90, 365].map((n) => <option key={n} value={n}>Joined in the last {n} days</option>)}
        </select>
      }>
      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : (
        <>
          <p className="mb-3 text-2xs text-muted">{d.note}</p>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-2xs text-muted">
                <th className="px-4 py-2">Ad</th><th className="px-3 py-2 text-right">People</th><th className="px-3 py-2 text-right">Checked</th>
                <th className="px-3 py-2 text-right">Paid</th><th className="px-3 py-2 text-right">Conversion</th><th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2">Spend (₹)</th>
                <th className="px-3 py-2 text-right"><Hint note="Spend ÷ people who paid. Lower is better.">Cost / payer</Hint></th>
                <th className="px-3 py-2 text-right"><Hint note="Revenue ÷ spend. Above 1 means the ad paid for itself.">₹ back per ₹1</Hint></th>
              </tr></thead>
              <tbody>
                {d.ads.map((a) => (
                  <tr key={a.ad_key || 'none'} className={`border-b border-line/60 last:border-0 ${!a.ad_key ? 'bg-shell/50' : ''}`}>
                    <td className="max-w-[16rem] px-4 py-2">
                      <div className="truncate font-semibold text-ink">{a.label}</div>
                      {a.ad_key && a.ad_key !== a.label && <div className="truncate font-mono text-[10px] text-muted">{a.ad_key}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular">{count(a.people)}</td>
                    <td className="px-3 py-2 text-right tabular">{count(a.checked)}</td>
                    <td className="px-3 py-2 text-right tabular font-semibold">{count(a.payers)}</td>
                    <td className="px-3 py-2 text-right tabular">{a.conversion == null ? '—' : `${a.conversion}%`}</td>
                    <td className="px-3 py-2 text-right tabular">{rupees(a.revenue)}</td>
                    <td className="px-3 py-2">
                      {a.ad_key ? (
                        <span className="flex items-center gap-1">
                          <input className="input !w-24 !py-1 text-2xs" inputMode="decimal" id={`spend-${a.ad_key}`}
                            placeholder={a.spend_paise == null ? 'enter' : String(a.spend_paise / 100)}
                            value={edit[a.ad_key] ?? ''} onChange={(e) => setEdit((x) => ({ ...x, [a.ad_key]: e.target.value }))} />
                          {edit[a.ad_key] !== undefined && edit[a.ad_key] !== '' && <button type="button" className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => save(a)}>Save</button>}
                        </span>
                      ) : <span className="text-2xs text-muted">—</span>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular ${a.cost_per_payer != null && a.cost_per_payer === best ? 'font-bold text-good-700' : ''}`}>
                      {a.cost_per_payer == null ? '—' : rupees(a.cost_per_payer)}
                    </td>
                    <td className={`px-3 py-2 text-right tabular font-semibold ${a.revenue_per_rupee == null ? '' : a.revenue_per_rupee >= 1 ? 'text-good-700' : 'text-wrong-700'}`}>
                      {a.revenue_per_rupee == null ? '—' : `₹${a.revenue_per_rupee}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!d.ads.some((a) => a.ad_key) && <p className="mt-3 text-sm text-muted">No one has come from a Meta ad in this period yet. Ads that open WhatsApp are recognised automatically.</p>}
        </>
      )}
    </Shell>
  );
}
