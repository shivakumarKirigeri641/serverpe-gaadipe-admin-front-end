import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Table, Modal, Field, Hint } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { dateTime } from '../../lib/format';
import { rs } from './common.jsx';

/**
 * BUSINESS CONFIGURATION (user, 2026-09-25) — the values the money is worked
 * out from: report price, GST rate, gateway fee, WhatsApp and records-API
 * costs, report validity. Every change goes through the same audited routes
 * as Settings and shows below with before and after. Referral settings are
 * not shown: no referral programme for now.
 */
export default function Configuration() {
  const { can } = useSession();
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.config()); } catch (e) { setError(e); } }, []);
  useEffect(() => { load(); }, [load]);
  const gstNow = d?.gst.find((g) => g.is_active && !g.effective_to);
  return (
    <Shell title="Business configuration" subtitle="Prices, tax and costs — every change is logged"
      actions={<Link to="/flags" className="btn-quiet !py-1.5 text-2xs">Feature flags →</Link>}>
      {error && !d ? <div className="card"><Failed error={error} onRetry={load} /></div> : !d ? <div className="card"><Skeleton rows={10} /></div> : (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">Report price</h2>
              {d.plans.filter((p) => p.kind === 'report').map((p) => (
                <div key={p.code} className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm">{p.name}{!p.is_active && <span className="text-2xs text-muted"> (inactive)</span>}</span>
                  <span className="flex items-center gap-2"><b className="tabular">{rs(p.price_paise)}</b> <span className="text-2xs text-muted">incl. GST</span>
                    {allowed(can, 'settings') && <button className="btn-quiet !px-2 !py-0.5 text-2xs" onClick={() => setEdit({ kind: 'plan', plan: p })}>Change</button>}</span>
                </div>
              ))}
            </div>
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold text-ink">GST rate</h2>
              <div className="flex items-center justify-between"><span className="text-sm">In force{gstNow?.effective_from ? ` since ${dateTime(gstNow.effective_from).slice(0, 11)}` : ''}</span>
                <span className="flex items-center gap-2"><b className="tabular">{gstNow ? `${gstNow.percent}%` : '—'}</b>
                  {allowed(can, 'admins') && <button className="btn-quiet !px-2 !py-0.5 text-2xs" onClick={() => setEdit({ kind: 'gst' })}>Change</button>}</span></div>
              <p className="mt-1 text-2xs text-muted">A new rate starts from a date; the old one is closed, never overwritten. Invoices already issued keep their GST.</p>
            </div>
          </div>
          {d.groups.map((g) => (
            <div key={g.title} className="card overflow-hidden">
              <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">{g.title}</div>
              <Table head={<tr>{['Setting', 'Value', 'Changed', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
                {g.items.map((it) => (
                  <tr key={it.key}>
                    <td className="td"><Hint note={it.note}><span className="text-ink">{it.label}</span></Hint><div className="font-mono text-2xs text-muted">{it.key}</div></td>
                    <td className="td tabular">{it.value ?? <span className="text-muted">Not set</span>}</td>
                    <td className="td text-2xs text-muted">{it.modified_at ? dateTime(it.modified_at) : '—'}</td>
                    <td className="td text-right">{it.exists && allowed(can, 'settings') && <button className="btn-quiet !px-2 !py-0.5 text-2xs" onClick={() => setEdit({ kind: 'setting', item: it })}>Change</button>}</td>
                  </tr>
                ))}
              </Table>
            </div>
          ))}
          <div className="card overflow-hidden">
            <div className="border-b border-line px-4 py-2.5 text-sm font-semibold text-ink">Change history</div>
            {!d.history.length ? <p className="px-4 py-3 text-sm text-muted">No configuration change recorded yet.</p> : (
              <Table head={<tr>{['When', 'Admin', 'What', 'Before', 'After'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {d.history.flatMap((h) => h.changes.map((c, i) => (
                  <tr key={`${h.id}-${i}`}>
                    <td className="td whitespace-nowrap text-2xs">{i === 0 ? dateTime(h.at) : ''}</td><td className="td">{i === 0 ? h.admin || '—' : ''}</td>
                    <td className="td font-mono text-2xs">{c.what}</td>
                    <td className="td text-2xs text-muted">{c.before == null ? '—' : typeof c.before === 'object' ? JSON.stringify(c.before) : String(c.before)}</td>
                    <td className="td text-2xs font-semibold">{c.after == null ? '—' : typeof c.after === 'object' ? JSON.stringify(c.after) : String(c.after)}</td>
                  </tr>
                )))}
              </Table>
            )}
          </div>
          <p className="text-2xs text-muted">{d.notes.referral} More settings are on <Link className="text-brand hover:underline" to="/settings">Prices & settings</Link>.</p>
        </div>
      )}
      {edit && <EditDialog edit={edit} onClose={() => setEdit(null)} onDone={load} />}
    </Shell>
  );
}

function EditDialog({ edit, onClose, onDone }) {
  const initial = edit.kind === 'plan' ? (edit.plan.price_paise / 100).toFixed(2) : edit.kind === 'gst' ? '' : edit.item.value ?? '';
  const [value, setValue] = useState(initial);
  const [from, setFrom] = useState(new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const title = edit.kind === 'plan' ? `Report price — ${edit.plan.name}` : edit.kind === 'gst' ? 'New GST rate' : edit.item.label;
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      if (edit.kind === 'plan') await api.savePlan(edit.plan.code, { price_paise: Math.round(Number(value) * 100) });
      else if (edit.kind === 'gst') await api.setGst(Number(value), from);
      else await api.saveSettings({ [edit.item.key]: value });
      snack('Saved — logged with before and after'); onDone(); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={title} subtitle="The change is written to the audit log with before and after" onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose} disabled={busy}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy || value === '' || String(value) === String(initial)}>Save</button></>}>
      <Field label={edit.kind === 'plan' ? 'Price in rupees, GST included' : edit.kind === 'gst' ? 'GST %' : 'Value'} hint={edit.kind === 'plan' ? `Now ${rs(edit.plan.price_paise)}. New checkouts use the new price; paid ones are unchanged.` : edit.item?.note || null}>
        <input className="input" autoFocus value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" />
      </Field>
      {edit.kind === 'plan' && value !== '' && Number(value) * 100 !== edit.plan.price_paise && Number.isFinite(Number(value)) && (
        <div className="m-drop rounded-lg border border-watch-500/40 bg-watch-50 px-3 py-2 text-sm text-watch-700" role="alert">
          <div>Current: <b>{rs(edit.plan.price_paise)}</b> → New: <b>{rs(Math.round(Number(value) * 100))}</b></div>
          <div className="text-2xs">Impact: every new checkout is charged the new price from now on. Payments already made are unchanged.</div>
        </div>
      )}
      {edit.kind === 'gst' && <Field label="From (IST date)"><input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>}
      {err && <p className="text-sm text-wrong-700">{err}</p>}
    </Modal>
  );
}
