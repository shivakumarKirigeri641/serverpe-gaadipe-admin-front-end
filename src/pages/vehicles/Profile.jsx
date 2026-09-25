import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, quietly } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Chip, Hint, Failed, Skeleton, Empty, Table, Modal, Banner, openBlob, saveBlob } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { count, dateTime, ago } from '../../lib/format';
import {
  NA, show, inr, ms, day, DOC_STATE, DOC_NOTE, docWords, PAY_TONE, PAY_WORD, CHANNEL, TAG_WORD, Section, useVehicleMeta, copy, linkTo,
} from './common.jsx';
import { TagDialog, NoteDialog, ListDialog, AssignDialog, Confirm } from './actions.jsx';

/**
 * ONE VEHICLE, WHOLE (user, 2026-09-25).
 *
 * Opened by its number — any spacing, any case — at /vehicles/KA01AB1234, a
 * link that works only for a signed-in admin. Every block folds; each keeps a
 * count beside its heading so a folded profile still reads. Nothing is
 * inferred: a field the records API did not return says "Not available", a
 * vehicle never looked up says "Unknown", and "no financier on record" is
 * never written as "no loan".
 */

const STRAND = {
  website: ['Website', 'bg-brand'], whatsapp: ['WhatsApp', 'bg-good-500'], lookup: ['Lookup', 'bg-ink'],
  api: ['API', 'bg-line'], report: ['Report', 'bg-watch-500'], payment: ['Payment', 'bg-good-700'], system: ['System', 'bg-muted'],
};

export default function Profile() {
  const { reg } = useParams();
  const navigate = useNavigate();
  const { can } = useSession();
  const [meta, refreshMeta] = useVehicleMeta();
  const [p, setP] = useState(null);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);

  const load = useCallback(async () => {
    try { setError(null); setP(await api.vehicle(reg)); } catch (e) { setError(e); }
  }, [reg]);
  useEffect(() => { setP(null); load(); }, [load]);
  useAutoRefresh(load, 30000);
  const reload = () => quietly(load);

  // A deep link (#payments, #timeline) lands on its block once the data is here.
  useEffect(() => {
    if (p && window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [Boolean(p)]); // eslint-disable-line react-hooks/exhaustive-deps

  const may = (c) => allowed(can, c);
  if (error && !p) {
    return (
      <Shell title="Vehicle" subtitle={reg}>
        {error.status === 404 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-ink">GaadiPe has not seen <b className="font-mono">{reg.toUpperCase()}</b>.</p>
            <p className="mt-1 text-2xs text-muted">No lookup, report or payment names this vehicle.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link to="/vehicles" className="btn-quiet">Back to the explorer</Link>
              {may('lookup') && <Link to={`/check?reg=${encodeURIComponent(reg)}`} className="btn-primary">Check it now</Link>}
            </div>
          </div>
        ) : <div className="card"><Failed error={error} onRetry={load} /></div>}
      </Shell>
    );
  }
  if (!p) return <Shell title="Vehicle" subtitle={reg}><div className="card"><Skeleton rows={8} cols={4} /></div></Shell>;

  const v = p.vehicle;
  const ids = [v.id];
  return (
    <Shell title={`🚗 ${v.display}`} subtitle={[v.maker, v.model].filter(Boolean).join(' · ') || 'Vehicle'}
      actions={<button className="btn-quiet !py-1.5 text-2xs" onClick={() => navigate(-1)}>← Back</button>}>
      <div className="space-y-4">
        <Header p={p} may={may} open={(kind) => setDialog({ kind })} />
        <Freshness p={p} may={may} reg={v.reg_no} onDone={reload} />

        <Section id="details" title="Basic vehicle details" badge={`${p.details.filter((d) => d.value != null).length} of ${p.details.length} fields returned`}>
          <Details p={p} may={may} reg={v.reg_no} />
        </Section>

        <Section id="documents" title="Document status" badge={p.overall.expired.length ? `${p.overall.expired.length} expired` : null}>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">
            {p.documents.map((d) => <DocCard key={d.key} d={d} soon={p.soon_days} />)}
          </div>
        </Section>

        <Section id="challans" title="Challans" badge={p.challans ? `${p.challans.total} found` : 'not checked'}>
          <Challans c={p.challans} />
        </Section>

        <Section id="blacklist" title="Blacklist / NOC" badge={p.blacklist.status ? '⚠ flagged' : p.blacklist.known ? 'not flagged' : 'unknown'}>
          <Blacklist b={p.blacklist} />
        </Section>

        <Section id="loan" title="Loan / hypothecation" badge={p.loan.financier ? 'financier recorded' : p.loan.known ? 'none recorded' : 'unknown'}>
          <Loan l={p.loan} />
        </Section>

        {p.fastag && (
          <Section id="fastag" title="FASTag" badge={p.fastag.has_active_tag ? 'active tag' : 'no active tag'} open={false}>
            <Fastag f={p.fastag} />
          </Section>
        )}

        <Section id="customers" title="Customers who looked it up" badge={count(p.customers.length)}>
          <Customers p={p} may={may} reg={v.reg_no} />
        </Section>

        <Section id="whatsapp" title="WhatsApp history" badge={`${p.whatsapp.length} conversation${p.whatsapp.length === 1 ? '' : 's'}`}>
          <WhatsApp sessions={p.whatsapp} />
        </Section>

        <Section id="website" title="Website history" badge={`${p.web.visitors.length} visitor${p.web.visitors.length === 1 ? '' : 's'}`} open={p.web.visitors.length > 0 || p.web.steps.length > 0}>
          <Website w={p.web} />
        </Section>

        <Section id="payments" title="Payment history" badge={`${p.counts.paid} paid · ${inr(p.counts.paid_paise)}`}>
          <Payments rows={p.payments} />
        </Section>

        <Section id="reports" title="Report history" badge={count(p.reports.length)}>
          <Reports rows={p.reports} />
        </Section>

        {p.api && (
          <Section id="api" title="API history" badge={`${p.counts.api_calls} calls · ${p.counts.api_failed} failed`} open={false}>
            <ApiHistory rows={p.api} reg={v.reg_no} />
          </Section>
        )}

        <Section id="timeline" title="Complete event timeline" badge={`${p.timeline.length} events`}>
          <Timeline events={p.timeline} />
        </Section>

        <Section id="activity" title="When it is looked up" badge={`${p.heat.total} lookups`} open={p.heat.total > 1}>
          <Heat h={p.heat} />
        </Section>

        <Section id="notes" title="Admin notes & tags" badge={`${p.notes.filter((n) => !n.withdrawn_at).length} notes · ${p.tags.length} tags`}>
          <Notes p={p} may={may} onDone={reload} open={(kind) => setDialog({ kind })} />
        </Section>

        <Section id="audit" title="Audit history" badge={count(p.audit.length)} open={false}>
          <Audit rows={p.audit} />
        </Section>
      </div>

      {dialog?.kind === 'tag' && <TagDialog ids={ids} meta={meta} current={p.tags.map((t) => t.tag)} onClose={() => setDialog(null)} onDone={() => { reload(); refreshMeta(); }} />}
      {dialog?.kind === 'note' && <NoteDialog reg={v.reg_no} display={v.display} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog?.kind === 'list' && <ListDialog ids={ids} meta={meta} refreshMeta={refreshMeta} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog?.kind === 'assign' && <AssignDialog ids={ids} meta={meta} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog?.kind === 'archive' && (
        <Confirm title={p.admin.archived_at ? 'Restore this vehicle?' : 'Archive this vehicle?'} action={p.admin.archived_at ? 'Restore' : 'Archive'}
          onClose={() => setDialog(null)}
          onConfirm={async () => { await api.vehicleBulk('archive', { vehicle_ids: ids, archived: !p.admin.archived_at }); snack(p.admin.archived_at ? 'Restored' : 'Archived'); reload(); }}>
          {p.admin.archived_at ? 'It will show in the explorer’s everyday views again.'
            : 'It leaves the explorer’s everyday views. Nothing is deleted, and this page keeps working.'}
        </Confirm>
      )}
    </Shell>
  );
}

/* ───────────────────────────── header ── */

function StatusChip({ label, tone, note }) {
  return <Chip tone={tone} note={note}>{label}</Chip>;
}

function Header({ p, may, open }) {
  const v = p.vehicle; const o = p.overall;
  const doc = (key, label) => {
    const d = p.documents.find((x) => x.key === key);
    const [word, tone] = DOC_STATE[d.state];
    return <StatusChip label={`${label} · ${word}`} tone={tone} note={`${docWords(d)}${DOC_NOTE[d.state] ? `. ${DOC_NOTE[d.state]}` : ''}`} />;
  };
  const rcTone = !o.rc_status ? 'info' : /active/i.test(o.rc_status) && !/expired|ntbt|suspend/i.test(o.rc_status) ? 'good' : 'watch';
  /* The summary is a list of facts, each with its rule — no invented score. */
  const facts = [
    o.expired.length && `${o.expired.join(', ')} expired`,
    o.expiring.length && `${o.expiring.join(', ')} expiring within ${p.soon_days} days`,
    o.challans_pending ? `${o.challans_pending} pending challan${o.challans_pending === 1 ? '' : 's'}` : null,
    o.blacklisted && 'Blacklist / NTBT status on the RC',
    o.financier && 'A financier is recorded on the RC',
  ].filter(Boolean);
  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-2xl font-bold tracking-wide text-ink">{v.display}</div>
          <div className="mt-0.5 text-sm text-body">
            {[v.maker, v.model, v.fuel, v.vehicle_class].filter(Boolean).join(' · ') || 'Vehicle details not returned yet'}
            <span className="text-muted"> · Variant: not returned by the records API</span>
          </div>
          <div className="mt-1 text-2xs text-muted">
            {v.state} · RTO {v.rto}{v.registered_at ? ` · ${v.registered_at}` : ''}{v.age_years != null ? ` · ${v.age_years} years old` : ''}
            {' · '}First seen {dateTime(v.first_seen)} · Last updated {v.last_updated ? ago(v.last_updated) : 'never'}
            {p.admin.assigned_name ? ` · Assigned to ${p.admin.assigned_name}` : ''}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button className="btn-quiet !py-1.5 text-2xs" onClick={async () => { if (await copy(linkTo(v.reg_no))) snack('Link copied — it opens only for a signed-in admin'); }}>Copy link</button>
          {may('vehicles.notes') && <button className="btn-quiet !py-1.5 text-2xs" onClick={() => open('note')}>Add note</button>}
          {may('vehicles.tags') && <button className="btn-quiet !py-1.5 text-2xs" onClick={() => open('tag')}>Tags</button>}
          {may('vehicles.tags') && <button className="btn-quiet !py-1.5 text-2xs" onClick={() => open('list')}>Add to list</button>}
          {may('vehicles.tags') && <button className="btn-quiet !py-1.5 text-2xs" onClick={() => open('assign')}>Assign</button>}
          {may('vehicles.tags') && <button className="btn-quiet !py-1.5 text-2xs" onClick={() => open('archive')}>{p.admin.archived_at ? 'Restore' : 'Archive'}</button>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-5 py-3">
        <StatusChip label={o.rc_status ? `RC · ${o.rc_status}` : 'RC · Unknown'} tone={rcTone} note="The registration status the records API returned." />
        {doc('insurance', 'Insurance')}{doc('puc', 'PUC')}{doc('tax', 'Tax')}{doc('permit', 'Permit')}
        <StatusChip label={o.challans_pending == null ? 'Challan · Not checked' : o.challans_pending ? `Challan · ${o.challans_pending} pending` : 'Challan · None pending'}
          tone={o.challans_pending == null ? 'info' : o.challans_pending ? 'wrong' : 'good'} />
        <StatusChip label={o.blacklisted == null ? 'Blacklist · Unknown' : o.blacklisted ? 'Blacklist · Flagged' : 'Blacklist · Not flagged'}
          tone={o.blacklisted == null ? 'info' : o.blacklisted ? 'wrong' : 'good'} />
        <StatusChip label={o.financier == null ? 'Loan · Unknown' : o.financier ? 'Loan · Financier on RC' : 'Loan · None recorded'}
          tone={o.financier ? 'watch' : 'info'} note="“None recorded” means the RC names no financier — not proof that there is no loan." />
        {p.admin.archived_at && <Chip>Archived</Chip>}
        {p.tags.map((t) => <Chip key={t.tag} tone="brand">{TAG_WORD(t.tag)}</Chip>)}
      </div>
      <div className={`border-t border-line px-5 py-2.5 text-sm ${facts.length ? 'bg-watch-50/60 text-watch-700' : 'bg-shell/60 text-body'}`}>
        {facts.length ? facts.join(' · ') : 'Nothing flagged in what the records API returned.'}
        <span className="ml-2 text-2xs text-muted">
          {count(p.counts.lookups)} lookups · {count(p.counts.customers)} customers · {count(p.counts.reports)} reports · {count(p.counts.paid)} paid ({inr(p.counts.paid_paise)})
        </span>
      </div>
    </div>
  );
}

/* How old the stored data is, and a refresh that says its cost first. */
function Freshness({ p, may, reg, onDone }) {
  const f = p.freshness;
  const [confirm, setConfirm] = useState(null);
  const refresh = async (force = false) => {
    try {
      await api.vehicleRefresh(reg, { confirm: true, force });
      snack('Vehicle data refreshed'); onDone();
    } catch (e) {
      if (e.code === 'recent') { setConfirm({ recent: e.body?.minutes ?? 0 }); return; }
      throw e;
    }
  };
  const NAMES = { rc: 'Vehicle record', challan: 'Challans', fastag: 'FASTag' };
  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 text-2xs text-body">
      {f.datasets.map((d) => (
        <Hint key={d.dataset} note={d.fetched_at ? `Fetched ${dateTime(d.fetched_at)}${d.expires_at ? ` · reused until ${dateTime(d.expires_at)}` : ''}${d.source ? ` · ${d.source}` : ''}` : 'Never fetched'}>
          <span><b className="text-ink">{NAMES[d.dataset]}:</b> {d.fetched_at ? `updated ${ago(d.fetched_at)}` : 'never fetched'}{d.cached ? ' · cached' : ''}</span>
        </Hint>
      ))}
      <span><b className="text-ink">Last API lookup:</b> {f.last_lookup ? ago(f.last_lookup) : 'never'}</span>
      <span><b className="text-ink">Last success:</b> {f.last_success ? ago(f.last_success) : 'never'}</span>
      {may('vehicles.refresh') && (
        <button className="btn-quiet ml-auto !py-1 text-2xs" onClick={() => setConfirm({})}>Refresh vehicle data</button>
      )}
      {confirm && (
        <Confirm title={confirm.recent != null ? 'Looked up only minutes ago' : 'Refresh vehicle data?'} action={confirm.recent != null ? 'Refresh anyway' : 'Refresh'}
          onClose={() => setConfirm(null)} onConfirm={() => refresh(confirm.recent != null)}>
          {confirm.recent != null
            ? <>This vehicle was looked up {confirm.recent} minute(s) ago. Another lookup now spends another set of calls.</>
            : <>This makes fresh calls to the records API (vehicle record, challans and FASTag).
              {' '}Expected cost: <b>{f.refresh_cost_paise == null ? 'not known' : inr(f.refresh_cost_paise)}</b>, from what recent calls cost.
              {' '}The refresh is logged against your name.</>}
        </Confirm>
      )}
    </div>
  );
}

/* ───────────────────────────── details ── */

function Details({ p, may, reg }) {
  const [owner, setOwner] = useState(null);
  const reveal = async () => {
    try { setOwner(await api.vehicleReveal(reg, { what: 'owner' })); snack('Shown — this reveal is logged'); } catch (e) { snack(e.message, 'wrong'); }
  };
  return (
    <dl className="grid gap-x-6 gap-y-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
      {p.details.map((d) => (
        <div key={d.key} className="flex items-baseline justify-between gap-3 border-b border-line/60 pb-1.5">
          <dt className="text-2xs text-muted">{d.label}</dt>
          <dd className="text-right text-sm text-ink">
            {d.sensitive && owner ? (d.key === 'owner_name' ? show(owner.owner_name) : show(owner.address))
              : d.value == null ? NA
                : d.key.endsWith('_date') || d.key === 'reg_upto' ? day(d.value) : String(d.value)}
            {d.sensitive && !owner && may('vehicles.view_sensitive') && (
              <button className="ml-2 text-2xs text-brand hover:underline" onClick={reveal}>Reveal</button>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DocCard({ d, soon }) {
  const [word, tone] = DOC_STATE[d.state];
  const box = { good: 'border-good-500/30 bg-good-50/50', watch: 'border-watch-500/40 bg-watch-50', wrong: 'border-wrong-500/30 bg-wrong-50', info: 'border-line bg-shell/50' }[tone];
  const row = (k, x) => <div className="flex justify-between gap-2 text-2xs"><span className="text-muted">{k}</span><span className="text-right text-ink">{x == null || x === '' ? NA : x}</span></div>;
  return (
    <div className={`rounded-xl border p-3 ${box}`}>
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted">{d.label}</span>
        <Chip tone={tone} note={DOC_NOTE[d.state] || (d.state === 'soon' ? `Within ${soon} days.` : undefined)}>{word}</Chip>
      </div>
      <div className="mt-1.5 text-sm font-semibold text-ink">{docWords(d)}</div>
      <div className="mt-2 space-y-0.5">
        {d.provider !== undefined && row('Provider', d.provider)}
        {d.permit_type !== undefined && row('Permit type', d.permit_type)}
        {d.reference !== undefined && row('Policy / reference', d.reference)}
        {row('Start / issue date', d.start && day(d.start))}
        {row('Expiry date', d.upto && day(d.upto))}
        {row('Days remaining', d.days == null ? null : d.days < 0 ? `${d.days} (expired)` : String(d.days))}
        {row('Last checked', d.last_checked && dateTime(d.last_checked))}
      </div>
    </div>
  );
}

/* ───────────────────────────── challans ── */

function Challans({ c }) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ k: 'date', dir: -1 });
  const [openRow, setOpenRow] = useState(null);
  const parse = (d) => {
    const m = String(d || '').match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    return m ? new Date(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`).getTime() : new Date(d || 0).getTime() || 0;
  };
  const rows = useMemo(() => {
    const r = (c?.rows || []).filter((x) => filter === 'all' || x.group === filter);
    const val = (x) => (sort.k === 'amount' ? Number(x.amount_paise || 0) : sort.k === 'status' ? String(x.status) : parse(x.date));
    return [...r].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [c, filter, sort]);
  if (!c) return <Empty>Challans have not been checked for this vehicle — “not checked” is not “no challans”.</Empty>;
  const th = (k, l) => <th className="th cursor-pointer hover:text-ink" onClick={() => setSort((s) => ({ k, dir: s.k === k ? -s.dir : -1 }))}>{l}{sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>;
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-6">
        {[['Total challans', count(c.total)], ['Paid / disposed', count(c.paid)], ['Pending', count(c.pending)],
          ['Pending amount', inr(c.pending_amount_paise, 0)], ['Latest', show(c.newest)], ['Oldest', show(c.oldest)]].map(([l, x]) => (
          <div key={l} className="rounded-lg border border-line bg-shell/50 px-3 py-2"><div className="text-2xs text-muted">{l}</div><div className="tabular text-sm font-semibold text-ink">{x}</div></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-2 text-sm">
        <b className="text-ink">{c.total} challan{c.total === 1 ? '' : 's'} found</b>
        <span className="text-2xs text-muted">· checked {dateTime(c.checked_at)}{c.truncated ? ' · the provider returned a partial list' : ''}</span>
        <span className="ml-auto flex gap-1">
          {[['all', 'All'], ['pending', 'Pending'], ['paid', 'Paid']].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`chip border ${filter === k ? 'border-brand bg-brand text-white' : 'border-line bg-white text-body'}`}>{l}</button>
          ))}
        </span>
      </div>
      {!rows.length ? <Empty>{c.total ? 'None in this filter.' : 'No challans on record at the last check.'}</Empty> : (
        <Table head={<tr><th className="th w-6" />{th('date', 'Date')}<th className="th">Challan</th><th className="th">Location</th><th className="th">Offence</th>{th('amount', 'Amount')}{th('status', 'Status')}<th className="th">Court</th></tr>}>
          {rows.map((x, i) => (
            <Fragment key={i}>
              <tr className="cursor-pointer hover:bg-shell/60" onClick={() => setOpenRow(openRow === i ? null : i)}>
                <td className="td text-muted">{openRow === i ? '▾' : '▸'}</td>
                <td className="td whitespace-nowrap">{show(x.date)}</td>
                <td className="td font-mono text-2xs">{show(x.challan_no)}</td>
                <td className="td">{show(x.place)}</td>
                <td className="td max-w-[320px]"><span className="line-clamp-2">{show(x.offence)}</span></td>
                <td className="td tabular">{inr(x.amount_paise, 0)}</td>
                <td className="td"><Chip tone={x.group === 'pending' ? 'wrong' : 'good'}>{x.status}</Chip></td>
                <td className="td">{x.sent_to_court ? <Chip tone="watch">In court</Chip> : <span className="text-muted">—</span>}</td>
              </tr>
              {openRow === i && (
                <tr className="bg-shell/40">
                  <td />
                  <td className="td" colSpan={7}>
                    <div className="grid gap-x-6 gap-y-1 text-2xs sm:grid-cols-3">
                      {[['Department', x.department], ['RTO district', x.rto_district], ['State', x.state_name], ['Paid', x.paid_paise != null ? inr(x.paid_paise, 0) : null],
                        ['Receipt', x.receipt_no], ['Court', x.court], ['Court status', x.court_status], ['Proceeding date', x.proceeding_date], ['Remark', x.remark]]
                        .map(([k, val]) => <div key={k}><span className="text-muted">{k}: </span>{show(val)}</div>)}
                      {x.offences?.length > 1 && <div className="sm:col-span-3"><span className="text-muted">Offences: </span>{x.offences.map((o) => `${o.name}${o.act ? ` (s.${o.act})` : ''}`).join('; ')}</div>}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </Table>
      )}
      {c.full_list_url && <p className="px-4 py-2 text-2xs text-muted">The provider holds the full list; it is not fetched again from here to avoid paid calls.</p>}
    </div>
  );
}

/* ───────────────────────────── blacklist, loan, fastag ── */

function Blacklist({ b }) {
  return (
    <div className="p-4">
      {b.status ? <Banner tone="wrong" className="mb-3"><b>Flagged:</b> {b.status}</Banner>
        : b.known ? <Banner tone="good" className="mb-3">No blacklist status on the RC at the last check.</Banner>
          : <Banner className="mb-3">Unknown — the vehicle record has not been fetched.</Banner>}
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
        {[['Blacklist status', b.status || (b.known ? 'None' : null)], ['NOC', b.noc], ['NOC date', b.noc_date],
          ['Restriction', b.restriction || (b.known ? 'None stated' : null)], ['RC status', b.rc_status], ['Last checked', b.last_checked && dateTime(b.last_checked)],
          ['Provider', b.provider], ['Response status', b.response]].map(([k, x]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-line/60 pb-1"><dt className="text-2xs text-muted">{k}</dt><dd className="text-right">{show(x)}</dd></div>
        ))}
      </dl>
    </div>
  );
}

function Loan({ l }) {
  return (
    <div className="p-4">
      {!l.known ? <Banner className="mb-3">Unknown — the vehicle record has not been fetched.</Banner>
        : !l.financier ? <Banner className="mb-3">No financier information available. This is not proof that there is no loan.</Banner> : null}
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
        {[['Financier', l.financier], ['Hypothecation', l.hypothecation], ['Start date', l.start], ['End date', l.end],
          ['Status', l.financier ? 'Recorded on the RC' : null], ['Last checked', l.last_checked && dateTime(l.last_checked)]].map(([k, x]) => (
          <div key={k} className="flex justify-between gap-2 border-b border-line/60 pb-1"><dt className="text-2xs text-muted">{k}</dt><dd className="text-right">{show(x)}</dd></div>
        ))}
      </dl>
    </div>
  );
}

function Fastag({ f }) {
  const t = f.active_tag;
  return (
    <dl className="grid gap-x-6 gap-y-1.5 p-4 text-sm sm:grid-cols-3">
      {[['Active tag', f.has_active_tag ? 'Yes' : 'No'], ['Tags on record', f.tag_count], ['Bank', t?.bank_id], ['Tag status', t?.status],
        ['Issued', t?.issue_date], ['Vehicle class (tag)', t?.vehicle_class], ['Last plaza', f.last_seen_plaza], ['Last seen', f.last_seen_at],
        ['Checked', f.checked_at && dateTime(f.checked_at)]].map(([k, x]) => (
        <div key={k} className="flex justify-between gap-2 border-b border-line/60 pb-1"><dt className="text-2xs text-muted">{k}</dt><dd className="text-right">{show(x)}</dd></div>
      ))}
    </dl>
  );
}

/* ───────────────────────────── people ── */

function Customers({ p, may, reg }) {
  const [shown, setShown] = useState({});
  const navigate = useNavigate();
  const reveal = async (c) => {
    try { const r = await api.vehicleReveal(reg, { ref: c.ref }); setShown((s) => ({ ...s, [c.ref]: r.mobile })); snack('Number shown — this reveal is logged'); } catch (e) { snack(e.message, 'wrong'); }
  };
  if (!p.customers.length) return <Empty>No customer is connected with this vehicle.</Empty>;
  return (
    <Table head={<tr>{['Customer', 'Channel', 'First search', 'Last search', 'Lookups', 'Reports', 'Paid', ''].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
      {p.customers.map((c) => (
        <tr key={c.ref}>
          <td className="td font-mono">
            {shown[c.ref] ? `+91 ${String(shown[c.ref]).slice(-10, -5)} ${String(shown[c.ref]).slice(-5)}` : c.customer || '—'}
            {c.watching && <Chip tone="brand">Watching</Chip>}
          </td>
          <td className="td">{c.channels.map((x) => CHANNEL[x] || x).join(', ') || '—'}</td>
          <td className="td whitespace-nowrap">{dateTime(c.first)}</td>
          <td className="td whitespace-nowrap">{dateTime(c.last)}</td>
          <td className="td tabular">{count(c.lookups)}</td>
          <td className="td tabular">{count(c.reports)}</td>
          <td className="td tabular">{c.paid ? `${c.paid} · ${inr(c.paid_paise)}` : '—'}</td>
          <td className="td whitespace-nowrap text-right">
            {!shown[c.ref] && may('vehicles.view_sensitive') && <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => reveal(c)}>Reveal</button>}
            {c.user_id && <button className="btn-quiet ml-1 !px-2 !py-1 text-2xs" onClick={() => navigate(`/journey?user=${c.user_id}`)}>View customer</button>}
          </td>
        </tr>
      ))}
    </Table>
  );
}

/* Consecutive "message received" steps fold into one line. */
function folded(steps) {
  const out = [];
  for (const s of steps) {
    const last = out[out.length - 1];
    if (last && last.name === s.name && s.name === 'whatsapp_message_received') { last.n += 1; last.until = s.at; } else out.push({ ...s, n: 1 });
  }
  return out;
}

function WhatsApp({ sessions }) {
  if (!sessions.length) return <Empty>This vehicle was never handled on WhatsApp.</Empty>;
  const M = [['started', 'Started WhatsApp'], ['vehicle_received', 'Sent the vehicle number'], ['found', 'Vehicle found'], ['preview', 'Asked for the full report'],
    ['payment_link', 'Payment link sent'], ['paid', 'Payment successful'], ['report', 'Report generated'], ['delivered', 'Report delivered']];
  return (
    <div className="divide-y divide-line">
      {sessions.map((s, i) => (
        <details key={i} className="group px-4 py-3" open={i === 0}>
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm">
            <span className="text-muted group-open:rotate-90">›</span>
            <b className="font-mono text-ink">{s.customer}</b>
            <span className="text-2xs text-muted">{dateTime(s.started_at)} · {s.steps.length} events{s.session_id ? ` · conversation #${s.session_id}` : ''}</span>
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-1 text-2xs">
            {M.map(([k, l], j) => (
              <span key={k} className="flex items-center gap-1">
                {j > 0 && <span className="text-muted">→</span>}
                <span className={`rounded-full px-2 py-0.5 ${s.milestones[k] ? 'bg-good-50 font-semibold text-good-700' : 'bg-shell text-muted line-through'}`}>{l}</span>
              </span>
            ))}
          </div>
          <ol className="mt-2 space-y-0.5 border-l border-line pl-3">
            {folded(s.steps).map((x) => (
              <li key={x.id} className="text-2xs"><span className="tabular text-muted">{dateTime(x.at)}</span> · {x.label}{x.n > 1 ? ` ×${x.n}` : ''}
                {x.duration_ms ? <span className="text-muted"> · {ms(x.duration_ms)}</span> : null}{x.amount_paise ? ` · ${inr(x.amount_paise)}` : ''}</li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}

function Website({ w }) {
  if (!w.visitors.length && !w.steps.length) {
    return <Empty>{w.reports_on_web ? `${w.reports_on_web} report(s) were made on the website before visits were tracked.` : 'This vehicle was never looked up through the website.'}</Empty>;
  }
  return (
    <div>
      {w.visitors.length > 0 && (
        <Table head={<tr>{['Browser', 'First visit', 'Landing page', 'UTM source', 'UTM campaign', 'Pages', 'WhatsApp clicks', 'Linked to WhatsApp'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
          {w.visitors.map((x) => (
            <tr key={x.visitor}>
              <td className="td font-mono text-2xs">{x.visitor}</td><td className="td whitespace-nowrap">{dateTime(x.first_seen)}</td>
              <td className="td">{show(x.landing_page)}</td><td className="td">{show(x.utm_source)}</td><td className="td">{show(x.utm_campaign)}</td>
              <td className="td tabular">{count(x.page_views)}</td><td className="td tabular">{count(x.wa_clicks)}</td><td className="td">{x.linked_to_whatsapp ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </Table>
      )}
      {w.steps.length > 0 && (
        <ol className="space-y-0.5 px-4 py-3">
          {w.steps.map((x) => <li key={x.id} className="text-2xs"><span className="tabular text-muted">{dateTime(x.at)}</span> · {x.label}{x.page ? ` · ${x.page}` : ''}{x.source ? ` · ${x.source}` : ''}</li>)}
        </ol>
      )}
    </div>
  );
}

/* ───────────────────────────── money and reports ── */

function Payments({ rows }) {
  const [openId, setOpenId] = useState(null);
  if (!rows.length) return <Empty>No payment names this vehicle.</Empty>;
  return (
    <Table head={<tr>{['', 'Payment ID', 'Customer', 'Amount', 'GST', 'Gateway fee', 'Status', 'Method', 'When'].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
      {rows.map((x) => (
        <Fragment key={x.id}>
          <tr className="cursor-pointer hover:bg-shell/60" onClick={() => setOpenId(openId === x.id ? null : x.id)}>
            <td className="td text-muted">{openId === x.id ? '▾' : '▸'}</td>
            <td className="td font-mono text-2xs">{x.payment_id || `#${x.id}`}</td>
            <td className="td font-mono">{x.customer || '—'}</td>
            <td className="td tabular">{inr(x.amount_paise)}</td>
            <td className="td tabular">{x.gst_paise == null ? '—' : inr(x.gst_paise)}</td>
            <td className="td tabular">{x.gateway_fee_paise == null ? '—' : inr(x.gateway_fee_paise)}</td>
            <td className="td"><Chip tone={PAY_TONE[x.status] || 'info'}>{PAY_WORD[x.status] || x.status}</Chip></td>
            <td className="td">{show(x.method)}</td>
            <td className="td whitespace-nowrap">{dateTime(x.paid_at || x.created_at)}</td>
          </tr>
          {openId === x.id && (
            <tr className="bg-shell/40"><td /><td className="td" colSpan={8}>
              <div className="grid gap-x-6 gap-y-1 text-2xs sm:grid-cols-3">
                {[['Internal ID', x.id], ['Order ID', x.order_id], ['Gateway payment ID', x.payment_id], ['Gateway', x.gateway], ['Created', dateTime(x.created_at)],
                  ['Paid', x.paid_at && dateTime(x.paid_at)], ['Refunded', x.refunded_at && dateTime(x.refunded_at)], ['Refund ID', x.refund_id],
                  ['Buyer state', x.buyer_state], ['Report', x.report]].map(([k, val]) => <div key={k}><span className="text-muted">{k}: </span>{show(val)}</div>)}
                <div className="sm:col-span-3 text-muted">GST and the gateway fee are worked out on the server from the amount paid and the current rates in Settings.</div>
              </div>
            </td></tr>
          )}
        </Fragment>
      ))}
    </Table>
  );
}

function Reports({ rows }) {
  const open = async (id, download) => {
    try { const { blob, filename } = await api.reportPdf(id, download); download ? saveBlob(blob, filename) : openBlob(blob); } catch (e) { snack(e.message, 'wrong'); }
  };
  if (!rows.length) return <Empty>No report has been generated for this vehicle.</Empty>;
  return (
    <>
      <Table head={<tr>{['Report', 'Generated', 'Channel', 'Customer', 'Type', 'Payment', 'Delivery', 'Status', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="td font-mono text-2xs">{r.report_number}</td>
            <td className="td whitespace-nowrap">{dateTime(r.created_at)}</td>
            <td className="td">{CHANNEL[r.channel] || r.channel}</td>
            <td className="td font-mono">{r.customer || '—'}</td>
            <td className="td">{r.type}</td>
            <td className="td"><Chip tone={PAY_TONE[r.payment_status] || 'info'}>{PAY_WORD[r.payment_status] || r.payment_status}</Chip></td>
            <td className="td">{r.delivered}</td>
            <td className="td"><Chip tone={r.status === 'Available' ? 'good' : 'info'}>{r.status}</Chip></td>
            <td className="td whitespace-nowrap text-right">
              {r.has_file && <><button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => open(r.id, false)}>View</button>
                <button className="btn-quiet ml-1 !px-2 !py-1 text-2xs" onClick={() => open(r.id, true)}>Download</button></>}
            </td>
          </tr>
        ))}
      </Table>
      <p className="px-4 py-2 text-2xs text-muted">Reports are not regenerated from here: a report is what the customer was given at the time, and a new one would spend paid API calls.</p>
    </>
  );
}

/* ───────────────────────────── API history ── */

function ApiHistory({ rows, reg }) {
  const [openId, setOpenId] = useState(null);
  const [raw, setRaw] = useState(null);
  const view = async (dataset) => {
    try { setRaw({ dataset, ...(await api.vehicleRaw(reg, dataset)) }); } catch (e) { snack(e.message, 'wrong'); }
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-2xs text-muted">
        Stored provider response (credentials removed; viewing is logged):
        {['rc', 'challan', 'fastag'].map((d) => <button key={d} className="btn-quiet !px-2 !py-0.5 text-2xs" onClick={() => view(d)}>{d.toUpperCase()}</button>)}
      </div>
      <Table head={<tr>{['', 'When', 'Provider', 'Operation', 'Request', 'Status', 'HTTP', 'Time', 'Retries', 'Cost', 'Error'].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
        {rows.map((c) => (
          <Fragment key={c.id}>
            <tr className="cursor-pointer hover:bg-shell/60" onClick={() => setOpenId(openId === c.id ? null : c.id)}>
              <td className="td text-muted">{openId === c.id ? '▾' : '▸'}</td>
              <td className="td whitespace-nowrap">{dateTime(c.at)}</td>
              <td className="td">{show(c.provider)}</td>
              <td className="td font-mono text-2xs">{c.operation}</td>
              <td className="td font-mono text-2xs">#{c.id}</td>
              <td className="td">{c.cache_hit ? <Chip>Cached</Chip> : <Chip tone={c.ok ? 'good' : 'wrong'}>{c.ok ? 'OK' : 'Failed'}</Chip>}</td>
              <td className="td tabular">{c.http_status ?? '—'}</td>
              <td className="td tabular">{ms(c.duration_ms)}</td>
              <td className="td text-muted">Not recorded</td>
              <td className="td tabular">{inr(c.cost_paise)}</td>
              <td className="td max-w-[220px] truncate text-wrong-700">{c.error_code || ''}</td>
            </tr>
            {openId === c.id && (
              <tr className="bg-shell/40"><td /><td className="td" colSpan={10}>
                <div className="grid gap-x-6 gap-y-1 text-2xs sm:grid-cols-3">
                  {[['Dataset', c.dataset], ['Outcome', c.outcome], ['Served from cache', c.cache_hit ? 'Yes' : 'No'], ['Error code', c.error_code], ['Error', c.error]]
                    .map(([k, x]) => <div key={k}><span className="text-muted">{k}: </span>{show(x)}</div>)}
                </div>
              </td></tr>
            )}
          </Fragment>
        ))}
      </Table>
      {raw && (
        <Modal wide title={`Stored ${raw.dataset.toUpperCase()} response`} subtitle={raw.found ? `Fetched ${dateTime(raw.fetched_at)}${raw.source ? ` · ${raw.source}` : ''} · credentials removed` : 'Nothing stored'} onClose={() => setRaw(null)}>
          {raw.found ? <pre className="max-h-[60vh] overflow-auto rounded-lg bg-shell p-3 text-2xs">{JSON.stringify(raw.body, null, 2)}</pre> : <Empty>No stored response for this dataset.</Empty>}
        </Modal>
      )}
    </div>
  );
}

/* ───────────────────────────── timeline and activity ── */

function Timeline({ events }) {
  const [only, setOnly] = useState('all');
  const strands = [...new Set(events.map((e) => e.strand))];
  const list = folded(events.filter((e) => only === 'all' || e.strand === only));
  if (!events.length) return <Empty>No events recorded for this vehicle.</Empty>;
  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap gap-1">
        {['all', ...strands].map((s) => (
          <button key={s} onClick={() => setOnly(s)} className={`chip border ${only === s ? 'border-brand bg-brand text-white' : 'border-line bg-white text-body'}`}>
            {s === 'all' ? 'Everything' : STRAND[s]?.[0] || s}
          </button>
        ))}
      </div>
      <ol className="relative space-y-2 border-l border-line pl-4">
        {list.map((e) => (
          <li key={e.id} className="relative">
            <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${STRAND[e.strand]?.[1] || 'bg-muted'}`} />
            <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="tabular text-2xs text-muted">{dateTime(e.at)}</span>
              <span className="font-semibold text-ink">{e.label}{e.n > 1 ? ` ×${e.n}` : ''}</span>
              <span className="text-2xs text-muted">
                {[CHANNEL[e.channel], e.customer, e.source && `source ${e.source}`, e.campaign && `campaign ${e.campaign}`,
                  e.status, e.duration_ms != null && ms(e.duration_ms), e.amount_paise != null && inr(e.amount_paise), e.report_number].filter(Boolean).join(' · ')}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Heat({ h }) {
  const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const max = Math.max(1, ...Object.values(h.grid));
  const [by, setBy] = useState('by_day');
  const bars = h[by] || [];
  const top = Math.max(1, ...bars.map((b) => b.n));
  if (!h.total) return <Empty>No lookups recorded.</Empty>;
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-2">
      <div className="overflow-x-auto">
        <div className="mb-1 text-2xs text-muted">Hour of day (IST) × weekday</div>
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: '32px repeat(24, minmax(12px, 1fr))' }}>
          <span />{Array.from({ length: 24 }, (_, i) => <span key={i} className="text-center text-[9px] text-muted">{i % 3 ? '' : i}</span>)}
          {DAYS.map((d, di) => (
            <Fragment key={d}>
              <span className="text-[10px] text-muted">{d}</span>
              {Array.from({ length: 24 }, (_, hr) => {
                const n = h.grid[`${di + 1}:${hr}`] || 0;
                return <Hint key={`${d}${hr}`} note={`${d} ${hr}:00 — ${n} lookup${n === 1 ? '' : 's'}`}>
                  <span className="block aspect-square rounded-sm" style={{ background: n ? `rgba(15,118,110,${0.2 + 0.8 * (n / max)})` : '#f3f8f7' }} />
                </Hint>;
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-1 flex gap-1">
          {[['by_day', 'Day'], ['by_week', 'Week'], ['by_month', 'Month']].map(([k, l]) => (
            <button key={k} onClick={() => setBy(k)} className={`chip border ${by === k ? 'border-brand bg-brand text-white' : 'border-line bg-white text-body'}`}>{l}</button>
          ))}
        </div>
        <div className="space-y-1">
          {bars.slice(-20).map((b) => (
            <div key={b.key} className="flex items-center gap-2 text-2xs">
              <span className="w-20 shrink-0 tabular text-muted">{b.key}</span>
              <span className="h-3 rounded bg-brand/70" style={{ width: `${(b.n / top) * 100}%`, minWidth: 4 }} />
              <span className="tabular">{b.n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── notes, tags, audit ── */

function Notes({ p, may, onDone, open }) {
  const [editing, setEditing] = useState(null);
  const [text, setText] = useState('');
  const [versions, setVersions] = useState(null);
  const [withdraw, setWithdraw] = useState(null);
  // The author edits or withdraws a note; so does whoever manages panel users. The server checks again.
  const mine = (n) => String(n.admin_id) === String(p.viewer.admin_id) || may('admins');
  const save = async () => {
    try { await api.editVehicleNote(editing, text); snack('Note updated — the old text is kept'); setEditing(null); onDone(); } catch (e) { snack(e.message, 'wrong'); }
  };
  return (
    <div className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {p.tags.map((t) => <Chip key={t.tag} tone="brand" note={`Added by ${t.added_by || 'someone'} ${ago(t.added_at)}`}>{TAG_WORD(t.tag)}</Chip>)}
        {!p.tags.length && <span className="text-2xs text-muted">No tags.</span>}
        {may('vehicles.tags') && <button className="btn-quiet !px-2 !py-0.5 text-2xs" onClick={() => open('tag')}>Edit tags</button>}
        {p.lists.length > 0 && <span className="text-2xs text-muted">· In lists: {p.lists.map((l) => <Link key={l.id} className="text-brand hover:underline" to={`/vehicles?list=${l.id}`}>{l.name}</Link>).reduce((a, x) => [...a, a.length ? ', ' : '', x], [])}</span>}
        {may('vehicles.notes') && <button className="btn-primary ml-auto !py-1 text-2xs" onClick={() => open('note')}>Add note</button>}
      </div>
      {!p.notes.length ? <Empty>No notes yet.</Empty> : (
        <ul className="space-y-2">
          {p.notes.map((n) => (
            <li key={n.id} className={`rounded-lg border px-3 py-2 ${n.withdrawn_at ? 'border-line bg-shell/50 opacity-70' : 'border-line bg-white'}`}>
              <div className="flex flex-wrap items-center gap-2 text-2xs text-muted">
                <b className="text-ink">{n.admin || 'Someone'}</b> · {dateTime(n.created_at)}
                {n.edited_at && <button className="text-brand hover:underline" onClick={async () => setVersions(await api.vehicleNoteVersions(n.id))}>edited {ago(n.edited_at)} · {n.versions} earlier version{n.versions === 1 ? '' : 's'}</button>}
                {n.withdrawn_at && <span>· withdrawn by {n.withdrawn_by} {ago(n.withdrawn_at)}</span>}
                {!n.withdrawn_at && may('vehicles.notes') && mine(n) && editing !== n.id && (
                  <span className="ml-auto flex gap-2">
                    <button className="text-brand hover:underline" onClick={() => { setEditing(n.id); setText(n.body); }}>Edit</button>
                    <button className="text-wrong-700 hover:underline" onClick={() => setWithdraw(n)}>Withdraw</button>
                  </span>
                )}
              </div>
              {editing === n.id ? (
                <div className="mt-1.5">
                  <textarea className="input min-h-[80px]" value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} />
                  <div className="mt-1.5 flex justify-end gap-2"><button className="btn-quiet !py-1 text-2xs" onClick={() => setEditing(null)}>Cancel</button>
                    <button className="btn-primary !py-1 text-2xs" onClick={save} disabled={!text.trim()}>Save</button></div>
                </div>
              ) : <p className={`mt-1 whitespace-pre-wrap text-sm ${n.withdrawn_at ? 'line-through' : 'text-ink'}`}>{n.body}</p>}
            </li>
          ))}
        </ul>
      )}
      {versions && (
        <Modal title="Earlier versions" subtitle="The text as it was before each edit, newest first" onClose={() => setVersions(null)}>
          <ul className="space-y-2">{versions.rows.map((x) => (
            <li key={x.id} className="rounded-lg border border-line px-3 py-2"><div className="text-2xs text-muted">Replaced by {x.admin || 'someone'} · {dateTime(x.replaced_at)}</div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{x.body}</p></li>))}</ul>
        </Modal>
      )}
      {withdraw && (
        <Confirm title="Withdraw this note?" action="Withdraw" tone="danger" onClose={() => setWithdraw(null)}
          onConfirm={async () => { await api.withdrawVehicleNote(withdraw.id); snack('Note withdrawn — it stays in the history'); onDone(); }}>
          The note is struck through and kept, with your name, for the audit history. It is not deleted.
        </Confirm>
      )}
    </div>
  );
}

const ACTION = {
  view_vehicle: 'Viewed the vehicle', reveal_phone: 'Revealed a customer’s number', reveal_rc_owner: 'Revealed the RC owner',
  view_api_response: 'Viewed a stored API response', vehicle_refresh: 'Refreshed the vehicle data', admin_check: 'Checked the vehicle',
  vehicle_note_added: 'Added a note', vehicle_note_edited: 'Edited a note', vehicle_note_withdrawn: 'Withdrew a note',
  vehicle_tags_changed: 'Changed tags', vehicle_list_added: 'Added to a list', vehicle_list_removed: 'Removed from a list',
  vehicle_assigned: 'Assigned', vehicle_archived: 'Archived', vehicle_unarchived: 'Restored',
};
function Audit({ rows }) {
  if (!rows.length) return <Empty>No admin action on this vehicle yet.</Empty>;
  return (
    <Table head={<tr>{['When', 'Admin', 'Action', 'Detail'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
      {rows.map((a) => {
        const { reg_no: _reg, vehicle_id: _id, ...rest } = a.detail || {};  // the vehicle is this page
        return (
          <tr key={a.id}>
            <td className="td whitespace-nowrap">{dateTime(a.at)}</td>
            <td className="td">{a.admin || '—'}</td>
            <td className="td">{ACTION[a.action] || a.action.replace(/_/g, ' ')}</td>
            <td className="td text-2xs text-muted">{Object.entries(rest).map(([k, x]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(x) ? x.join(', ') : typeof x === 'object' && x ? JSON.stringify(x) : x}`).join(' · ') || '—'}</td>
          </tr>
        );
      })}
    </Table>
  );
}
