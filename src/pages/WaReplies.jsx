import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { mobile as fmtMobile, dateTime, ago } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Chip, Empty, Failed, Spinner, Table, Pager, PAGE_SIZE } from '../components/ui.jsx';

/**
 * WHATSAPP REPLIES & TAPS (user, 2026-10-13: "track replies from customers — when they tap
 * reply on WhatsApp, where?"). Server: admin/waReplies.js.
 *
 * On top, per template: how many people it reached, how many replied, and the taps on each
 * button. Below, every reply — the button tapped or the words typed, and what it answered.
 */
const KINDS = [['all', 'All replies'], ['buttons', 'Button taps'], ['templates', 'Replies to templates'], ['typed', 'Typed messages']];
const DAYS = [[1, 'Today'], [7, '7 days'], [30, '30 days'], [90, '90 days']];
const TYPE = { button: ['Template button', 'good'], interactive: ['Bot button', 'brand'], text: ['Typed', 'info'] };

export default function WaReplies() {
  const [days, setDays] = useState(7);
  const [kind, setKind] = useState('all');
  const [template, setTemplate] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [days, kind, template, q]);

  const load = useCallback(async () => {
    try { setError(null); setData(await api.waReplies({ days, kind, template, q })); } catch (e) { setError(e); }
  }, [days, kind, template, q]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);

  const rows = data?.rows || [];
  return (
    <Shell title="Replies & taps" subtitle="What customers answered on WhatsApp — the button they tapped or what they typed, and the message it answered.">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-white p-0.5">
          {DAYS.map(([d, l]) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1.5 text-sm ${days === d ? 'bg-brand text-white font-semibold' : 'text-body hover:bg-shell'}`}>{l}</button>
          ))}
        </div>
        <select className="input !w-auto !py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <input className="input !w-56 !py-1.5 text-sm" placeholder="Search name, number or words" value={q} onChange={(e) => setQ(e.target.value)} />
        {template && <button type="button" className="btn-quiet !py-1 text-2xs" onClick={() => setTemplate('')}>Template: {template} ✕</button>}
      </div>

      {error && <Failed error={error} onRetry={load} />}
      {!data && !error && <Spinner />}
      {data && (
        <div className="space-y-4">
          {/* Per template */}
          <div className="card p-4">
            <div className="text-sm font-semibold text-ink">By template</div>
            {data.summary.length ? (
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                {data.summary.map((s) => (
                  <button key={s.template_name} type="button" onClick={() => setTemplate(s.template_name)}
                    className={`rounded-lg border p-3 text-left hover:bg-shell ${template === s.template_name ? 'border-brand' : 'border-line'}`}>
                    <div className="font-mono text-2xs text-muted">{s.template_name}</div>
                    <div className="mt-1 text-sm text-ink">
                      <b>{s.people}</b> of <b>{s.sent_to || '—'}</b> replied
                      {s.sent_to ? ` (${Math.round((s.people / s.sent_to) * 100)}%)` : ''} · {s.replies} message{s.replies === 1 ? '' : 's'} · {s.taps} tap{s.taps === 1 ? '' : 's'}
                    </div>
                    {Object.keys(s.buttons || {}).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {Object.entries(s.buttons).sort((a, b) => b[1] - a[1]).map(([b, n]) => <Chip key={b} tone="good">{b} · {n}</Chip>)}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            ) : <Empty>No replies to templates in this period.</Empty>}
          </div>

          {/* Every reply */}
          <div className="card p-0">
            {rows.length ? (
              <>
                <Table head={(
                  <tr className="text-left text-2xs text-muted">
                    <th className="px-3 py-2">When</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Reply</th>
                    <th className="px-3 py-2">Kind</th><th className="px-3 py-2">Answering</th>
                  </tr>)}>
                  {rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((r) => {
                    const [label, tone] = TYPE[r.type] || [r.type, 'info'];
                    return (
                      <tr key={r.id} className="align-top text-sm">
                        <td className="px-3 py-2 text-2xs text-muted" title={dateTime(r.at)}>{ago(r.at)}</td>
                        <td className="px-3 py-2">{r.name || '—'} {r.is_internal && <Chip tone="brand">you</Chip>}<div className="font-mono text-2xs text-muted">{fmtMobile(r.mobile)}</div></td>
                        <td className="px-3 py-2 font-semibold text-ink">{r.said || '—'}</td>
                        <td className="px-3 py-2"><Chip tone={tone}>{label}</Chip></td>
                        <td className="px-3 py-2 text-2xs text-muted">
                          {r.template_name ? <span className="font-mono text-ink">{r.template_name}</span> : r.answered_type ? `bot ${r.answered_type}` : '—'}
                          {r.answered && <div className="mt-0.5 line-clamp-2 max-w-md">{r.answered}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </Table>
                <Pager page={page} total={rows.length} onPage={setPage} />
              </>
            ) : <Empty>No replies in this period.</Empty>}
          </div>
        </div>
      )}
    </Shell>
  );
}
