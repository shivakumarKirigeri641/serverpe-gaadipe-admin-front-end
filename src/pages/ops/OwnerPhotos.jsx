import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton, Modal, CopyButton } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { ago, dateTime, plate, date } from '../../lib/format';
import { useSession, allowed } from '../../lib/session';

/**
 * VERIFY OWNERS (user, 2026-10-04; back end src/owners/photo.js).
 *
 * Customers send a photo of their RC on WhatsApp to prove a vehicle is
 * theirs. Each waits here beside the Government record; Approve or Reject
 * tells them on WhatsApp, gives the offer, and DELETES THE PHOTO — that is
 * what the customer was promised. The photo is never cached by the browser
 * and every viewing is logged.
 */
const REWARD = {
  report: ['🎁 Free full report', 'bg-good-50 text-good-700'],
  extend: ['➕ Running report extended', 'bg-brand/10 text-brand-deep'],
  none: ['🏅 Badge only', 'bg-shell text-body'],
};
const NOTICE = {
  pending: ['⏳ Will be told when they next write', 'text-watch-700'],
  template: ['📨 Told by template — details when they write', 'text-brand-deep'],
  sent: ['✓ Told on WhatsApp', 'text-good-700'],
};

const TEMPLATE_TEXT = 'Hello {{1}}, the ownership check for your vehicle {{2}} is complete: {{3}}. Tap See details below to see the result and what you get.';

export default function OwnerPhotos() {
  const { can } = useSession();
  const canAct = allowed(can, 'block');
  const canSet = allowed(can, 'settings');
  const [tab, setTab] = useState('review');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.ownerPhotos(tab === 'decided' ? 'decided' : 'review')
    .then((x) => { setD(x); setError(null); }).catch(setError), [tab]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const c = d?.counts || {};
  return (
    <Shell title="Verify owners 📸" subtitle="RC photos sent on WhatsApp — compare with the Government record, then approve or reject. The photo is deleted the moment you decide.">
      {d && d.settings?.flag_on === false && (
        <div className="mb-4 rounded-xl border border-watch-500/40 bg-watch-50 px-4 py-3 text-sm text-body">
          <b className="text-ink">Owner verification is off.</b> Customers are not offered it yet. When you are ready, switch on{' '}
          <b>Owner verification</b> in <Link to="/flags" className="font-semibold text-brand hover:underline">Feature flags</Link>.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[['Waiting for you', c.review, 'text-wrong-700'], ['Waiting for their photo', c.waiting_photo, 'text-body'],
          ['Verified', c.verified, 'text-good-700'], ['Free reports given', c.free_reports, 'text-brand-deep'], ['Rejected', c.rejected, 'text-muted']]
          .map(([label, n, tone]) => (
            <div key={label} className="card p-3">
              <div className="text-2xs text-muted">{label}</div>
              <div className={`text-xl font-bold ${tone}`}>{n ?? '—'}</div>
            </div>
          ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {[['review', `📸 Waiting${c.review ? ` (${c.review})` : ''}`], ['decided', 'Decided'], ['settings', '⚙️ Offer & settings']].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? 'border-brand text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={6} /> : tab === 'settings' ? (
        <>
          <Settings s={d.settings} counts={c} canSet={canSet} onSaved={load} />
          <CheckAlerts canSet={canSet} />
        </>
      ) : tab === 'review' ? (
        !d.rows.length ? (
          <div className="card p-8 text-center text-sm text-muted">Nothing waiting. New RC photos appear here, and you get a ping when one arrives.</div>
        ) : (
          <div className="grid gap-4">
            {d.rows.map((r) => <ReviewCard key={r.id} r={r} reasons={d.reasons} canAct={canAct} onDone={load} />)}
          </div>
        )
      ) : (
        <Decided rows={d.rows} />
      )}
    </Shell>
  );
}

/* One RC photo beside the Government record. */
function ReviewCard({ r, reasons, canAct, onDone }) {
  const [url, setUrl] = useState(null);
  const [mime, setMime] = useState(r.photo_mime);
  const [big, setBig] = useState(false);
  const [photoError, setPhotoError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    let u = null;
    api.ownerPhotoFile(r.id)
      .then(({ blob }) => { u = URL.createObjectURL(blob); setUrl(u); setMime(blob.type || r.photo_mime); })
      .catch((e) => setPhotoError(e.message));
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [r.id, r.photo_mime]);

  const decide = async (action, reason) => {
    setBusy(true);
    try {
      const out = await api.ownerPhotoAction(r.id, action, reason ? { reason } : {});
      snack(action === 'approve'
        ? `${r.reg_no} verified — ${out.told?.sent ? 'customer told on WhatsApp' : 'they will be told when they next write'}. Photo deleted.`
        : `Rejected — ${out.told?.sent ? 'customer told' : 'they will be told when they next write'}. Photo deleted.`);
      onDone();
    } catch (e) {
      snack(e.message || 'That did not work', 'wrong');
    } finally { setBusy(false); setRejecting(false); }
  };

  const rec = r.record;
  const [rl, rt] = REWARD[r.reward_if_approved] || REWARD.none;
  const isPdf = String(mime || '').includes('pdf');
  return (
    <article className="card grid gap-4 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div>
        <div className="relative overflow-hidden rounded-xl border border-line bg-shell" style={{ minHeight: 220 }}>
          {photoError ? <p className="p-6 text-center text-sm text-wrong-700">{photoError}</p>
            : !url ? <p className="p-6 text-center text-sm text-muted">Loading photo…</p>
            : isPdf ? <iframe title={`RC ${r.reg_no}`} src={url} className="h-[420px] w-full" />
            : (
              <button type="button" onClick={() => setBig(true)} className="block w-full cursor-zoom-in" title="Tap to enlarge">
                <img src={url} alt={`RC photo for ${r.reg_no}`} className="max-h-[420px] w-full object-contain" />
              </button>
            )}
        </div>
        <p className="mt-1.5 text-2xs text-muted">🔒 Not saved by your browser · viewing is logged · deleted when you decide</p>
      </div>

      <div className="flex flex-col">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="rounded bg-shell px-2 py-0.5 font-mono text-sm font-bold text-ink">{plate(r.reg_no)}</span>
          <b className="text-ink">{r.name || 'Unknown'}</b>
          <span className="tabular text-2xs text-muted">{r.masked}</span>
          {r.paid > 0 && <span className="rounded-full bg-good-50 px-2 py-0.5 text-[10px] font-semibold text-good-700">Paid ×{r.paid}</span>}
          {r.owner_of > 0 && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand-deep">Owner of {r.owner_of} already</span>}
        </div>
        <p className="mt-0.5 text-2xs text-muted">Sent {ago(r.photo_at)} · {dateTime(r.photo_at)}</p>

        <h3 className="mt-3 text-2xs font-semibold uppercase tracking-wide text-muted">Government record — compare with the photo</h3>
        {rec ? (
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-shell p-3 text-sm">
            {[['Vehicle no.', plate(r.reg_no)], ['Owner name', rec.owner_name], ['Chassis', rec.chassis], ['Engine', rec.engine],
              ['Make / model', [rec.maker, rec.model].filter(Boolean).join(' ')], ['Colour', rec.colour], ['Fuel', rec.fuel],
              ['Registered', [rec.reg_date ? date(rec.reg_date) : null, rec.registered_at].filter(Boolean).join(' · ')],
              ['Owner no.', rec.owner_serial]].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-2xs text-muted">{k}</dt>
                <dd className="break-all font-mono text-xs text-ink">{v || '—'}</dd>
              </div>
            ))}
          </dl>
        ) : <p className="mt-1 rounded-lg bg-watch-50 p-3 text-xs text-watch-700">GaadiPe has no Government record for this vehicle yet — check the photo on its own, or reject and ask them to try later.</p>}
        <p className="mt-2 text-2xs text-muted">
          Check: the vehicle number is the same · the name fits the stars (first and last letters) · the chassis starts with the characters shown.
        </p>

        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className="text-muted">Approving gives:</span>
          <span className={`rounded-full px-2 py-0.5 font-semibold ${rt}`}>{rl}</span>
        </div>

        {canAct && (
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <button type="button" disabled={busy} onClick={() => decide('approve')}
              className="rounded-lg bg-good-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
              ✅ Approve
            </button>
            <button type="button" disabled={busy} onClick={() => setRejecting(true)}
              className="rounded-lg border border-wrong-500 px-4 py-2 text-sm font-semibold text-wrong-700 hover:bg-wrong-50 disabled:opacity-50">
              ❌ Reject
            </button>
          </div>
        )}
      </div>

      {big && url && (
        <Modal title={`RC photo · ${plate(r.reg_no)}`} onClose={() => setBig(false)} wide>
          <img src={url} alt={`RC photo for ${r.reg_no}`} className="w-full" />
        </Modal>
      )}
      {rejecting && (
        <Modal title={`Reject ${plate(r.reg_no)}?`} subtitle="The customer is told this reason and can send a better photo. The photo is deleted." onClose={() => setRejecting(false)} busy={busy}>
          <div className="grid gap-2">
            {Object.entries(reasons || {}).filter(([k]) => k !== 'other').map(([k, text]) => (
              <button key={k} type="button" disabled={busy} onClick={() => decide('reject', k)}
                className="rounded-lg border border-line px-3 py-2 text-left text-sm hover:border-wrong-500 hover:bg-wrong-50">
                {text}
              </button>
            ))}
            <button type="button" disabled={busy} className="rounded-lg border border-dashed border-line px-3 py-2 text-left text-sm text-muted hover:text-ink"
              onClick={() => { const t = window.prompt('Reason the customer will see:', ''); if (t && t.trim()) decide('reject', t.trim()); }}>
              Something else…
            </button>
          </div>
        </Modal>
      )}
    </article>
  );
}

function Decided({ rows }) {
  if (!rows.length) return <div className="card p-8 text-center text-sm text-muted">No decisions yet.</div>;
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-2xs text-muted">
          <th className="px-4 py-2">Vehicle</th><th className="px-4 py-2">Customer</th><th className="px-4 py-2">Decision</th>
          <th className="px-4 py-2">They got</th><th className="px-4 py-2">Customer told</th><th className="px-4 py-2">Photo</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const [rl, rt] = REWARD[r.reward] || REWARD.none;
            const [nl, nt] = NOTICE[r.notice] || ['—', 'text-muted'];
            return (
              <tr key={r.id} className="border-b border-line/60 align-top">
                <td className="px-4 py-2 font-mono text-xs font-semibold">{plate(r.reg_no)}</td>
                <td className="px-4 py-2"><div className="text-ink">{r.name || 'Unknown'}</div><div className="tabular text-2xs text-muted">{r.masked}</div></td>
                <td className="px-4 py-2">
                  {r.status === 'verified'
                    ? <span className="rounded-full bg-good-50 px-2 py-0.5 text-[10px] font-semibold text-good-700">✅ Verified</span>
                    : <span className="rounded-full bg-wrong-50 px-2 py-0.5 text-[10px] font-semibold text-wrong-700">⛔ {r.status === 'revoked' ? 'Revoked' : 'Rejected'}</span>}
                  {r.reject_reason && <div className="mt-1 max-w-[16rem] text-2xs text-muted">{r.reject_reason}</div>}
                  <div className="mt-1 text-2xs text-muted">{dateTime(r.decided_at)}{r.reviewed_by_name ? ` · ${r.reviewed_by_name}` : ''}</div>
                </td>
                <td className="px-4 py-2">
                  {r.status === 'verified' ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${rt}`}>{rl}</span> : <span className="text-muted">—</span>}
                  {r.reward_status === 'pending' && <div className="mt-1 text-2xs text-watch-700">Not sent yet — goes when they write / records answer</div>}
                </td>
                <td className={`px-4 py-2 text-2xs ${nt}`}>{nl}</td>
                <td className="px-4 py-2 text-2xs">
                  {r.photo_deleted_at ? <span className="text-good-700">🗑️ Deleted {ago(r.photo_deleted_at)}</span> : <span className="text-wrong-700">Still stored</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Row = ({ label, hint, children }) => (
  <div className="grid gap-1 border-b border-line/60 py-3 sm:grid-cols-[16rem_1fr] sm:items-center">
    <div><div className="text-sm font-semibold text-ink">{label}</div>{hint && <div className="text-2xs text-muted">{hint}</div>}</div>
    <div>{children}</div>
  </div>
);

/* The offer and the switches — saved to app settings. */
function Settings({ s, counts, canSet, onSaved }) {
  const [f, setF] = useState(s);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setF(s); }, [s]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? String(e.target.checked) : e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const { flag_on, ...settings } = f;
      await api.saveOwnerPhotoSettings(settings);
      snack('Saved');
      onSaved();
    } catch (e) { snack(e.message || 'Could not save', 'wrong'); } finally { setBusy(false); }
  };
  const total = Number(f.owner_verify_free_reports_total || 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <h2 className="text-sm font-bold text-ink">How owners prove it</h2>
        <Row label="Method" hint="RC photo checked by you is the safe one.">
          <select className="input !w-auto" value={f.owner_verification_method} onChange={set('owner_verification_method')} disabled={!canSet}>
            <option value="photo">📸 RC photo — I approve each one</option>
            <option value="details">⌨️ Type chassis + policy number (automatic, weaker)</option>
          </select>
        </Row>
        <Row label="Photos a number may send" hint="In 24 hours — stops someone flooding you.">
          <input type="number" min="1" className="input !w-24" value={f.owner_verify_photos_per_day} onChange={set('owner_verify_photos_per_day')} disabled={!canSet} />
        </Row>
        <Row label="Feature switch" hint="Customers see the option only when this is on.">
          <span className={`font-semibold ${s.flag_on ? 'text-good-700' : 'text-watch-700'}`}>{s.flag_on ? 'On' : 'Off'}</span>{' '}
          <Link to="/flags" className="text-2xs text-brand hover:underline">change in Feature flags →</Link>
        </Row>

        <h2 className="mt-5 text-sm font-bold text-ink">The offer</h2>
        <Row label="Reward verified owners" hint="Off: they get the badge only.">
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.owner_verify_reward_on === 'true'} onChange={set('owner_verify_reward_on')} disabled={!canSet} /> On</label>
        </Row>
        <Row label="Free full reports per customer" hint="Their first verified vehicle(s). Other vehicles still get the badge.">
          <input type="number" min="0" className="input !w-24" value={f.owner_verify_free_reports_per_customer} onChange={set('owner_verify_free_reports_per_customer')} disabled={!canSet} />
        </Row>
        <Row label="Offer ends after" hint={`Free reports in all (0 = no end). Given so far: ${counts.free_reports || 0}${total ? ` of ${total}` : ''}.`}>
          <input type="number" min="0" className="input !w-24" value={f.owner_verify_free_reports_total} onChange={set('owner_verify_free_reports_total')} disabled={!canSet} />
        </Row>
        <Row label="Already have a paid report running?" hint="Days added to their report and alerts instead, free.">
          <div className="flex items-center gap-2"><input type="number" min="0" className="input !w-24" value={f.owner_verify_extend_days} onChange={set('owner_verify_extend_days')} disabled={!canSet} /><span className="text-sm text-muted">days</span></div>
        </Row>
        {canSet && <button type="button" className="btn-primary mt-4" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>}
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-ink">Telling customers when their chat is closed</h2>
        <p className="mt-1 text-xs text-body">
          Within 24 hours of their last message, the decision and the reward go straight away, free. After that, WhatsApp only allows an
          approved <b>template</b>. Until you switch one on, they are told the next time they write to GaadiPe — nothing is lost.
        </p>
        <Row label="Use the template" hint="Switch on only after Meta approves it.">
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.owner_verify_template_on === 'true'} onChange={set('owner_verify_template_on')} disabled={!canSet} /> On</label>
        </Row>
        <Row label="Template name">
          <input className="input font-mono text-sm" value={f.owner_verify_template_name} onChange={set('owner_verify_template_name')} disabled={!canSet} />
        </Row>
        <Row label="Language code">
          <input className="input !w-24 font-mono text-sm" value={f.owner_verify_template_language} onChange={set('owner_verify_template_language')} disabled={!canSet} />
        </Row>
        <div className="mt-3 rounded-lg bg-shell p-3 text-xs text-body">
          <div className="mb-1 flex items-center justify-between"><b className="text-ink">Submit this to Meta</b><CopyButton value={TEMPLATE_TEXT} /></div>
          <div>Category: <b>Utility</b> · Name: <span className="font-mono">{f.owner_verify_template_name || 'gp_owner_verification_update_v1'}</span> · Language: English</div>
          <p className="mt-2 rounded bg-white p-2 font-mono text-[11px] text-ink">{TEMPLATE_TEXT}</p>
          <div className="mt-1 text-2xs text-muted">Samples: {'{{1}}'} Ramesh · {'{{2}}'} KA01AB1234 · {'{{3}}'} approved ✅</div>
          <div className="mt-1 text-2xs text-body">Button (Quick reply): <b>See details</b></div>
        </div>
        {canSet && <button type="button" className="btn-primary mt-4" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>}
      </section>
    </div>
  );
}

/*
 * "SOMEONE CHECKED YOUR VEHICLE" (user, 2026-10-04; back end
 * src/owners/checkAlerts.js): the verified owner is told when another number
 * checks their vehicle — vehicle, time and that number's last 4 digits.
 */
const ALERT_TEMPLATE = 'Vehicle check alert: your vehicle {{1}} was checked on GaadiPe on {{2}} by a mobile number ending {{3}}. They see public vehicle details only, never your name, number or address. If you were not expecting this, you can hide your vehicle from other people\'s checks.';
const ALERT_STATUS = { sent: ['✓ Told on WhatsApp', 'text-good-700'], template: ['📨 Template', 'text-brand-deep'],
  summarised: ['✓ In a summary', 'text-good-700'], pending: ['⏳ When they next write', 'text-watch-700'] };

function CheckAlerts({ canSet }) {
  const [d, setD] = useState(null);
  const [f, setF] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.ownerCheckAlerts().then((x) => { setD(x); setF(x.settings); }).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  if (!d || !f) return null;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? String(e.target.checked) : e.target.value }));
  const save = async () => {
    setBusy(true);
    try { await api.saveOwnerCheckAlertSettings(f); snack('Saved'); load(); }
    catch (e) { snack(e.message || 'Could not save', 'wrong'); } finally { setBusy(false); }
  };
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <section className="card p-4">
        <h2 className="text-sm font-bold text-ink">🔔 Tell owners when their vehicle is checked</h2>
        <p className="mt-1 text-xs text-body">
          When another number checks a vehicle with a verified owner, the owner gets: “<i>KA31N8147 was checked on GaadiPe on 4 Oct, 4:12 pm,
          by a number ending ••••1234</i>” with a <b>Hide from others</b> button. Only the last 4 digits are shared, never more.
          The same number checking again within 24 hours is not repeated.
        </p>
        <Row label="Switch on" hint="Off: nobody is told.">
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.owner_check_alert_on === 'true'} onChange={set('owner_check_alert_on')} disabled={!canSet} /> On</label>
        </Row>
        <Row label="Only owners with a running report" hint="Recommended: the alert is part of what their report gives them.">
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.owner_check_alert_need_report === 'true'} onChange={set('owner_check_alert_need_report')} disabled={!canSet} /> Yes</label>
        </Row>
        <Row label="Tell the person checking" hint="A line on their result: the owner is told, with the last 4 digits of their number. Keeps it fair and legal.">
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.owner_check_alert_tell_checker === 'true'} onChange={set('owner_check_alert_tell_checker')} disabled={!canSet} /> Yes</label>
        </Row>
        <Row label="Never alert for checks by" hint="Your checks never alert anyone: every admin login’s mobile and the admin WhatsApp numbers are left out automatically, and the admin panel’s own checks never count. Add other test or family numbers here.">
          <input className="input font-mono text-sm" placeholder="e.g. 98xxxxxx12, 97xxxxxx34" value={f.owner_check_alert_ignore_numbers || ''} onChange={set('owner_check_alert_ignore_numbers')} disabled={!canSet} />
        </Row>
        <Row label="Most alerts per owner a day" hint="The rest go into one summary when they next write.">
          <input type="number" min="1" className="input !w-24" value={f.owner_check_alert_per_day} onChange={set('owner_check_alert_per_day')} disabled={!canSet} />
        </Row>
        <Row label="Use the template (chat closed)" hint="Switch on only after Meta approves it. Off: told in a summary when they next write.">
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={f.owner_check_alert_template_on === 'true'} onChange={set('owner_check_alert_template_on')} disabled={!canSet} /> On</label>
        </Row>
        <Row label="Template name / language">
          <div className="flex gap-2">
            <input className="input font-mono text-sm" value={f.owner_check_alert_template_name} onChange={set('owner_check_alert_template_name')} disabled={!canSet} />
            <input className="input !w-20 font-mono text-sm" value={f.owner_check_alert_template_language} onChange={set('owner_check_alert_template_language')} disabled={!canSet} />
          </div>
        </Row>
        <div className="mt-3 rounded-lg bg-shell p-3 text-xs text-body">
          <div className="mb-1 flex items-center justify-between"><b className="text-ink">Submit this to Meta</b><CopyButton value={ALERT_TEMPLATE} /></div>
          <div>Category: <b>Utility</b> · Name: <span className="font-mono">{f.owner_check_alert_template_name || 'gp_vehicle_check_alert_v1'}</span> · Language: English</div>
          <p className="mt-2 rounded bg-white p-2 font-mono text-[11px] text-ink">{ALERT_TEMPLATE}</p>
          <div className="mt-1 text-2xs text-muted">Samples: {'{{1}}'} KA01AB1234 · {'{{2}}'} 4 Oct, 4:12 pm · {'{{3}}'} 1234</div>
          <div className="mt-1 text-2xs text-body">Buttons (Quick reply), exactly: <b>Hide my vehicle</b> · <b>That’s fine</b> · <b>Stop these alerts</b></div>
        </div>
        {canSet && <button type="button" className="btn-primary mt-4" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>}
      </section>

      <section className="card p-4">
        <h2 className="text-sm font-bold text-ink">Latest check alerts</h2>
        <p className="mt-1 text-2xs text-muted">Last 24 hours: {d.totals.today} · waiting to be told: {d.totals.waiting} · all time: {d.totals.total}</p>
        {!d.rows.length ? <p className="py-6 text-center text-sm text-muted">None yet.</p> : (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="border-b border-line text-left text-2xs text-muted">
              <th className="py-1.5">Vehicle</th><th>Owner</th><th>Checked by</th><th>When</th><th>Owner told</th>
            </tr></thead>
            <tbody>
              {d.rows.map((r) => {
                const [l, t] = ALERT_STATUS[r.status] || [r.status, 'text-muted'];
                return (
                  <tr key={r.id} className="border-b border-line/60">
                    <td className="py-1.5 font-mono text-xs">{plate(r.reg_no)}</td>
                    <td className="tabular text-2xs">{r.owner}</td>
                    <td className="tabular text-2xs">••••{r.checker_last4} <span className="text-muted">({r.channel})</span></td>
                    <td className="text-2xs text-muted">{ago(r.created_at)}</td>
                    <td className={`text-2xs ${t}`}>{l}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
