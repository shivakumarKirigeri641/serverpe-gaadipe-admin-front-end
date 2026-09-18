import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import { rupees, count, mobile as fmtMobile, plate, dateTime, ago, daysTo, date } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Table, Hint, Chip, Modal, Empty, Spinner, Failed, Banner, openBlob, saveBlob } from '../components/ui.jsx';
import { useSession, allowed } from '../lib/session';

/**
 * Every customer, one row each, and everything about one of them on a tap.
 *
 * THE ROW IS THE PRODUCT HERE. Who they are, how much they have checked, what
 * they have paid, when they were last seen, and whether they are blocked —
 * enough to decide who is worth opening, without opening anybody. Anything
 * longer than a few characters is a hover away rather than a column.
 *
 * The detail comes back in ONE request, because a panel that fetches a person
 * and then asks eight follow-up questions makes the reader wait eight times.
 */
export default function Customers() {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('last_seen');
  const [filter, setFilter] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const params = { q, sort, limit: 100 };
      if (filter === 'paying') params.paying = 1;
      if (filter === 'blocked') params.blocked = 1;
      setData(await api.customers(params));
    } catch (e) { setError(e); }
  }, [q, sort, filter]);

  /* Typing searches, but not on every keystroke: a search per character is a
     request per character, and the table flickering under the reader's hands. */
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <Shell title="Customers"
      subtitle={data ? `${count(data.total)} in total` : ' '}
      actions={
        <div className="flex items-center gap-2">
          <input className="input !w-56 !py-1.5 text-sm" placeholder="Number, name or plate"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input !w-auto !py-1.5 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="last_seen">Last seen</option>
            <option value="joined">Newest</option>
            <option value="paid">Paid most</option>
            <option value="checks">Most checks</option>
            <option value="reports">Most reports</option>
          </select>
          <select className="input !w-auto !py-1.5 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Everyone</option>
            <option value="paying">Paying now</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      }>

      <div className="card">
        {error ? <Failed error={error} onRetry={load} />
          : !data ? <Spinner />
          : !data.rows.length ? <Empty>{q ? `Nobody matches “${q}”.` : 'No customers yet.'}</Empty>
          : (
            <Table head={
              <tr>
                <th className="th">Customer</th>
                <th className="th">Vehicles</th>
                <th className="th">Checks</th>
                <th className="th">Reports</th>
                <th className="th">Paid</th>
                <th className="th">Last seen</th>
                <th className="th">State</th>
              </tr>
            }>
              {data.rows.map((r) => (
                <tr key={r.id} className="cursor-pointer transition hover:bg-shell/70"
                  onClick={() => setOpenId(r.id)}>
                  <td className="td">
                    <div className="font-semibold text-ink">{r.name || 'Unknown'}</div>
                    <div className="tabular text-2xs text-muted">{fmtMobile(r.mobile)}</div>
                  </td>
                  <td className="td tabular">{count(r.vehicles_checked)}</td>
                  <td className="td tabular">
                    <Hint note={`${count(r.checks_made)} lookups in total across ${count(r.vehicles_checked)} vehicles. ${r.messages} WhatsApp messages exchanged.`}>
                      <span className="border-b border-dotted border-muted/40">{count(r.checks_made)}</span>
                    </Hint>
                  </td>
                  <td className="td tabular">{count(r.reports_bought)}</td>
                  <td className="td tabular">
                    {r.paid_paise ? (
                      <Hint note={`${count(r.payments_made)} payment(s). ${r.refunded_paise ? `${rupees(r.refunded_paise)} refunded. ` : ''}Last paid ${ago(r.last_paid_at)}.`}>
                        <span className="font-semibold text-ink">{rupees(r.paid_paise)}</span>
                      </Hint>
                    ) : <span className="text-muted">—</span>}
                  </td>
                  <td className="td text-2xs text-muted">
                    <Hint note={dateTime(r.last_seen_at)}>
                      <span>{ago(r.last_seen_at)}</span>
                    </Hint>
                  </td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {r.blocked && <Chip tone="wrong">Blocked</Chip>}
                      {r.is_paused && <Chip tone="watch">Paused</Chip>}
                      {r.active && <Chip tone="good">Watching</Chip>}
                      {r.is_internal && <Chip tone="brand">Internal</Chip>}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
      </div>

      {openId && <CustomerDetail id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </Shell>
  );
}

/* ------------------------------------------------------------ one person */

function CustomerDetail({ id, onClose, onChanged }) {
  const { can } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('vehicles');
  const [busy, setBusy] = useState(false);
  const [openVehicle, setOpenVehicle] = useState(null);

  const load = useCallback(async () => {
    try { setData(await api.customer(id)); } catch (e) { setError(e); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const pause = async (paused) => {
    setBusy(true);
    try { await api.pauseCustomer(id, paused); await load(); onChanged?.(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };

  const block = async () => {
    const reason = window.prompt('Why is this number being blocked? (recorded against your name)');
    if (reason === null) return;
    setBusy(true);
    try { await api.block('mobile', data.user.mobile, reason); await load(); onChanged?.(); }
    catch (e) { setError(e); } finally { setBusy(false); }
  };

  const u = data?.user;
  const TABS = [
    ['vehicles', 'Vehicles', data?.vehicles.length],
    ['payments', 'Payments', data?.payments.length],
    ['documents', 'Documents', (data?.reports.length || 0) + (data?.invoices.length || 0)],
    ['chat', 'Conversation', data?.messages.length],
    ['trail', 'Devices & consent', (data?.devices.length || 0) + (data?.consent.length || 0)],
  ];

  return (
    <Modal wide busy={busy} onClose={onClose}
      title={u ? (u.wa_profile_name || 'Unknown') : 'Customer'}
      subtitle={u ? `${fmtMobile(u.mobile)} · joined ${date(u.created_at)} · last seen ${ago(u.last_seen_at)}` : ''}
      footer={u && (
        <>
          {allowed(can, 'block') && (
            <>
              <button className="btn-quiet" disabled={busy} onClick={() => pause(!u.is_paused)}>
                {u.is_paused ? 'Resume alerts' : 'Pause alerts'}
              </button>
              {!u.blocked && (
                <button className="btn-danger" disabled={busy} onClick={block}>Block this number</button>
              )}
            </>
          )}
        </>
      )}>

      {error ? <Failed error={error} onRetry={load} />
        : !data ? <Spinner />
        : (
          <>
            {u.blocked && <Banner tone="wrong">This number is blocked. GaadiPe does not answer it and sends it nothing.</Banner>}
            {u.is_paused && <Banner tone="watch">Alerts are paused for this customer.</Banner>}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Mini label="Paid" value={rupees(data.totals.paid_paise)}
                note="Every captured payment, GST included." />
              <Mini label="Refunded" value={rupees(data.totals.refunded_paise)} />
              <Mini label="ULIP calls" value={count(data.totals.ulip_calls)}
                note="Live lookups this customer has cost us. Free today." />
              <Mini label="Vehicles" value={count(data.vehicles.length)} />
            </div>

            <div className="flex flex-wrap gap-1 border-b border-line">
              {TABS.map(([key, label, n]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                    tab === key ? 'border-brand font-semibold text-brand-deep' : 'border-transparent text-muted hover:text-body'}`}>
                  {label}{typeof n === 'number' ? ` (${n})` : ''}
                </button>
              ))}
            </div>

            {tab === 'vehicles' && (
              data.vehicles.length ? (
                <div className="space-y-2">
                  {data.vehicles.map((v) => (
                    <VehicleRow key={v.id} v={v} open={openVehicle === v.id}
                      onToggle={() => setOpenVehicle(openVehicle === v.id ? null : v.id)} />
                  ))}
                </div>
              ) : <Empty>No vehicles checked yet.</Empty>
            )}

            {tab === 'payments' && (
              data.payments.length ? (
                <Table head={<tr><th className="th">When</th><th className="th">Plan</th><th className="th">Vehicle</th><th className="th">Amount</th><th className="th">Status</th></tr>}>
                  {data.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="td text-2xs text-muted">{dateTime(p.paid_at || p.created_at)}</td>
                      <td className="td">{p.plan_name || '—'}</td>
                      <td className="td"><span className="plate">{plate(p.reg_no)}</span></td>
                      <td className="td tabular font-semibold">{rupees(p.amount_paise)}</td>
                      <td className="td">
                        <Hint note={p.payment_id ? `Razorpay ${p.payment_id}${p.order_id ? ` · order ${p.order_id}` : ''}` : 'Never completed — the link was sent but no money arrived.'}>
                          <Chip tone={p.status === 'paid' ? 'good' : p.status === 'refunded' ? 'wrong' : 'watch'}>{p.status}</Chip>
                        </Hint>
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : <Empty>No payments.</Empty>
            )}

            {tab === 'documents' && <Documents reports={data.reports} invoices={data.invoices} can={can} />}

            {tab === 'chat' && (
              data.messages.length ? (
                <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {[...data.messages].reverse().map((m, i) => (
                    <div key={i} className={`flex ${m.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                        m.direction === 'out' ? 'bg-brand/8 text-ink' : 'bg-shell text-body'}`}>
                        <div className="whitespace-pre-wrap break-words">{m.body || `[${m.message_type}]`}</div>
                        <div className="mt-1 text-2xs text-muted">
                          {dateTime(m.created_at)}
                          {m.template_name ? ` · template ${m.template_name}` : ''}
                          {m.error_message ? ` · failed: ${m.error_message}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : <Empty>No messages.</Empty>
            )}

            {tab === 'trail' && (
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Devices seen</h3>
                  {data.devices.length ? (
                    <Table head={<tr><th className="th">When</th><th className="th">Device</th><th className="th">IP</th><th className="th">Channel</th></tr>}>
                      {data.devices.map((d, i) => (
                        <tr key={i}>
                          <td className="td text-2xs text-muted">{dateTime(d.created_at)}</td>
                          <td className="td">
                            <Hint note={d.user_agent || 'No user agent recorded.'}>
                              <span className="border-b border-dotted border-muted/40">{d.device || 'Unknown device'}</span>
                            </Hint>
                          </td>
                          <td className="td tabular text-2xs">{d.ip || '—'}</td>
                          <td className="td text-2xs capitalize">{d.channel}</td>
                        </tr>
                      ))}
                    </Table>
                  ) : (
                    <p className="text-sm text-muted">
                      Nothing recorded. WhatsApp gives no device or IP — only the checkout page does,
                      so a customer who has never paid has no device trail.
                    </p>
                  )}
                </div>

                <div>
                  <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Consent</h3>
                  {data.consent.length ? (
                    <ul className="space-y-1 text-sm">
                      {data.consent.map((c, i) => (
                        <li key={i} className="text-body">
                          {dateTime(c.created_at)} — agreed as <b>{c.detail.role}</b> to{' '}
                          {(c.detail.documents || []).join(', ')}
                          <span className="text-muted"> (version {c.detail.policy_version})</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-sm text-muted">No agreement recorded.</p>}
                </div>

                {data.feedback.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Feedback</h3>
                    <ul className="space-y-2">
                      {data.feedback.map((f) => (
                        <li key={f.id} className="rounded-lg border border-line bg-shell/60 px-3 py-2 text-sm">
                          <div className="whitespace-pre-wrap">{f.body}</div>
                          <div className="mt-1 text-2xs text-muted">{dateTime(f.created_at)}{f.reg_no ? ` · ${plate(f.reg_no)}` : ''}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </>
        )}
    </Modal>
  );
}

/* A vehicle, opening into its full record — the accordion the panel is read by. */
function VehicleRow({ v, open, onToggle }) {
  const docs = [
    ['Insurance', v.insurance_upto], ['PUC', v.pucc_upto], ['Fitness', v.fitness_upto],
    ['Road tax', v.tax_upto], ['Permit', v.permit_upto],
  ].filter(([, d]) => d);

  const worst = docs
    .map(([label, d]) => ({ label, d, days: daysTo(d) }))
    .sort((a, b) => a.days - b.days)[0];

  return (
    <div className="rounded-lg border border-line">
      <button className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-shell/70"
        onClick={onToggle}>
        <div className="min-w-0">
          <span className="plate">{plate(v.reg_no)}</span>
          <span className="ml-2 text-2xs text-muted">
            {[v.maker, v.model].filter(Boolean).join(' ') || 'Unknown vehicle'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {v.blocked && <Chip tone="wrong">Blocked</Chip>}
          {v.watched && <Chip tone="good">Watched</Chip>}
          {worst && (
            <Chip tone={worst.days < 0 ? 'wrong' : worst.days <= 30 ? 'watch' : 'info'}>
              {worst.label} {worst.days < 0 ? 'expired' : `in ${worst.days}d`}
            </Chip>
          )}
          <span className="text-muted">{open ? '▴' : '▾'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-line px-3 py-3 text-sm">
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <Pair label="Class" value={v.vehicle_class} />
            <Pair label="Fuel" value={v.fuel} />
            <Pair label="RC status" value={v.rc_status} />
            <Pair label="Owner serial" value={v.owner_serial ? `${v.owner_serial}` : null} />
            <Pair label="Financer" value={v.financer || 'Not financed'} />
            <Pair label="Blacklist" value={v.blacklist_status || 'None recorded'} />
            <Pair label="Checked" value={`${count(v.check_count)} times · last ${ago(v.last_checked_at)}`} />
            <Pair label="Watched until" value={v.watched_until ? date(v.watched_until) : 'Not watched'} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {docs.map(([label, d]) => {
              const days = daysTo(d);
              return (
                <Hint key={label} note={`${label} valid until ${date(d)} — ${days < 0 ? `expired ${Math.abs(days)} days ago` : `${days} days left`}`}>
                  <Chip tone={days < 0 ? 'wrong' : days <= 30 ? 'watch' : 'good'}>
                    {label} {date(d)}
                  </Chip>
                </Hint>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Documents({ reports, invoices, can }) {
  const [busy, setBusy] = useState(null);

  const open = async (kind, id, download) => {
    setBusy(`${kind}${id}`);
    try {
      const { blob, filename } = kind === 'report'
        ? await api.reportPdf(id, download) : await api.invoicePdf(id, download);
      download ? saveBlob(blob, filename) : openBlob(blob);
    } catch (e) {
      window.alert(e.message);
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Reports</h3>
        {reports.length ? (
          <Table head={<tr><th className="th">Number</th><th className="th">Vehicle</th><th className="th">Issued</th><th className="th">Download until</th><th className="th"></th></tr>}>
            {reports.map((r) => (
              <tr key={r.id}>
                <td className="td font-mono text-2xs">{r.report_number}</td>
                <td className="td"><span className="plate">{plate(r.reg_no)}</span></td>
                <td className="td text-2xs text-muted">{dateTime(r.created_at)}</td>
                <td className="td text-2xs">
                  {r.valid_until
                    ? <Chip tone={daysTo(r.valid_until) >= 0 ? 'good' : 'info'}>{date(r.valid_until)}</Chip>
                    : <span className="text-muted">—</span>}
                </td>
                <td className="td">
                  <DocButtons disabled={!r.has_pdf} busy={busy === `report${r.id}`}
                    onView={() => open('report', r.id, false)} onSave={() => open('report', r.id, true)} />
                </td>
              </tr>
            ))}
          </Table>
        ) : <Empty>No reports.</Empty>}
      </div>

      {allowed(can, 'money') && (
        <div>
          <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Invoices</h3>
          {invoices.length ? (
            <Table head={<tr><th className="th">Number</th><th className="th">Date</th><th className="th">Taxable</th><th className="th">GST</th><th className="th">Total</th><th className="th"></th></tr>}>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="td font-mono text-2xs">{i.invoice_number}</td>
                  <td className="td text-2xs text-muted">{date(i.invoice_date)}</td>
                  <td className="td tabular">{rupees(i.base_paise, { decimals: true })}</td>
                  <td className="td tabular">
                    <Hint note={i.igst_paise ? `IGST ${rupees(i.igst_paise, { decimals: true })} — outside Karnataka` : `CGST ${rupees(i.cgst_paise, { decimals: true })} + SGST ${rupees(i.sgst_paise, { decimals: true })}`}>
                      <span className="border-b border-dotted border-muted/40">
                        {rupees(i.total_paise - i.base_paise, { decimals: true })}
                      </span>
                    </Hint>
                  </td>
                  <td className="td tabular font-semibold">{rupees(i.total_paise, { decimals: true })}</td>
                  <td className="td">
                    <DocButtons disabled={!i.has_pdf} busy={busy === `invoice${i.id}`}
                      onView={() => open('invoice', i.id, false)} onSave={() => open('invoice', i.id, true)} />
                  </td>
                </tr>
              ))}
            </Table>
          ) : <Empty>No invoices.</Empty>}
        </div>
      )}
    </div>
  );
}

const DocButtons = ({ onView, onSave, disabled, busy }) => (
  <div className="flex gap-1.5">
    <button className="btn-quiet !px-2.5 !py-1 text-2xs" disabled={disabled || busy} onClick={onView}>
      {busy ? '…' : 'View'}
    </button>
    <button className="btn-quiet !px-2.5 !py-1 text-2xs" disabled={disabled || busy} onClick={onSave}>Save</button>
  </div>
);

const Mini = ({ label, value, note }) => (
  <Hint note={note}>
    <div className="rounded-lg border border-line bg-shell/60 px-3 py-2">
      <div className="text-2xs uppercase tracking-wider text-muted">{label}</div>
      <div className="tabular text-base font-semibold text-ink">{value}</div>
    </div>
  </Hint>
);

const Pair = ({ label, value }) => (
  <div className="flex justify-between gap-3 border-b border-line/60 py-1">
    <span className="text-2xs uppercase tracking-wider text-muted">{label}</span>
    <span className="text-right text-sm text-ink">{value || '—'}</span>
  </div>
);
