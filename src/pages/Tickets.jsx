import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useSession, allowed } from '../lib/session';
import { mobile as fmtMobile, dateTime, count } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Banner, Chip, Empty, Failed, Modal, Spinner, Stat, Table } from '../components/ui.jsx';

/**
 * SUPPORT TICKETS (user, 2026-09-23).
 *
 * Every message a customer sent from the support form, with its ticket number.
 * Replying sends the answer back to the WhatsApp chat it came from, as the
 * approved template — and the reply is recorded whether or not it could be
 * delivered, because an answer that did not send is still an answer given.
 *
 * Open first, because an open ticket is the only kind that needs anybody.
 */
const TONE = { open: 'watch', replied: 'good', closed: 'info' };

export default function Tickets({ tabs }) {
  const { can } = useSession();
  const canReply = allowed(can, 'settings');
  const [status, setStatus] = useState('open');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    setError(null);
    api.tickets({ status: status || undefined, q: q || undefined }).then(setData).catch(setError);
  }, [status, q]);
  useEffect(load, [load]);

  return (
    <Shell tabs={tabs} title="Support" subtitle="What customers have written, and what we told them."
      actions={
        <>
          <select className="input !w-36 !py-1.5 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="replied">Replied</option>
            <option value="closed">Closed</option>
          </select>
          <input className="input !w-48 !py-1.5 text-sm" value={q} placeholder="Ticket, number or words"
            onChange={(e) => setQ(e.target.value)} />
        </>
      }>
      {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <Spinner /> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Open" value={count(data.totals.open)} />
            <Stat label="Replied" value={count(data.totals.replied)} />
            <Stat label="All time" value={count(data.totals.total)} />
          </div>

          <div className="card mt-4">
            <Table head={<tr>{['Ticket', 'From', 'About', 'Status', 'When', ''].map((h) =>
              <th key={h} className="th">{h}</th>)}</tr>}>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td className="td">
                    <div className="font-semibold text-ink">{r.ticket_no || '—'}</div>
                    <div className="text-2xs text-muted">{r.channel || 'web'}</div>
                  </td>
                  <td className="td">
                    <div className="text-sm text-ink">{r.name || '—'}</div>
                    <div className="text-2xs text-muted">{fmtMobile(r.mobile)}</div>
                  </td>
                  <td className="td max-w-md">
                    <div className="text-sm font-semibold text-ink">{r.subject}</div>
                    <div className="line-clamp-2 text-2xs text-muted">{r.message}</div>
                    {r.reg_no && <div className="mt-0.5 text-2xs text-body">{r.reg_no}</div>}
                  </td>
                  <td className="td"><Chip tone={TONE[r.status] || 'info'}>{r.status}</Chip></td>
                  <td className="td text-2xs text-muted">{dateTime(r.created_at)}</td>
                  <td className="td">
                    <button className="btn-quiet" onClick={() => setOpen(r)}>
                      {r.replied_at ? 'View' : 'Reply'}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
            {data.rows.length === 0 && <Empty>Nothing here.</Empty>}
          </div>
        </>
      )}

      {open && <Reply ticket={open} canReply={canReply} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />}
    </Shell>
  );
}

function Reply({ ticket, canReply, onClose, onDone }) {
  const [text, setText] = useState(ticket.reply_text || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const send = async () => {
    setBusy(true); setError(null);
    try {
      const out = await api.replyTicket(ticket.id, text);
      if (!out.ok) { setError(out.message || 'Could not send it.'); return; }
      setResult(out);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={ticket.ticket_no || 'Ticket'} subtitle={`${ticket.subject} · ${fmtMobile(ticket.mobile)}`}
      onClose={onClose} wide>
      <div className="rounded-lg border border-line bg-shell p-3 text-sm text-body whitespace-pre-wrap">
        {ticket.message}
      </div>
      {ticket.reg_no && <p className="mt-2 text-2xs text-muted">Vehicle: {ticket.reg_no}</p>}
      {ticket.email && <p className="text-2xs text-muted">Email: {ticket.email}</p>}

      {ticket.replied_at && (
        <Banner tone="good" className="mt-4">
          Replied {dateTime(ticket.replied_at)}{ticket.replied_by_name ? ` by ${ticket.replied_by_name}` : ''}.
        </Banner>
      )}

      {result ? (
        <Banner tone={result.delivered ? 'good' : 'watch'} className="mt-4">
          {result.delivered
            ? <>Sent to their WhatsApp.</>
            : <>Reply saved, but <b>not delivered</b> — {result.reason === 'whatsapp_off'
                ? 'WhatsApp is switched off' : result.reason}. It will need sending another way.</>}
          <div className="mt-3 text-right">
            <button className="btn-primary" onClick={onDone}>Done</button>
          </div>
        </Banner>
      ) : (
        <>
          <label className="mt-4 block">
            <span className="label">Your reply</span>
            <textarea className="input min-h-28" value={text} maxLength={900}
              onChange={(e) => setText(e.target.value)} disabled={!canReply}
              placeholder="Answer them plainly, in a sentence or two." />
            <span className="mt-1 block text-2xs text-muted">
              Goes to their WhatsApp as an approved template. Line breaks become “ · ”, because a template
              parameter may not contain one. {900 - text.length} characters left.
            </span>
          </label>
          {error && <Banner tone="wrong">{error}</Banner>}
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-quiet" onClick={onClose} disabled={busy}>Close</button>
            <button className="btn-primary" onClick={send} disabled={!canReply || !text.trim() || busy}>
              {busy ? 'Sending…' : 'Send reply'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
