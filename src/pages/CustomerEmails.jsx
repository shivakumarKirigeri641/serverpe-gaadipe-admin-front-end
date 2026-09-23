import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSession, allowed } from '../lib/session';
import { mobile as fmtMobile, dateTime, count } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Chip, Empty, Failed, Modal, Spinner, Stat, Table } from '../components/ui.jsx';

/**
 * EMAILS TO CUSTOMERS (user, 2026-09-21).
 *
 *   Switches   customer emails on/off, TEST MODE (only these addresses), and
 *              whether the panel may write to customers — the same settings as
 *              Prices & settings, here where they matter
 *   Write      one customer or a group; preview, test to yourself, then send
 *              (typed SEND). Only confirmed, subscribed addresses; every email
 *              carries the unsubscribe link; sent a few a minute
 *   Log        every email GaadiPe has sent a customer, of every kind
 */
const KIND = { confirm: 'Confirm address', purchase: 'Thank you (purchase)', daily: 'Daily update (paid)', digest: 'Every-4-days (free)', reward: 'Referral reward', announcement: 'From admin' };
const TONE = { sent: 'good', pending: 'watch', failed: 'wrong', skipped: 'info' };

export default function CustomerEmails({ tabs }) {
  const { can } = useSession();
  const canEdit = allowed(can, 'settings');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(() => {
    api.customerEmails({ kind: kind || undefined, status: status || undefined, q: q || undefined }).then(setData).catch(setError);
  }, [kind, status, q]);
  useEffect(load, [load]);

  const sent30 = (k) => (data?.totals || []).filter((t) => t.status === 'sent' && (!k || t.kind === k)).reduce((s, t) => s + t.n, 0);

  return (
    <Shell tabs={tabs} title="Customer emails" subtitle="Write to customers, and see every email GaadiPe sends them.">
      {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <>
          <Switches canEdit={canEdit} />

          <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Can be emailed" value={count(data.reach.mailable)} sub={`${count(data.reach.with_email)} gave an email`} />
            <Stat label="Unsubscribed" value={count(data.reach.unsubscribed)} />
            <Stat label="Sent, last 30 days" value={count(sent30())} sub={`${count(sent30('daily'))} daily · ${count(sent30('digest'))} free`} />
            <Stat label="From admin, 30 days" value={count(sent30('announcement'))} />
          </div>

          {canEdit && <Compose audiences={data.audiences} onQueued={load} />}

          {data.campaigns.length > 0 && (
            <div className="card mt-4">
              <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Emails you wrote</div>
              <Table head={<tr>{['Subject', 'To', 'Recipients', 'Sent', 'Waiting', 'Skipped / failed', 'When', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {data.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td className="td"><div className="font-semibold text-ink">{c.subject}</div><div className="text-2xs text-muted">by {c.admin_name || '—'}</div></td>
                    <td className="td text-2xs">{data.audiences[c.audience] || c.audience}{c.target_mobile ? ` · ${fmtMobile(c.target_mobile)}` : ''}</td>
                    <td className="td">{count(c.recipients)}</td>
                    <td className="td text-good-700">{count(c.sent)}</td>
                    <td className="td">{count(c.pending)}</td>
                    <td className="td text-2xs text-muted">{count(c.skipped)} / {count(c.failed)}</td>
                    <td className="td text-2xs text-muted">{dateTime(c.created_at)}<br /><Chip tone={c.status === 'sent' ? 'good' : c.status === 'queued' ? 'watch' : 'info'}>{c.status}</Chip></td>
                    <td className="td">{canEdit && c.status === 'queued' && c.pending > 0 && (
                      <button className="btn-quiet !px-2 !py-1 text-2xs text-wrong-700"
                        onClick={async () => { if (window.confirm('Stop sending the rest of this email?')) { await api.cancelCustomerEmail(c.id); load(); } }}>Stop</button>)}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}

          <div className="card mt-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <span className="mr-auto text-sm font-semibold text-ink">Every email to customers</span>
              <input className="input !w-48 !py-1.5 text-sm" placeholder="Email or mobile" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="input !w-44 !py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">All kinds</option>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="input !w-32 !py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Any status</option>{Object.keys(TONE).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            {!data.rows.length ? <Empty>No customer emails yet.</Empty> : (
              <Table head={<tr>{['Customer', 'Kind', 'Subject', 'Status', 'When'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {data.rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="td"><div className="text-ink">{r.name || '—'}</div><div className="tabular text-2xs text-muted">{fmtMobile(r.mobile)} · {r.to_email}</div></td>
                    <td className="td text-2xs">{KIND[r.kind] || r.kind}</td>
                    <td className="td text-2xs">{r.subject || '—'}{r.vehicles?.length ? <div className="text-muted">{r.vehicles.join(', ')}</div> : null}</td>
                    <td className="td"><Chip tone={TONE[r.status]}>{r.status}</Chip>{r.error && <div className="mt-0.5 max-w-[16rem] text-2xs text-muted">{r.error}</div>}</td>
                    <td className="td text-2xs text-muted">{dateTime(r.sent_at || r.created_at)}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}

/* The three switches that decide whether customers get email at all. */
function Switches({ canEdit }) {
  const [s, setS] = useState(null);
  const [only, setOnly] = useState('');
  const [msg, setMsg] = useState(null);
  const load = useCallback(() => {
    api.settings().then((d) => {
      const m = Object.fromEntries(d.settings.map((x) => [x.key, x.value]));
      setS(m); setOnly(m.customer_email_only_to || '');
    }).catch(() => {});
  }, []);
  useEffect(load, [load]);
  if (!s) return null;
  const on = (k) => String(s[k] ?? 'true').toLowerCase() !== 'false';
  const save = async (changes, note) => {
    setMsg(null);
    try { await api.saveSettings(changes); setMsg(note); load(); } catch (e) { setMsg(e.message); }
  };
  const testMode = Boolean(String(s.customer_email_only_to || '').trim());
  return (
    <div className="card p-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Toggle label="Customer emails" note="Confirmations, daily updates, the every-4-days email, rewards and yours."
          on={on('customer_email_enabled')} disabled={!canEdit}
          onChange={(v) => save({ customer_email_enabled: v ? 'true' : 'false' }, v ? 'Customer emails are on.' : 'Customer emails are OFF.')} />
        <Toggle label="Writing from the panel" note="Whether you can send your own emails to customers from this page."
          on={on('admin_customer_email_enabled')} disabled={!canEdit}
          onChange={(v) => save({ admin_customer_email_enabled: v ? 'true' : 'false' }, 'Saved.')} />
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">Test mode {testMode ? <Chip tone="watch">ON</Chip> : <Chip tone="good">off — live</Chip>}</div>
          <p className="mt-0.5 text-2xs text-muted">While this has addresses, customer email goes ONLY to them. Clear it to email every customer.</p>
          <div className="mt-2 flex gap-2">
            <input className="input !py-1.5 text-sm" value={only} disabled={!canEdit} onChange={(e) => setOnly(e.target.value)} placeholder="empty = every customer" />
            {canEdit && <button className="btn-quiet !py-1.5 text-2xs" onClick={() => {
              if (!only.trim() && !window.confirm('Go live? Every customer with a confirmed email will receive GaadiPe emails.')) return;
              save({ customer_email_only_to: only.trim() }, only.trim() ? 'Test mode: only these addresses.' : 'Live: every confirmed customer.');
            }}>Save</button>}
          </div>
        </div>
      </div>
      {msg && <Banner tone="info" className="mt-3">{msg}</Banner>}
    </div>
  );
}

const Toggle = ({ label, note, on, onChange, disabled }) => (
  <label className={`flex gap-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
    <input type="checkbox" className="mt-1 h-5 w-5 accent-brand" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span><span className="block text-sm font-semibold text-ink">{label} — {on ? 'on' : 'OFF'}</span>
      <span className="block text-2xs text-muted">{note}</span></span>
  </label>
);

/* Write one: audience, subject, message → preview → test → send (typed SEND). */
function Compose({ audiences, onQueued }) {
  const [audience, setAudience] = useState('one');
  const [mobile, setMobile] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const form = { audience, mobile, subject, body };
  const ready = subject.trim().length >= 3 && body.trim().length >= 10 && (audience !== 'one' || mobile.replace(/\D/g, '').length >= 10);

  const doPreview = async () => {
    setBusy(true); setMsg(null);
    try { setPreview(await api.previewCustomerEmail(form)); } catch (e) { setMsg({ tone: 'wrong', text: e.message }); } finally { setBusy(false); }
  };
  const doTest = async () => {
    setBusy(true); setMsg(null);
    try { const out = await api.testCustomerEmail(form); setMsg({ tone: 'good', text: `Test sent to ${out.to}.` }); }
    catch (e) { setMsg({ tone: 'wrong', text: e.message }); } finally { setBusy(false); }
  };

  return (
    <div className="card mt-4 p-5">
      <h2 className="text-sm font-semibold text-ink">Write to customers</h2>
      <p className="mt-0.5 text-2xs text-muted">Only confirmed, subscribed addresses receive it; every email has the unsubscribe link. Plain text: a blank line starts a paragraph, links work, {'{name}'} becomes the customer's first name.</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <label className="block text-sm text-body">To
          <select className="input mt-1" value={audience} onChange={(e) => { setAudience(e.target.value); setPreview(null); }}>
            {Object.entries(audiences).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {audience === 'one' && (
          <label className="block text-sm text-body">Customer mobile
            <input className="input mt-1" inputMode="numeric" value={mobile} onChange={(e) => { setMobile(e.target.value); setPreview(null); }} placeholder="98XXXXXXXX" />
          </label>
        )}
        <label className={`block text-sm text-body ${audience === 'one' ? '' : 'lg:col-span-2'}`}>Subject
          <input className="input mt-1" value={subject} maxLength={150} onChange={(e) => { setSubject(e.target.value); setPreview(null); }} />
        </label>
      </div>
      <label className="mt-3 block text-sm text-body">Message
        <textarea className="input mt-1 min-h-[160px]" value={body} maxLength={10000} onChange={(e) => { setBody(e.target.value); setPreview(null); }}
          placeholder={'Hi {name},\n\n…'} />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-quiet" disabled={!ready || busy} onClick={doPreview}>Preview & count</button>
        <button className="btn-quiet" disabled={!ready || busy} onClick={doTest}>Send a test to me</button>
        <button className="btn-primary" disabled={!ready || busy || !preview} onClick={() => setConfirming(true)}>Send…</button>
      </div>
      {msg && <Banner tone={msg.tone} className="mt-3">{msg.text}</Banner>}
      {preview && (
        <div className="mt-4">
          <Banner tone={preview.will_send ? 'info' : 'watch'}>
            {preview.ok === false ? preview.message : <>
              Matches <b>{count(preview.matched)}</b> customer(s); <b>{count(preview.confirmed)}</b> have a confirmed, subscribed email.
              {preview.test_mode?.length ? <> <b>Test mode is on</b> — only {preview.test_mode.join(', ')} will actually receive it ({count(preview.will_send)}).</> : <> <b>{count(preview.will_send)}</b> will receive it.</>}
            </>}
          </Banner>
          {preview.html && <iframe title="Preview" className="mt-3 h-[520px] w-full rounded-lg border border-line" srcDoc={preview.html} sandbox="" />}
        </div>
      )}
      {confirming && <ConfirmSend form={form} preview={preview} onClose={() => setConfirming(false)}
        onDone={(out) => { setConfirming(false); setPreview(null); setMsg({ tone: 'good', text: `Queued for ${out.campaign.recipients} customer(s) — sending a few a minute.` }); onQueued(); }} />}
    </div>
  );
}

function ConfirmSend({ form, preview, onClose, onDone }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const go = async () => {
    setBusy(true); setError(null);
    try { onDone(await api.sendCustomerEmail({ ...form, confirm: typed })); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Send this email?" subtitle={form.subject} onClose={onClose} busy={busy}
      footer={<><button className="btn-quiet" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || typed !== 'SEND'} onClick={go}>{busy ? 'Queuing…' : 'Send'}</button></>}>
      <Banner tone="watch">
        It goes to <b>{count(preview?.confirmed || 0)}</b> customer(s) with a confirmed email
        {preview?.test_mode?.length ? <> — but test mode is on, so only <b>{preview.test_mode.join(', ')}</b> will receive it.</> : '.'}
        {' '}It cannot be recalled once sent; you can stop what has not gone yet.
      </Banner>
      <label className="mt-3 block text-sm text-body">Type <b>SEND</b> to confirm
        <input className="input mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
      </label>
      {error && <Banner tone="wrong" className="mt-3">{error}</Banner>}
    </Modal>
  );
}
