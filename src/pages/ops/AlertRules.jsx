import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Table, Chip, Modal, Field } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { dateTime } from '../../lib/format';

/**
 * ALERT RULES (user, 2026-09-25) — what each rule watches, its thresholds
 * (kept in Settings, changed here, logged), how many of its alerts are open,
 * and a mute for a set time. Nothing is hard-coded: each threshold is a
 * setting the checker reads every minute.
 */
const SEV = { critical: 'wrong', warning: 'watch', info: 'info', success: 'good' };

export default function AlertRules() {
  const { can } = useSession();
  const may = allowed(can, 'settings.manage');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.alertRules()); } catch (e) { setError(e); } }, []);
  useEffect(() => { load(); }, [load]);
  const mute = async (rule, hours) => { try { await api.muteRule(rule.key, hours); snack(hours ? `Muted for ${hours} h` : 'Unmuted'); load(); } catch (e) { snack(e.message, 'wrong'); } };
  return (
    <Shell title="Alert rules" subtitle={d ? (d.enabled ? `${d.rows.length} rules, checked every minute` : 'Alerts are switched off in Settings') : ' '}
      actions={<Link to="/alerts" className="btn-quiet !py-1.5 text-2xs">Alert center →</Link>}>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={10} /> : (
          <Table head={<tr>{['Rule', 'Severity', 'Thresholds', 'Open', 'Muted', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
            {d.rows.map((r) => (
              <tr key={r.key}>
                <td className="td"><div className="font-semibold text-ink">{r.label}</div><div className="text-2xs text-muted">{r.about}</div></td>
                <td className="td"><Chip tone={SEV[r.severity]}>{r.severity}</Chip></td>
                <td className="td text-2xs">{!r.thresholds.length ? <span className="text-muted">Fixed rule</span> : r.thresholds.map((t) => (
                  <div key={t.key}>{t.label}: <b className="tabular">{t.value ?? '—'}</b>
                    {may && <button className="ml-1 text-brand hover:underline" onClick={() => setEdit(t)}>change</button>}</div>
                ))}</td>
                <td className="td tabular">{r.open || '—'}</td>
                <td className="td text-2xs">{r.muted_until ? `until ${dateTime(r.muted_until)}` : '—'}</td>
                <td className="td whitespace-nowrap text-right">{may && (r.muted_until
                  ? <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => mute(r, 0)}>Unmute</button>
                  : <select className="input !w-auto !py-1 text-2xs" value="" onChange={(e) => e.target.value && mute(r, Number(e.target.value))}>
                      <option value="">Mute…</option><option value="1">1 hour</option><option value="8">8 hours</option><option value="24">1 day</option><option value="168">1 week</option>
                    </select>)}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      <p className="mt-2 text-2xs text-muted">A muted rule raises nothing until the mute ends; alerts already open stay open. Referral rules are not listed — no referral programme for now.</p>
      {edit && <ThresholdDialog t={edit} onClose={() => setEdit(null)} onDone={load} />}
    </Shell>
  );
}

function ThresholdDialog({ t, onClose, onDone }) {
  const [v, setV] = useState(t.value ?? '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api.saveSettings({ [t.key]: v }); snack('Threshold saved — logged'); onDone(); onClose(); } catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
  };
  return (
    <Modal title={t.label} subtitle={t.key} onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy || v === '' || String(v) === String(t.value)}>Save</button></>}>
      <Field label="Value"><input className="input" autoFocus value={v} onChange={(e) => setV(e.target.value)} inputMode="numeric" /></Field>
    </Modal>
  );
}
