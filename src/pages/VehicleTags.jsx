import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { mobile as fmtMobile, dateTime, ago } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Chip, Empty, Failed, Field, Modal, Spinner, Stat, Table } from '../components/ui.jsx';

/**
 * GAADIPE TAG (user, 2026-10-29: "communicate between 2 vehicle owners based on vehicle numbers"). Server: src/tags.
 *   - how many tags, scans, relayed messages, replies, blocks and reports
 *   - sticker orders: the paid ones to post first — type the courier and tracking number, the owner is told
 *   - the latest relayed messages (the sender's number is never shown in full)
 * The switch is tag_enabled in Settings; while it is OFF only GaadiPe's own numbers can use tags.
 */
const STATUS = { paid: ['To post', 'watch'], dispatched: ['Posted', 'good'], created: ['Not paid', 'info'], cancelled: ['Cancelled', 'wrong'] };
const rupees = (p) => `₹${Math.round(Number(p || 0) / 100)}`;

export default function VehicleTags() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [ship, setShip] = useState(null);
  const [form, setForm] = useState({ courier: '', tracking: '' });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.tags()); } catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 60000);

  const dispatch = async () => {
    setBusy(true);
    try {
      const out = await api.tagDispatch(ship.id, form);
      setNote(out.told ? 'Marked posted — the owner has been told the tracking number.' : 'Marked posted. The owner could not be messaged just now.');
      setShip(null); setForm({ courier: '', tracking: '' }); await load();
    } catch (e) { setNote(e.message || 'Could not mark it posted.'); } finally { setBusy(false); }
  };

  const c = data?.counts || {};
  return (
    <Shell title="Vehicle tags" subtitle="GaadiPe Tag — people reach a vehicle's owner through GaadiPe; numbers stay private.">
      {error ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <div className="space-y-4">
          {!data.enabled && (
            <Banner tone="watch">
              Hidden: <b>tag_enabled</b> is OFF in Settings — only GaadiPe's own numbers can make or be reached by tags. Switch it on to launch.
            </Banner>
          )}
          {note && <Banner tone="info">{note}</Banner>}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Live tags" value={c.tags} sub={`${c.owners} owner(s)`} />
            <Stat label="Scans" value={c.scans} />
            <Stat label="Messages relayed" value={c.messages} sub={`${c.messages_today} today · ${c.answered} answered`} />
            <Stat label="Blocks / reports" value={`${c.blocks} / ${c.reports}`} tone={c.reports ? 'wrong' : 'info'} />
            <Stat label="Stickers to post" value={c.to_post} sub={`${c.posted} posted`} tone={c.to_post ? 'watch' : 'info'} />
          </div>

          <div className="card p-4">
            <h2 className="mb-2 text-sm font-bold">Sticker orders</h2>
            {!data.orders.length ? <Empty>No sticker orders yet.</Empty> : (
              <Table head={<tr className="text-left text-2xs uppercase tracking-wider text-muted">
                <th className="px-3 py-2">Order</th><th className="px-3 py-2">Vehicle</th><th className="px-3 py-2">Ship to</th>
                <th className="px-3 py-2">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Courier · tracking</th><th className="px-3 py-2" />
              </tr>}>
                {data.orders.map((o) => {
                  const [word, tone] = STATUS[o.status] || [o.status, 'info'];
                  return (
                    <tr key={o.id} className="border-b border-line/60 align-top text-sm">
                      <td className="px-3 py-2">#{o.id}<div className="text-2xs text-muted">{ago(o.paid_at || o.created_at)}</div></td>
                      <td className="px-3 py-2 font-mono">{o.reg_no}<div className="text-2xs text-muted">Tag {o.code} · {fmtMobile(o.mobile)}</div></td>
                      <td className="px-3 py-2 max-w-xs whitespace-pre-wrap">{o.ship_address || o.ship_name || '—'}<div className="text-2xs text-muted">PIN {o.pincode} · {o.zone}</div></td>
                      <td className="px-3 py-2">{rupees(o.amount_paise)} {o.test === 'true' && <Chip tone="watch">TEST</Chip>}</td>
                      <td className="px-3 py-2"><Chip tone={tone}>{word}</Chip></td>
                      <td className="px-3 py-2">{o.courier ? `${o.courier} · ${o.tracking}` : '—'}{o.dispatched_at && <div className="text-2xs text-muted">{dateTime(o.dispatched_at)}</div>}</td>
                      <td className="px-3 py-2">
                        {(o.status === 'paid' || o.status === 'dispatched') && (
                          <button type="button" className="btn-ghost text-xs" onClick={() => { setShip(o); setForm({ courier: o.courier || '', tracking: o.tracking || '' }); }}>
                            {o.status === 'paid' ? 'Mark posted' : 'Edit tracking'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </div>

          <div className="card p-4">
            <h2 className="mb-2 text-sm font-bold">Latest relayed messages</h2>
            {!data.recent.length ? <Empty>No messages yet.</Empty> : (
              <Table head={<tr className="text-left text-2xs uppercase tracking-wider text-muted">
                <th className="px-3 py-2">When</th><th className="px-3 py-2">Vehicle</th><th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">From</th><th className="px-3 py-2">Delivered by</th><th className="px-3 py-2">Replies</th>
              </tr>}>
                {data.recent.map((m) => (
                  <tr key={m.id} className="border-b border-line/60 text-sm">
                    <td className="px-3 py-2">{ago(m.created_at)}</td>
                    <td className="px-3 py-2 font-mono">{m.reg_no}<div className="text-2xs text-muted">Tag {m.code}</div></td>
                    <td className="px-3 py-2">{m.reason}</td>
                    <td className="px-3 py-2 font-mono">••{m.sender_last4}</td>
                    <td className="px-3 py-2">{m.status === 'sent' ? <Chip tone="good">{m.channel}</Chip> : <Chip tone="wrong">{m.status}</Chip>}</td>
                    <td className="px-3 py-2">{m.replies || '—'}</td>
                  </tr>
                ))}
              </Table>
            )}
          </div>
        </div>
      )}

      {ship && (
        <Modal title={`Sticker #${ship.id} — ${ship.reg_no}`} subtitle={`Ship to: ${ship.ship_address || ''} — ${ship.pincode}`}
          onClose={() => setShip(null)} busy={busy}
          footer={<button type="button" className="btn-primary" disabled={busy || !form.courier.trim() || !form.tracking.trim()} onClick={dispatch}>
            {busy ? 'Saving…' : 'Mark posted & tell the owner'}</button>}>
          <div className="space-y-3">
            <Field label="Courier"><input className="input" value={form.courier} placeholder="India Post / Delhivery / DTDC"
              onChange={(e) => setForm({ ...form, courier: e.target.value })} /></Field>
            <Field label="Tracking number"><input className="input" value={form.tracking} placeholder="e.g. EK123456789IN"
              onChange={(e) => setForm({ ...form, tracking: e.target.value })} /></Field>
          </div>
        </Modal>
      )}
    </Shell>
  );
}
