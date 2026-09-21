import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { mobile as fmtMobile, date, dateTime, count, rupees } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Chip, Empty, Failed, Modal, Spinner, Stat, Table } from '../components/ui.jsx';

/**
 * FREE REPORTS, EACH ONE (user, 2026-09-21): every report given without
 * payment — earned by a referral (a parent bought QuizPe premium through the
 * customer's link) or granted by the owner. Who, how, when, used on which
 * vehicle, and what is still waiting. Tap a customer for their whole referral
 * story: link, taps, parents and reports.
 */
const TONE = { available: 'good', used: 'brand', expired: 'info', revoked: 'wrong' };

export default function FreeReports() {
  const [state, setState] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    api.freeReports({ state: state || undefined, q: q || undefined }).then(setData).catch(setError);
  }, [state, q]);
  useEffect(load, [load]);

  const t = data?.totals;
  return (
    <Shell title="Free reports" subtitle="Every report given free — by referral or by you — one by one."
      actions={<>
        <input className="input !w-52 !py-1.5 text-sm" placeholder="Mobile, name or vehicle" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input !w-36 !py-1.5 text-sm" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All</option>{Object.keys(TONE).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </>}>
      {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Earned by referral" value={count(t.earned)} sub={`₹${Number(t.quizpe_rupees).toLocaleString('en-IN')} QuizPe premium behind them`} />
            <Stat label="Granted by admin" value={count(t.granted)} />
            <Stat label="Used · available" value={`${count(t.used)} · ${count(t.available)}`} sub={`${count(t.expired)} expired · ${count(t.revoked)} revoked`} />
            <Stat label="Not charged" value={rupees(t.value_paise)} sub="report price × reports used" />
          </div>

          <div className="card mt-4">
            {!data.rows.length ? <Empty>No free reports yet.</Empty> : (
              <Table head={<tr>{['Customer', 'How', 'Earned / granted', 'State', 'Vehicle · report', 'Use by', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {data.rows.map((r) => (
                  <tr key={`${r.source}-${r.ref}`} className="align-top">
                    <td className="td"><div className="font-semibold text-ink">{r.name || '—'}</div>
                      <div className="tabular text-2xs text-muted">{fmtMobile(r.mobile)}</div></td>
                    <td className="td text-2xs">{r.source === 'referral'
                      ? <>Referral · GP-{r.code || '—'}<div className="text-muted">parent {r.parent || '—'}{r.quizpe_amount ? ` · paid ₹${r.quizpe_amount}` : ''}</div>
                          {r.quizpe_payment && <div className="text-muted">{r.quizpe_payment}</div>}</>
                      : <>Granted by {r.admin_name || 'admin'}{r.note && <div className="max-w-[14rem] text-muted">“{r.note}”</div>}</>}</td>
                    <td className="td text-2xs text-muted">{dateTime(r.earned_at)}{r.tapped_at && <div>opened {dateTime(r.tapped_at)}</div>}</td>
                    <td className="td"><Chip tone={TONE[r.state]}>{r.state}</Chip>{r.state === 'revoked' && r.note && <div className="mt-0.5 text-2xs text-muted">{r.note}</div>}</td>
                    <td className="td text-2xs">{r.reg_no ? <><b className="tabular">{r.reg_no}</b><div className="text-muted">{r.report_number || ''}</div></> : '—'}</td>
                    <td className="td text-2xs text-muted">{r.expires_at && !r.used_at ? date(r.expires_at) : '—'}</td>
                    <td className="td"><button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => setOpen(r.user_id)}>Customer</button></td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </>
      )}
      {open && <CustomerStory userId={open} onClose={() => setOpen(null)} />}
    </Shell>
  );
}

function CustomerStory({ userId, onClose }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { api.freeReportsCustomer(userId).then(setD).catch(setError); }, [userId]);
  return (
    <Modal wide title={d ? `${d.customer.name || 'Customer'} · ${fmtMobile(d.customer.mobile)}` : 'Customer'}
      subtitle={d ? `${d.customer.email || 'no email'}${d.customer.email_verified_at ? ' (confirmed)' : ''} · QuizPe consent ${d.customer.quizpe_consent_at ? `since ${date(d.customer.quizpe_consent_at)}` : 'not given'}` : ''}
      onClose={onClose}>
      {error ? <Failed error={error} /> : !d ? <Spinner /> : (
        <div className="space-y-4">
          <div className="rounded-lg border border-line p-3 text-sm">
            {d.link ? <>Link <b className="tabular">GP-{d.link.code}</b> · {d.link.active ? <Chip tone="good">active</Chip> : <Chip tone="wrong">off{d.link.disabled_reason ? ` · ${d.link.disabled_reason}` : ''}</Chip>}
              <span className="ml-2 text-2xs text-muted">opened {count(d.link.opened)}× by others · {count(d.link.own_opens)}× by themselves · since {date(d.link.created_at)}{d.link.reset_at ? ` · reset ${date(d.link.reset_at)}` : ''}</span></>
              : <span className="text-muted">Has not joined the referral programme.</span>}
          </div>
          <div>
            <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Parents through the link</div>
            {!d.parents.length ? <Empty>None yet.</Empty> : (
              <Table head={<tr>{['Parent', 'Opened', 'Status', 'QuizPe payment'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {d.parents.map((p) => (
                  <tr key={p.id}>
                    <td className="td tabular">{p.mobile_masked}</td>
                    <td className="td text-2xs text-muted">{dateTime(p.tapped_at)}{p.status === 'pending' && <div>counts until {date(p.expires_at)}</div>}</td>
                    <td className="td"><Chip tone={{ pending: 'watch', rewarded: 'good' }[p.status] || 'info'}>{p.status}</Chip>{p.status_reason && <div className="text-2xs text-muted">{p.status_reason}</div>}</td>
                    <td className="td text-2xs">{p.quizpe_payment ? `${p.quizpe_payment} · ₹${p.quizpe_amount}` : '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
          <div>
            <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-muted">Free reports</div>
            {!d.free_reports.length ? <Empty>None.</Empty> : (
              <Table head={<tr>{['How', 'When', 'State', 'Vehicle · report'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                {d.free_reports.map((r) => (
                  <tr key={`${r.source}-${r.ref}`}>
                    <td className="td text-2xs">{r.source === 'referral' ? `Referral (${r.parent || '—'})` : `Granted by ${r.admin_name || 'admin'}`}</td>
                    <td className="td text-2xs text-muted">{dateTime(r.earned_at)}</td>
                    <td className="td"><Chip tone={TONE[r.state]}>{r.state}</Chip></td>
                    <td className="td text-2xs">{r.reg_no ? `${r.reg_no} · ${r.report_number || ''}` : '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
