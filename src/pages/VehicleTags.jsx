import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { mobile as fmtMobile, dateTime, ago } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Chip, Empty, Failed, Field, Modal, Spinner, Stat, Table, saveBlob, openBlob } from '../components/ui.jsx';

/**
 * GAADIPE TAG — the admin's own section (user, 2026-10-29: "a separate section or tab, full fledged working &
 * monitoring … it must work for all users who opt, but now do for me"). Server: src/tags (tags, chat, orders, admin).
 *
 *   overview   counts, the switch, the latest messages
 *   tags       every tag; make tags for a customer (mobile + vehicle numbers); tick → print sheet (A4, 2 of each)
 *   messages   every relayed message, how it reached the owner, the owner's last reply
 *   blocks     owners' blocks and reports (lift a block)
 *   stickers   paid sticker orders to post → Mark posted (courier + tracking; the owner is told)
 *   settings   the switch, who has it before launch, limits, delivery prices, template and SMS ids
 * Before launch (tag_enabled OFF) tags work only for GaadiPe's own numbers and those on tag_allow_mobiles.
 */
const TABS = [['overview', 'Overview'], ['tags', 'Tags & print sheets'], ['messages', 'Relayed messages'],
  ['blocks', 'Blocks & reports'], ['stickers', 'Sticker orders'], ['settings', 'Settings']];
const STATUS = { paid: ['To post', 'watch'], dispatched: ['Posted', 'good'], created: ['Not paid', 'info'], cancelled: ['Cancelled', 'wrong'] };
const rupees = (p) => `₹${Math.round(Number(p || 0) / 100)}`;
const th = 'px-3 py-2';
const Head = ({ cols }) => <tr className="text-left text-2xs uppercase tracking-wider text-muted">{cols.map((c) => <th key={c} className={th}>{c}</th>)}</tr>;

export default function VehicleTags() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.tags()); } catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 60000);

  const on = data?.enabled;
  return (
    <Shell title="GaadiPe Tag" subtitle="People reach a vehicle's owner through a QR tag — both numbers stay private.">
      <div className="mb-3 flex flex-wrap gap-1">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setParams(k === 'overview' ? {} : { tab: k })}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${tab === k ? 'bg-brand text-white' : 'bg-shell text-body hover:bg-line/60'}`}>{label}</button>
        ))}
      </div>
      {data && (on
        ? <Banner tone="good" className="mb-3">🟢 Live for everyone (tag_enabled is ON).</Banner>
        : <Banner tone="watch" className="mb-3">Before launch: tags work only for GaadiPe's own numbers and <b>{data.settings?.tag_allow_mobiles || 'nobody else'}</b>. Switch on in Settings to open it to every customer.</Banner>)}
      {note && <Banner tone="info" className="mb-3">{note}</Banner>}
      {error ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        tab === 'tags' ? <TagsTab setNote={setNote} />
          : tab === 'messages' ? <MessagesTab />
          : tab === 'blocks' ? <BlocksTab setNote={setNote} />
          : tab === 'stickers' ? <StickersTab data={data} reload={load} setNote={setNote} />
          : tab === 'settings' ? <SettingsTab data={data} reload={load} setNote={setNote} />
          : <Overview data={data} />
      )}
    </Shell>
  );
}

function Overview({ data }) {
  const c = data.counts || {};
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Live tags" value={c.tags} sub={`${c.owners} owner(s)`} />
        <Stat label="Scans" value={c.scans} />
        <Stat label="Messages relayed" value={c.messages} sub={`${c.messages_today} today · ${c.answered} answered`} />
        <Stat label="Blocks / reports" value={`${c.blocks} / ${c.reports}`} tone={c.reports ? 'wrong' : 'info'} />
        <Stat label="Stickers to post" value={c.to_post} sub={`${c.posted} posted`} tone={c.to_post ? 'watch' : 'info'} />
      </div>
      <div className="card p-4">
        <h2 className="mb-2 text-sm font-bold">Latest relayed messages</h2>
        {!data.recent.length ? <Empty>No messages yet.</Empty> : (
          <Table head={<Head cols={['When', 'Vehicle', 'Reason', 'From', 'Delivered by', 'Replies']} />}>
            {data.recent.map((m) => (
              <tr key={m.id} className="border-b border-line/60 text-sm">
                <td className={th}>{ago(m.created_at)}</td>
                <td className={`${th} font-mono`}>{m.reg_no}<div className="text-2xs text-muted">Tag {m.code}</div></td>
                <td className={th}>{m.reason}</td>
                <td className={`${th} font-mono`}>••{m.sender_last4}</td>
                <td className={th}>{m.status === 'sent' ? <Chip tone="good">{m.channel}</Chip> : <Chip tone="wrong">{m.status}</Chip>}</td>
                <td className={th}>{m.replies || '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

function TagsTab({ setNote }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(new Set());
  const [copies, setCopies] = useState(2);
  const [make, setMake] = useState({ mobile: '', regs: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try { setErr(null); setRows((await api.tagsList(q)).rows); } catch (e) { setErr(e); }
  }, [q]);
  useEffect(() => { load(); }, [load]);

  const pick = (code) => setPicked((s) => { const n = new Set(s); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const sheet = async (codes) => {
    setBusy(true);
    try { const { blob, filename } = await api.tagSheet(codes, copies); saveBlob(blob, filename); openBlob(blob); }
    catch (e) { setNote(e.message); } finally { setBusy(false); }
  };
  const create = async () => {
    setBusy(true);
    try {
      const out = await api.tagCreate({ mobile: make.mobile, regs: make.regs.split(/[\s,]+/).filter(Boolean) });
      setNote(`Tags ready for ${fmtMobile(out.mobile)}: ${out.tags.map((t) => `${t.reg_no} → ${t.code}`).join(' · ')}. Download the print sheet below.`);
      setPicked(new Set(out.tags.map((t) => t.code)));
      setMake({ mobile: '', regs: '' });
      await load();
    } catch (e) { setNote(e.message); } finally { setBusy(false); }
  };
  const toggle = async (t) => {
    try { await api.tagActive(t.code, !t.is_active); await load(); } catch (e) { setNote(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <h2 className="mb-2 text-sm font-bold">Make tags for a customer</h2>
        <p className="mb-3 text-xs text-muted">Their mobile and vehicle numbers. The customer and vehicles are added if new (number only — no lookup), and before launch the mobile is put on the allow-list so it works for them now.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Mobile"><input className="input" value={make.mobile} placeholder="9886122415" onChange={(e) => setMake({ ...make, mobile: e.target.value })} /></Field>
          <Field label="Vehicle numbers"><input className="input" value={make.regs} placeholder="KA02EX1480, KA31N8147" onChange={(e) => setMake({ ...make, regs: e.target.value })} /></Field>
          <div className="flex items-end"><button type="button" className="btn-primary" disabled={busy || !make.mobile.trim() || !make.regs.trim()} onClick={create}>Make tags</button></div>
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <Field label="Search"><input className="input" value={q} placeholder="Vehicle, tag code or mobile" onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="Copies of each"><select className="input" value={copies} onChange={(e) => setCopies(Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>
          <button type="button" className="btn-primary" disabled={busy || !picked.size} onClick={() => sheet([...picked])}>
            🖨️ Print sheet ({picked.size})</button>
        </div>
        {err ? <Failed error={err} onRetry={load} /> : !rows ? <Spinner /> : !rows.length ? <Empty>No tags yet.</Empty> : (
          <Table head={<Head cols={['', 'Vehicle', 'Tag', 'Owner', 'Reachable', 'Scans', 'Messages', 'Stickers', 'Made', '']} />}>
            {rows.map((t) => (
              <tr key={t.code} className="border-b border-line/60 text-sm">
                <td className={th}><input type="checkbox" checked={picked.has(t.code)} onChange={() => pick(t.code)} /></td>
                <td className={`${th} font-mono`}>{t.reg_no}</td>
                <td className={`${th} font-mono`}>{t.code}</td>
                <td className={th}>{t.owner_name || '—'}<div className="font-mono text-2xs text-muted">{fmtMobile(t.mobile)}</div></td>
                <td className={th}>{!t.is_active ? <Chip tone="wrong">Off</Chip> : t.reachable ? <Chip tone="good">Yes</Chip> : <Chip tone="watch">After launch</Chip>}</td>
                <td className={th}>{t.scans}{t.last_scan_at && <div className="text-2xs text-muted">{ago(t.last_scan_at)}</div>}</td>
                <td className={th}>{t.messages}{t.last_message_at && <div className="text-2xs text-muted">{ago(t.last_message_at)}</div>}</td>
                <td className={th}>{t.stickers || '—'}</td>
                <td className={th}>{dateTime(t.created_at)}</td>
                <td className={`${th} whitespace-nowrap`}>
                  <button type="button" className="btn-ghost text-xs" disabled={busy} onClick={() => sheet([t.code])}>🖨️ Sheet</button>
                  <button type="button" className="btn-ghost text-xs" onClick={() => toggle(t)}>{t.is_active ? 'Switch off' : 'Switch on'}</button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </div>
  );
}

function MessagesTab() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => { try { setErr(null); setRows((await api.tagMessages()).rows); } catch (e) { setErr(e); } }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 30000);
  return (
    <div className="card p-4">
      {err ? <Failed error={err} onRetry={load} /> : !rows ? <Spinner /> : !rows.length ? <Empty>No messages yet.</Empty> : (
        <Table head={<Head cols={['When', 'Vehicle', 'Owner', 'From', 'Reason', 'Delivered by', 'Owner replied']} />}>
          {rows.map((m) => (
            <tr key={m.id} className="border-b border-line/60 align-top text-sm">
              <td className={th}>{dateTime(m.created_at)}</td>
              <td className={`${th} font-mono`}>{m.reg_no}<div className="text-2xs text-muted">Tag {m.code}</div></td>
              <td className={`${th} font-mono`}>{fmtMobile(m.owner_mobile)}</td>
              <td className={`${th} font-mono`}>••{m.sender_last4} {m.blocked && <Chip tone="wrong">blocked</Chip>}</td>
              <td className={th}>{m.reason}</td>
              <td className={th}>{m.status === 'sent' ? <Chip tone="good">{m.channel}</Chip> : <Chip tone="wrong">{m.status}</Chip>}
                {m.error && <div className="text-2xs text-muted">{m.error}</div>}</td>
              <td className={`${th} max-w-xs`}>{m.replies ? <>“{m.last_reply}”<div className="text-2xs text-muted">{m.replies} repl{m.replies === 1 ? 'y' : 'ies'} · {ago(m.last_reply_at)}</div></> : '—'}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function BlocksTab({ setNote }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const load = useCallback(async () => { try { setErr(null); setRows((await api.tagBlocks()).rows); } catch (e) { setErr(e); } }, []);
  useEffect(() => { load(); }, [load]);
  const lift = async (b) => {
    if (!window.confirm(`Lift the block on ••${b.sender_last4}? They could message ${b.owner_name || 'this owner'} again.`)) return;
    try { await api.tagUnblock(b.id); setNote('Block lifted.'); await load(); } catch (e) { setNote(e.message); }
  };
  return (
    <div className="card p-4">
      {err ? <Failed error={err} onRetry={load} /> : !rows ? <Spinner /> : !rows.length ? <Empty>No blocks or reports.</Empty> : (
        <Table head={<Head cols={['When', 'Owner', 'Their vehicles', 'Blocked sender', 'About', 'Kind', '']} />}>
          {rows.map((b) => (
            <tr key={b.id} className="border-b border-line/60 text-sm">
              <td className={th}>{dateTime(b.created_at)}</td>
              <td className={th}>{b.owner_name || '—'}<div className="font-mono text-2xs text-muted">{fmtMobile(b.owner_mobile)}</div></td>
              <td className={`${th} font-mono`}>{b.vehicles || '—'}</td>
              <td className={`${th} font-mono`}>••{b.sender_last4}</td>
              <td className={th}>{b.reason || '—'}</td>
              <td className={th}>{b.reported ? <Chip tone="wrong">Reported</Chip> : <Chip tone="info">Blocked</Chip>}</td>
              <td className={th}><button type="button" className="btn-ghost text-xs" onClick={() => lift(b)}>Lift block</button></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function StickersTab({ data, reload, setNote }) {
  const [ship, setShip] = useState(null);
  const [form, setForm] = useState({ courier: '', tracking: '' });
  const [busy, setBusy] = useState(false);
  const dispatch = async () => {
    setBusy(true);
    try {
      const out = await api.tagDispatch(ship.id, form);
      setNote(out.told ? 'Marked posted — the owner has been told the tracking number.' : 'Marked posted. The owner could not be messaged just now.');
      setShip(null); setForm({ courier: '', tracking: '' }); await reload();
    } catch (e) { setNote(e.message || 'Could not mark it posted.'); } finally { setBusy(false); }
  };
  return (
    <div className="card p-4">
      {!data.orders.length ? <Empty>No sticker orders yet.</Empty> : (
        <Table head={<Head cols={['Order', 'Vehicle', 'Ship to', 'Amount', 'Status', 'Courier · tracking', '']} />}>
          {data.orders.map((o) => {
            const [word, tone] = STATUS[o.status] || [o.status, 'info'];
            return (
              <tr key={o.id} className="border-b border-line/60 align-top text-sm">
                <td className={th}>#{o.id}<div className="text-2xs text-muted">{ago(o.paid_at || o.created_at)}</div></td>
                <td className={`${th} font-mono`}>{o.reg_no}<div className="text-2xs text-muted">Tag {o.code} · {fmtMobile(o.mobile)}</div></td>
                <td className={`${th} max-w-xs whitespace-pre-wrap`}>{o.ship_address || o.ship_name || '—'}<div className="text-2xs text-muted">PIN {o.pincode} · {o.zone}</div></td>
                <td className={th}>{rupees(o.amount_paise)} {o.test === 'true' && <Chip tone="watch">TEST</Chip>}</td>
                <td className={th}><Chip tone={tone}>{word}</Chip></td>
                <td className={th}>{o.courier ? `${o.courier} · ${o.tracking}` : '—'}{o.dispatched_at && <div className="text-2xs text-muted">{dateTime(o.dispatched_at)}</div>}</td>
                <td className={th}>{(o.status === 'paid' || o.status === 'dispatched') && (
                  <button type="button" className="btn-ghost text-xs" onClick={() => { setShip(o); setForm({ courier: o.courier || '', tracking: o.tracking || '' }); }}>
                    {o.status === 'paid' ? 'Mark posted' : 'Edit tracking'}</button>)}</td>
              </tr>
            );
          })}
        </Table>
      )}
      {ship && (
        <Modal title={`Sticker #${ship.id} — ${ship.reg_no}`} subtitle={`Ship to: ${ship.ship_address || ''} — ${ship.pincode}`}
          onClose={() => setShip(null)} busy={busy}
          footer={<button type="button" className="btn-primary" disabled={busy || !form.courier.trim() || !form.tracking.trim()} onClick={dispatch}>
            {busy ? 'Saving…' : 'Mark posted & tell the owner'}</button>}>
          <div className="space-y-3">
            <Field label="Courier"><input className="input" value={form.courier} placeholder="India Post / Delhivery / DTDC" onChange={(e) => setForm({ ...form, courier: e.target.value })} /></Field>
            <Field label="Tracking number"><input className="input" value={form.tracking} placeholder="e.g. EK123456789IN" onChange={(e) => setForm({ ...form, tracking: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </div>
  );
}

const FIELDS = [
  ['tag_enabled', 'Live for everyone (true / false)', 'OFF until launch. ON: every customer can make tags and be reached.'],
  ['tag_allow_mobiles', 'Before launch, also for these mobiles', 'Comma-separated 10-digit numbers.'],
  ['tag_limit_per_vehicle_hour', 'Messages to one vehicle per hour', ''],
  ['tag_limit_per_sender_day', 'Messages one person can send per day', ''],
  ['tag_zone_city', 'Sticker: same city (₹, incl. GST & delivery)', ''],
  ['tag_zone_state', 'Sticker: rest of the state (₹)', ''],
  ['tag_zone_india', 'Sticker: rest of India (₹)', ''],
  ['tag_zone_remote', 'Sticker: remote areas (₹)', 'North-East, J&K, Ladakh, islands.'],
  ['tag_pickup_pincode', 'Posting from pincode', ''],
  ['tag_alert_template', 'WhatsApp template: owner alert', 'Utility, approved in WhatsApp Manager.'],
  ['tag_shipped_template', 'WhatsApp template: sticker shipped', ''],
  ['sms_tpl_tag_alert', 'SMS (Fast2SMS message id): owner alert', 'Empty = no SMS.'],
  ['sms_tpl_tag_shipped', 'SMS (Fast2SMS message id): sticker shipped', ''],
];

function SettingsTab({ data, reload, setNote }) {
  const [vals, setVals] = useState(() => ({ ...data.settings }));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const changes = Object.fromEntries(Object.entries(vals).filter(([k, v]) => v !== data.settings[k] && v != null).map(([k, v]) => [k, String(v).trim()]));
    if (!Object.keys(changes).length) { setNote('Nothing changed.'); return; }
    setBusy(true);
    try { await api.saveSettings(changes); setNote('Saved — in effect within a minute.'); await reload(); }
    catch (e) { setNote(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="card space-y-3 p-4">
      {FIELDS.map(([k, label, hint]) => (
        <Field key={k} label={label} hint={hint || undefined}>
          {k === 'tag_enabled'
            ? <select className="input" value={String(vals[k] ?? 'false')} onChange={(e) => setVals({ ...vals, [k]: e.target.value })}>
                <option value="false">false — hidden (before launch)</option><option value="true">true — live for everyone</option></select>
            : <input className="input" value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />}
        </Field>
      ))}
      <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
    </div>
  );
}
