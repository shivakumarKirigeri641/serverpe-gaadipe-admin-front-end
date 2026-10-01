import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Hint } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { Rolling } from '../../lib/motion.jsx';

/**
 * AD SPEND & COST PER CUSTOMER (user, 2026-10-01). Type in what Meta charged
 * each day; the page sets it against the new customers and paying customers
 * of that day — what each customer and each sale cost, and how many rupees
 * came back per rupee of ads. The same spend appears in the Saturday Excel.
 */
const rs = (p) => (p == null ? '—' : `₹${(Number(p) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);
const todayIst = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export default function AdSpend() {
  const [product, setProduct] = useState('gaadipe');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ day: todayIst(), amount: '', note: '' });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.adSpend({ days: 60, product }).then((x) => { setD(x); setError(null); }).catch(setError), [product]);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await api.saveAdSpend({ ...form, product }); snack(`Saved ₹${form.amount} for ${form.day}`); setForm((f) => ({ ...f, amount: '', note: '' })); load(); }
    catch (err) { snack(err.message, 'wrong'); } finally { setBusy(false); }
  };
  const remove = async (id) => { try { await api.removeAdSpend(id); snack('Removed'); load(); } catch (err) { snack(err.message, 'wrong'); } };

  return (
    <Shell title="Ad spend & cost per customer" subtitle="What ads cost, against the customers and sales they bring"
      actions={
        <div className="flex overflow-hidden rounded-lg border border-line text-2xs">
          {[['gaadipe', 'GaadiPe'], ['quizpe', 'QuizPe']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setProduct(k)} className={`px-3 py-1.5 ${product === k ? 'bg-brand text-white' : 'text-body hover:bg-shell'}`}>{l}</button>
          ))}
        </div>
      }>
      <form onSubmit={save} className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label><span className="label">Day</span>
          <input type="date" className="input" value={form.day} max={todayIst()} onChange={(e) => setForm({ ...form, day: e.target.value })} /></label>
        <label><span className="label">Spent (₹)</span>
          <input className="input !w-32" inputMode="decimal" placeholder="150" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, '') })} /></label>
        <label className="min-w-[12rem] flex-1"><span className="label">Note (optional)</span>
          <input className="input" maxLength={200} placeholder="e.g. Status ad, Karnataka" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        <button className="btn-primary" disabled={busy || !form.amount}>{busy ? 'Saving…' : 'Save'}</button>
        <p className="w-full text-2xs text-muted">From Meta Ads Manager → the day's “Amount spent”. Saving a day again replaces it. {product === 'quizpe' ? 'QuizPe customers are not in GaadiPe’s database, so only the spend is kept.' : ''}</p>
      </form>

      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={8} /> : (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            {d.windows.map((w) => (
              <div key={w.days} className="card p-4">
                <div className="text-2xs font-semibold uppercase tracking-wider text-muted">Last {w.days} days</div>
                <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
                  {[['Spent', rs(w.spend_paise)], ['New customers', w.new_customers], ['Paying', w.paying],
                    ['Per customer', rs(w.cost_per_customer_paise), 'Ad spend ÷ new customers'], ['Per paying customer', rs(w.cost_per_paying_paise), 'Ad spend ÷ customers who paid'],
                    ['Back per ₹1', w.revenue_per_rupee == null ? '—' : `₹${w.revenue_per_rupee}`, 'Revenue ÷ ad spend. Below ₹1 means the ads cost more than the sales they brought (before other costs).']].map(([l, v, note]) => (
                    <Hint key={l} note={note}>
                      <div><div className="text-2xs text-muted">{l}</div><div className="text-lg font-bold text-ink"><Rolling text={String(v)} /></div></div>
                    </Hint>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="border-b border-line text-left text-2xs uppercase tracking-wider text-muted">
                <th className="px-4 py-2">Day</th><th className="px-3 py-2 text-right">Spent</th><th className="px-3 py-2 text-right">New customers</th>
                <th className="px-3 py-2 text-right">Paying</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">Per paying customer</th><th className="px-3 py-2">Note</th><th />
              </tr></thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.day} className={`border-b border-line/60 ${r.spend_paise ? '' : 'text-muted'}`}>
                    <td className="px-4 py-2">{new Date(`${r.day}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}</td>
                    <td className="px-3 py-2 text-right font-semibold">{r.spend_paise ? rs(r.spend_paise) : <button type="button" className="text-2xs text-brand-deep hover:underline" onClick={() => setForm((f) => ({ ...f, day: r.day }))}>+ add</button>}</td>
                    <td className="px-3 py-2 text-right">{r.new_customers}</td>
                    <td className="px-3 py-2 text-right">{r.paying}</td>
                    <td className="px-3 py-2 text-right">{rs(r.revenue_paise)}</td>
                    <td className="px-3 py-2 text-right">{r.spend_paise && r.paying ? rs(Math.round(r.spend_paise / r.paying)) : '—'}</td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-2xs" title={r.note || undefined}>{r.note || ''}</td>
                    <td className="px-3 py-2 text-right">{r.id && <button type="button" className="text-2xs text-wrong-700 hover:underline" onClick={() => remove(r.id)}>Remove</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
