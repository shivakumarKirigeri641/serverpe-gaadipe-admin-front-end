import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { rupees, dateTime } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Field, Hint, Spinner, Failed, Table } from '../components/ui.jsx';

/**
 * Prices, and everything else that changes without a deploy.
 *
 * TWO KINDS OF THING LIVE HERE, and they are kept apart on the screen because
 * they carry different risk: a PLAN's price is what a customer is charged, and
 * a SETTING is how the product behaves. Both are audited with the value before
 * and after.
 *
 * The settings that matter are grouped and explained; the rest are left in a
 * plain list rather than hidden, because a setting nobody can find is a setting
 * that gets changed in the database at midnight.
 */
const GROUPS = [
  {
    title: 'What a check costs us',
    keys: {
      free_checks_per_day: 'Free checks a day for someone with no subscription.',
      free_checks_per_day_trial: 'Free checks a day while a trial is running.',
      checks_burst_per_minute: 'Checks allowed in any one minute, per person.',
      checks_repeat_window_minutes: 'Re-checking the same vehicle inside this many minutes is free and uncounted.',
      checks_enforce: 'Whether the limits above actually refuse anyone (true/false). Counting happens either way.',
    },
  },
  {
    title: 'Reports and alerts',
    keys: {
      report_valid_days: 'How many days a paid report can be downloaded again.',
      watch_check_interval_minutes: 'Default gap between checks of a watched vehicle.',
      watch_interval_minutes_challan: 'Gap between challan checks. The only dataset that really moves.',
      watch_interval_minutes_rc: 'Gap between RC checks.',
      watch_interval_minutes_fastag: 'Gap between FASTag checks.',
      renewal_notice_days: 'Days before a subscription ends that the reminder is sent.',
    },
  },
  {
    title: 'Money',
    keys: {
      razorpay_fee_percent: "Razorpay's fee, as a percentage. UPI is nil today; cards about 2%.",
      razorpay_fee_gst_percent: 'GST on that fee — 18% in India.',
      ulip_cost_paise_vahan: 'What one VAHAN lookup costs us, in paise. Zero while ULIP is free.',
      ulip_cost_paise_challan: 'What one e-Challan lookup costs us, in paise.',
      ulip_cost_paise_fastag: 'What one FASTag lookup costs us, in paise.',
    },
  },
  {
    title: 'What customers are shown',
    keys: {
      owner_name_display: "hidden, masked or full. 'hidden' is the promise the site and the bot both make.",
      document_numbers_display: 'hidden, masked or full. Masked shows the last four characters.',
    },
  },
];

export default function Settings() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);

  const load = useCallback(async () => {
    try { setError(null); setDraft({}); setData(await api.settings()); }
    catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const value = (key) => (key in draft ? draft[key] : (data?.settings.find(s => s.key === key)?.value ?? ''));
  const set = (key, v) => setDraft((d) => ({ ...d, [key]: v }));
  const dirty = Object.keys(draft).length > 0;

  const save = async () => {
    setSaving(true); setSaved(null);
    try {
      const out = await api.saveSettings(draft);
      setSaved(`${out.changed} setting${out.changed === 1 ? '' : 's'} saved.`);
      await load();
    } catch (e) { setError(e); } finally { setSaving(false); }
  };

  const known = new Set(GROUPS.flatMap(g => Object.keys(g.keys)));
  const others = (data?.settings || []).filter(s => !known.has(s.key));

  return (
    <Shell title="Prices & settings" subtitle="Changes take effect within a minute — no deploy"
      actions={dirty && (
        <>
          <button className="btn-quiet !py-1.5 text-2xs" onClick={() => setDraft({})}>Discard</button>
          <button className="btn-primary !py-1.5 text-2xs" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : `Save ${Object.keys(draft).length} change(s)`}
          </button>
        </>
      )}>

      {error && <Failed error={error} onRetry={load} />}
      {saved && <Banner tone="good" className="mb-4">{saved}</Banner>}
      {!data && !error && <Spinner />}

      {data && (
        <div className="space-y-4">
          <div className="card">
            <div className="border-b border-line px-5 py-3">
              <h2 className="text-sm font-semibold text-ink">Plans</h2>
              <p className="text-2xs text-muted">
                What a customer is charged. Changing a price here changes the website, the bot and the
                checkout page together.
              </p>
            </div>
            <Table head={<tr><th className="th">Plan</th><th className="th">Price</th><th className="th">Days</th><th className="th">Active</th><th className="th"></th></tr>}>
              {data.plans.map((p) => <PlanRow key={p.code} plan={p} onSaved={load} />)}
            </Table>
          </div>

          {GROUPS.map((g) => (
            <div key={g.title} className="card">
              <div className="border-b border-line px-5 py-3">
                <h2 className="text-sm font-semibold text-ink">{g.title}</h2>
              </div>
              <div className="divide-y divide-line">
                {Object.entries(g.keys)
                  .filter(([key]) => data.settings.some(s => s.key === key))
                  .map(([key, note]) => (
                    <div key={key} className="grid gap-2 px-5 py-3 sm:grid-cols-2 sm:items-center">
                      <div>
                        <div className="font-mono text-2xs text-ink">{key}</div>
                        <div className="text-2xs text-muted">{note}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input className={`input !py-2 ${key in draft ? '!border-brand-accent' : ''}`}
                          value={value(key)} onChange={(e) => set(key, e.target.value)} />
                        {/^\d+$/.test(String(value(key))) && /paise/.test(key) && (
                          <span className="whitespace-nowrap text-2xs text-muted">
                            = {rupees(Number(value(key)))}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}

          {others.length > 0 && (
            <details className="card">
              <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-ink">
                Everything else ({others.length})
              </summary>
              <div className="divide-y divide-line border-t border-line">
                {others.map((s) => (
                  <div key={s.key} className="grid gap-2 px-5 py-2.5 sm:grid-cols-2 sm:items-center">
                    <Hint note={`Last changed ${dateTime(s.modified_at)}`}>
                      <span className="font-mono text-2xs text-body">{s.key}</span>
                    </Hint>
                    <input className={`input !py-2 ${s.key in draft ? '!border-brand-accent' : ''}`}
                      value={value(s.key)} onChange={(e) => set(s.key, e.target.value)} />
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </Shell>
  );
}

function PlanRow({ plan, onSaved }) {
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.savePlan(plan.code, {
        price_paise: Number(edit.price_paise),
        duration_days: Number(edit.duration_days),
        is_active: edit.is_active,
      });
      setEdit(null); onSaved();
    } catch (e) { window.alert(e.message); } finally { setBusy(false); }
  };

  return (
    <tr>
      <td className="td">
        <div className="font-semibold text-ink">{plan.name}</div>
        <div className="font-mono text-2xs text-muted">{plan.code} · {plan.kind}</div>
      </td>
      <td className="td tabular">
        {edit ? (
          <input className="input !w-28 !py-1.5" value={edit.price_paise}
            onChange={(e) => setEdit({ ...edit, price_paise: e.target.value })} />
        ) : (
          <Hint note={`${plan.price_paise} paise, GST inclusive`}>
            <span className="font-semibold">{rupees(plan.price_paise)}</span>
          </Hint>
        )}
      </td>
      <td className="td tabular">
        {edit ? (
          <input className="input !w-20 !py-1.5" value={edit.duration_days}
            onChange={(e) => setEdit({ ...edit, duration_days: e.target.value })} />
        ) : plan.duration_days}
      </td>
      <td className="td">
        {edit ? (
          <input type="checkbox" checked={edit.is_active}
            onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />
        ) : (plan.is_active ? 'Yes' : 'No')}
      </td>
      <td className="td">
        {edit ? (
          <div className="flex gap-1.5">
            <button className="btn-primary !px-2.5 !py-1 text-2xs" disabled={busy} onClick={save}>
              {busy ? '…' : 'Save'}
            </button>
            <button className="btn-quiet !px-2.5 !py-1 text-2xs" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        ) : (
          <button className="btn-quiet !px-2.5 !py-1 text-2xs"
            onClick={() => setEdit({ price_paise: plan.price_paise, duration_days: plan.duration_days, is_active: plan.is_active })}>
            Edit
          </button>
        )}
      </td>
    </tr>
  );
}
