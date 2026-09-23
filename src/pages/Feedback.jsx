import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { mobile as fmtMobile, plate, dateTime, ago } from '../lib/format';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import Shell from '../components/Shell.jsx';
import { Empty, Spinner, Failed, Hint, Pager, PAGE_SIZE, Chip } from '../components/ui.jsx';

/**
 * What people wrote to GaadiPe: the website's Contact form, and the Feedback
 * button under every check (user, 2026-09-18).
 *
 * NOT A TABLE. These are sentences from people, and a grid of truncated cells
 * is how they stop being read. Each one gets its own card, in full, newest
 * first, with who said it and how to answer them.
 */
export default function Feedback({ tabs }) {
  const [tab, setTab] = useState('contact');
  return (
    <Shell tabs={tabs} title="Messages" subtitle="The website's Contact form, and feedback from customers">
      <div className="mb-4 flex gap-1 border-b border-line">
        {[['contact', 'Contact form'], ['feedback', 'Feedback']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${tab === k ? 'border-brand text-brand-deep' : 'border-transparent text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'contact' ? <ContactMessages /> : <FeedbackList />}
    </Shell>
  );
}

const STATUS = { new: ['New', 'watch'], replied: ['Replied', 'good'], closed: ['Closed', 'info'] };

function ContactMessages() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { setPage(1); }, [status]);
  const load = useCallback(async () => {
    try { setError(null); setData(await api.contactMessages({ status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })); }
    catch (e) { setError(e); }
  }, [status, page]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const mark = async (id, s) => {
    try { await api.setContactStatus(id, s); await load(); } catch (e) { window.alert(e.message); }
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[['', 'All'], ['new', 'New'], ['replied', 'Replied'], ['closed', 'Closed']].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setStatus(k)}
            className={`rounded-lg px-3 py-1.5 text-2xs font-semibold transition ${status === k ? 'bg-brand text-white' : 'border border-line bg-white text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
        {data && <span className="text-2xs text-muted">{data.total} message{data.total === 1 ? '' : 's'}</span>}
      </div>
      {error ? <Failed error={error} onRetry={load} />
        : !data ? <Spinner />
        : !data.rows.length ? <div className="card"><Empty>No messages{status ? ' here' : ' from the Contact form yet'}.</Empty></div>
        : (
          <div className="space-y-3">
            {data.rows.map((c) => {
              const [label, tone] = STATUS[c.status] || STATUS.new;
              const mailto = c.email
                ? `mailto:${c.email}?subject=${encodeURIComponent(`Re: ${c.subject || 'Your message to GaadiPe'}`)}`
                : null;
              return (
                <div key={c.id} className={`card cv-rise p-4 ${c.status === 'new' ? 'border-l-4 border-l-watch-500' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-ink">{c.subject || 'No subject'}</div>
                      <div className="text-2xs text-muted">
                        <span className="font-semibold text-body">{c.name}</span>
                        {c.mobile && <> · <span className="tabular">{fmtMobile(c.mobile)}</span></>}
                        {c.email && <> · {c.email}</>}
                        {c.reg_no && <> · <span className="plate">{plate(c.reg_no)}</span></>}
                        {c.user_id && <> · signed-in customer</>}
                        {c.language === 'hi' && <> · Hindi</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Chip tone={tone}>{label}</Chip>
                      <Hint note={dateTime(c.created_at)}><span className="text-2xs text-muted">{ago(c.created_at)}</span></Hint>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{c.message}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {mailto && <a className="btn-primary !px-3 !py-1.5 text-2xs" href={mailto}>Reply by email</a>}
                    {c.status !== 'replied' && <button type="button" className="btn-quiet !px-3 !py-1.5 text-2xs" onClick={() => mark(c.id, 'replied')}>Mark replied</button>}
                    {c.status !== 'closed' && <button type="button" className="btn-quiet !px-3 !py-1.5 text-2xs" onClick={() => mark(c.id, 'closed')}>Close</button>}
                    {c.status !== 'new' && <button type="button" className="btn-quiet !px-3 !py-1.5 text-2xs" onClick={() => mark(c.id, 'new')}>Mark new</button>}
                    <span className="ml-auto text-2xs text-muted">
                      {c.emailed === 'sent' ? 'Emailed to you' : c.emailed === 'failed' ? 'Email failed — see System health' : 'Email pending'}
                      {c.ip ? ` · ${c.ip}` : ''}
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="card overflow-hidden"><Pager page={page} total={data.total} onPage={setPage} className="border-t-0" /></div>
          </div>
        )}
    </>
  );
}

function FeedbackList() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(() => api.feedback({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
    .then((d) => { setRows(d.rows); setTotal(d.total || 0); }).catch(setError), [page]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  return error ? <Failed error={error} />
    : !rows ? <Spinner />
    : !rows.length ? (
      <div className="card">
        <Empty>Nobody has sent feedback yet. The button appears under every basic check, so this fills up on its own.</Empty>
      </div>
    ) : (
      <div className="space-y-3">
        {rows.map((f) => (
          <div key={f.id} className="card p-4">
            <p className="whitespace-pre-wrap text-sm text-ink">{f.body}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
              <span className="font-semibold text-body">{f.name || 'Unknown'}</span>
              <span className="tabular">{fmtMobile(f.mobile)}</span>
              {f.reg_no && <span className="plate">{plate(f.reg_no)}</span>}
              <Hint note={dateTime(f.created_at)}><span>{ago(f.created_at)}</span></Hint>
            </div>
          </div>
        ))}
        <div className="card overflow-hidden"><Pager page={page} total={total} onPage={setPage} className="border-t-0" /></div>
      </div>
    );
}
