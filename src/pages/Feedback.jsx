import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { mobile as fmtMobile, plate, dateTime, ago } from '../lib/format';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import Shell from '../components/Shell.jsx';
import { snack } from '../components/Live.jsx';
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
  // Feedback first (user, 2026-09-30): ratings are what gets looked for here.
  const [tab, setTab] = useState('feedback');
  return (
    <Shell tabs={tabs} title="Messages" subtitle="The website's Contact form, and feedback from customers">
      <div className="mb-4 flex gap-1 border-b border-line">
        {[['feedback', '⭐ Feedback'], ['contact', 'Contact form']].map(([k, label]) => (
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

/*
 * SHOW ON THE WEBSITE (user, 2026-09-30). Rated feedback from the website link
 * can become a testimonial on gaadipe.in: tidy the text (spelling, anything
 * personal), choose the name shown — first name and an initial by default —
 * and approve. It appears within a couple of minutes; "Remove" takes it down.
 * WhatsApp feedback has no approve button: nobody there was told it might be
 * shown in public.
 */
const firstAndInitial = (n) => {
  const [a, b] = String(n || '').trim().split(/\s+/);
  return a ? `${a}${b ? ` ${b[0].toUpperCase()}.` : ''}` : '';
};
function Testimonial({ f, onDone }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const fromWeb = f.channel && f.channel !== 'whatsapp' && f.rating;
  if (!fromWeb) return null;
  const start = () => {
    setText(f.public_text || (/\(no message\)$/.test(f.body) ? '' : f.body));
    // No name given (user, 2026-09-30): a professional stand-in, never "Unknown".
    setName(f.public_name || firstAndInitial(f.name) || 'Verified GaadiPe customer');
    setOpen(true);
  };
  const approve = async () => {
    setBusy(true);
    try { await api.approveFeedback(f.id, { text, name }); snack('Shown on the website — live within 2 minutes'); setOpen(false); onDone(); }
    catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api.unapproveFeedback(f.id); snack('Removed from the website'); onDone(); }
    catch (e) { snack(e.message, 'wrong'); } finally { setBusy(false); }
  };

  if (f.approved_at && !open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-good-500/30 bg-good-50 px-3 py-2 text-2xs">
        <span className="font-semibold text-good-700">✅ On the website</span>
        <span className="text-body">“{f.public_text}” — {f.public_name}</span>
        <span className="ml-auto flex gap-1.5">
          <button className="btn-quiet !px-2.5 !py-1 text-2xs" disabled={busy} onClick={start}>Edit</button>
          <button className="btn-quiet !px-2.5 !py-1 text-2xs text-wrong-700" disabled={busy} onClick={remove}>Remove</button>
        </span>
      </div>
    );
  }
  if (!open) {
    return (
      <button className="btn-quiet mt-3 !px-3 !py-1.5 text-2xs" onClick={start}>✅ Show on website</button>
    );
  }
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-brand/25 bg-brand/5 p-3">
      <div className="text-2xs font-semibold uppercase tracking-wider text-brand-deep">How it will appear on gaadipe.in</div>
      <textarea className="input min-h-[80px] w-full text-sm" maxLength={600} value={text} onChange={(e) => setText(e.target.value)}
        placeholder="The words to show. Fix spelling; remove anything personal." />
      <div className="flex flex-wrap items-center gap-2">
        <input className="input !w-48 text-sm" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name shown" />
        <span className="text-sm" style={{ color: '#f5a623' }}>{'★'.repeat(f.rating)}<span style={{ color: '#d7dfdd' }}>{'★'.repeat(5 - f.rating)}</span></span>
        <span className="ml-auto flex gap-1.5">
          <button className="btn-quiet !px-3 !py-1.5 text-2xs" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn-primary !px-3 !py-1.5 text-2xs" disabled={busy || text.trim().length < 5 || !name.trim()} onClick={approve}>
            {f.approved_at ? 'Save' : 'Approve & show'}
          </button>
        </span>
      </div>
    </div>
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
            {/* Star rating from the website feedback link (user, 2026-09-30). */}
            {f.rating ? (
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-lg leading-none" style={{ color: '#f5a623' }} aria-label={`${f.rating} out of 5`}>
                  {'★'.repeat(f.rating)}<span style={{ color: '#d7dfdd' }}>{'★'.repeat(5 - f.rating)}</span>
                </span>
                <span className={`chip ${f.rating >= 4 ? 'bg-good-50 text-good-700' : f.rating <= 2 ? 'bg-wrong-50 text-wrong-700' : 'bg-shell text-muted'}`}>{f.rating}/5</span>
              </div>
            ) : null}
            <p className="whitespace-pre-wrap text-sm text-ink">{f.body}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted">
              <span className="font-semibold text-body">{f.name || 'Anonymous customer'}</span>
              {f.mobile ? <span className="tabular">{fmtMobile(f.mobile)}</span> : <span>No number</span>}
              <span className="chip bg-shell text-muted">{f.channel && f.channel !== 'whatsapp' ? `🌐 Website${f.channel.includes(':') ? ` · ${f.channel.split(':')[1]}` : ''}` : '💬 WhatsApp'}</span>
              {f.reg_no && <span className="plate">{plate(f.reg_no)}</span>}
              <Hint note={dateTime(f.created_at)}><span>{ago(f.created_at)}</span></Hint>
            </div>
            <Testimonial f={f} onDone={load} />
          </div>
        ))}
        <div className="card overflow-hidden"><Pager page={page} total={total} onPage={setPage} className="border-t-0" /></div>
      </div>
    );
}
