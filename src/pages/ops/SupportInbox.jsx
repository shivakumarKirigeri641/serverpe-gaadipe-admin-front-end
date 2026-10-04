import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Failed, Skeleton } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { ago, dateTime } from '../../lib/format';

/**
 * SUPPORT INBOX (user, 2026-10-04). Mail sent to support@gaadipe.in, read
 * from the mailbox every two minutes (back end: jobs/supportInbox.js) and
 * announced as it arrives. Reply from the mailbox itself; mark each one done
 * here so the badge counts only what is still waiting.
 */
export default function SupportInbox() {
  const [show, setShow] = useState('new');
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api.supportInbox({ status: show === 'all' ? undefined : show })
    .then((x) => { setD(x); setError(null); }).catch(setError), [show]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const check = async () => {
    setBusy(true);
    try { const r = await api.checkSupportInbox(); snack(r.added ? `${r.added} new email${r.added === 1 ? '' : 's'}` : 'Nothing new'); load(); }
    catch (e) { snack(e.message || 'Could not check', 'wrong'); } finally { setBusy(false); }
  };
  const done = async (r, flag) => { await api.supportInboxDone(r.id, flag).catch(() => {}); load(); };

  return (
    <Shell title="Support inbox" subtitle={d?.mailbox ? `Mail to ${d.mailbox} — checked every 2 minutes${d.checked_at ? ` · last ${ago(d.checked_at)}` : ''}` : 'Mail to the support address'}
      actions={
        <div className="flex items-center gap-2">
          <select className="input !w-auto !py-1.5 text-sm" value={show} onChange={(e) => setShow(e.target.value)}>
            <option value="new">Waiting</option><option value="done">Done</option><option value="all">All</option>
          </select>
          <button type="button" className="btn-quiet !py-1.5 text-sm" disabled={busy || !d?.configured} onClick={check}>{busy ? 'Checking…' : 'Check now'}</button>
        </div>
      }>
      {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={5} /> : !d.configured ? (
        <div className="card p-6 text-sm text-body">
          <b className="text-ink">The support mailbox is not connected yet.</b> Add these two lines to the server's <code>.env</code> and restart:
          <pre className="mt-2 rounded-lg bg-shell p-3 text-2xs">SUPPORTMAIL=support@gaadipe.in{'\n'}SUPPORTMAIL_PASSWORD=…the mailbox password…</pre>
        </div>
      ) : !d.rows.length ? (
        <div className="card p-8 text-center text-sm text-muted">{show === 'new' ? 'Nothing waiting. New support emails appear here and are announced as they arrive.' : 'No emails here.'}</div>
      ) : (
        <div className="space-y-2">
          {d.rows.map((r) => (
            <article key={r.id} className={`card p-4 ${r.status === 'done' ? 'opacity-70' : ''}`}>
              <div className="flex flex-wrap items-baseline gap-2">
                <b className="text-ink">{r.from_name || r.from_email || 'Unknown sender'}</b>
                {r.from_name && r.from_email && <span className="text-2xs text-muted">{r.from_email}</span>}
                <span className="ml-auto text-2xs text-muted" title={dateTime(r.received_at)}>{ago(r.received_at)}</span>
              </div>
              <div className="mt-1 text-sm font-semibold text-ink">{r.subject}</div>
              {r.preview && <p className="mt-1 text-2xs leading-relaxed text-body">{r.preview}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {r.from_email && <span className="select-all rounded bg-shell px-2 py-0.5 font-mono text-[10px] text-body">{r.from_email}</span>}
                <span className="text-[10px] text-muted">Reply from the mailbox ({d.mailbox}).</span>
                {r.status === 'done'
                  ? <button type="button" className="btn-quiet ml-auto !py-1 text-2xs" onClick={() => done(r, false)}>Mark waiting{r.done_by_name ? ` · done by ${r.done_by_name}` : ''}</button>
                  : <button type="button" className="btn-primary ml-auto !py-1 text-2xs" onClick={() => done(r, true)}>Mark done</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </Shell>
  );
}
