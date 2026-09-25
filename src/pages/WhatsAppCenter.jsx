import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { chartAnim, legendToggle } from '../lib/motion.jsx';
import { api } from '../lib/api';
import Shell from '../components/Shell.jsx';
import { usePeriod } from '../components/Period.jsx';
import { Hint, Failed, SkeletonCards, Empty, Table } from '../components/ui.jsx';
import { count, dateTime, mobile as fmtMobile, ago } from '../lib/format';

/**
 * WHATSAPP (user, 2026-09-25, command center phase 4).
 *
 * What went through the chat: messages in, replies and templates out, and
 * what WhatsApp's own receipts say became of them — delivered, read, failed —
 * with the chat's funnel, each template's delivery, the hours people write,
 * the latest failures with WhatsApp's reason, and the chat as it happens.
 * All counted by the back end (src/admin/whatsappStats.js).
 */

const AXIS = { fontSize: 11, fill: '#6b8380' };
const TOOLTIP = { fontSize: 12, borderRadius: 8, border: '1px solid #e3ecea' };

export default function WhatsAppCenter() {
  const navigate = useNavigate();
  const [params, controls, key] = usePeriod('wa', { defaultRange: '7d' });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try { setData(await api.whatsappStats(params)); setError(null); } catch (e) { setError(e); }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Shell title="WhatsApp"
      subtitle={data ? `${data.range.label}${data.compare ? ` · ${data.compare.label}` : ''}` : ' '}
      actions={<>{controls}<button className="btn-quiet !py-1.5 text-2xs" onClick={load}>Refresh</button></>}>
      {error && !data ? <Failed error={error} onRetry={load} /> : !data ? <SkeletonCards n={8} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
            {data.tiles.map((t) => <Tile key={t.key} t={t} />)}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Rate label="Delivered" v={data.rates.delivery_pct} note="Share of messages sent that WhatsApp confirmed as delivered." />
            <Rate label="Read" v={data.rates.read_pct} note="Share of delivered messages that were read (only where the person shows read receipts)." />
            <Rate label="Failed" v={data.rates.failure_pct} bad note="Share of messages sent that WhatsApp refused or could not deliver." />
            <Hint note="Replies go out inside the 24-hour window after a customer writes and are free; templates are business-started and charged." className="block">
              <div className="card p-3">
                <div className="text-2xs uppercase tracking-wider text-muted">User vs business started</div>
                <div className="mt-1 text-sm text-ink">{count(data.rates.user_initiated)} replies · {count(data.rates.business_initiated)} templates</div>
                <div className="text-2xs text-muted">{count(data.blocked_total)} number{data.blocked_total === 1 ? '' : 's'} blocked</div>
              </div>
            </Hint>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="card">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">The chat, step by step</h2>
                <p className="text-2xs text-muted">One person per step · conversion from the step before that had people</p>
              </div>
              <div className="divide-y divide-line">
                {data.funnel.map((s) => {
                  const most = Math.max(1, ...data.funnel.map((x) => x.n || 0));
                  return (
                    <div key={s.key} className="flex items-center gap-3 px-4 py-2">
                      <div className="w-44 shrink-0 text-sm text-ink">{s.label}</div>
                      <div className="h-5 flex-1 rounded bg-shell">
                        <div className="h-5 rounded bg-brand/80" style={{ width: `${Math.max((s.n || 0) / most * 100, s.n ? 2 : 0)}%`, transition: 'width .5s' }} />
                      </div>
                      <div className="tabular w-10 text-right text-sm font-semibold text-ink">{s.n == null ? '—' : count(s.n)}</div>
                      <div className="w-16 text-right text-2xs text-muted">{s.conversion_pct == null ? '—' : `${s.conversion_pct}%`}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card p-4">
              <h2 className="text-sm font-semibold text-ink">When people write</h2>
              <p className="text-2xs text-muted">Messages in, by hour of the day (India time)</p>
              <div className="mt-3 h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.by_hour}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef3f2" vertical={false} />
                    <XAxis dataKey="hour" tick={AXIS} tickFormatter={(h) => `${h}`} interval={2} />
                    <YAxis tick={AXIS} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP} labelFormatter={(h) => `${h}:00–${h}:59`} />
                    <Bar {...chartAnim()} dataKey="n" name="Messages in" fill="#0d9488" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card mt-4 p-4">
            <h2 className="text-sm font-semibold text-ink">Day by day</h2>
            <div className="mt-3 h-52">
              {!data.daily.length ? <Empty>No messages in this period.</Empty> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef3f2" vertical={false} />
                    <XAxis dataKey="day" tick={AXIS} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={AXIS} allowDecimals={false} />
                    <Tooltip contentStyle={TOOLTIP} />
                    <Legend {...legendToggle()} wrapperStyle={{ fontSize: 11 }} />
                    <Bar {...chartAnim()} dataKey="incoming" name="In" stackId="a" fill="#0b4f4a" />
                    <Bar {...chartAnim()} dataKey="replies" name="Replies" stackId="a" fill="#0d9488" />
                    <Bar {...chartAnim()} dataKey="templates" name="Templates" stackId="a" fill="#e08700" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="card">
              <div className="border-b border-line px-4 py-3"><h2 className="text-sm font-semibold text-ink">Templates</h2></div>
              {!data.templates.length ? <Empty>No templates sent in this period.</Empty> : (
                <Table head={<tr>{['Template', 'Sent', 'Delivered', 'Read', 'Failed'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
                  {data.templates.map((t) => (
                    <tr key={t.template}>
                      <td className="td text-sm">{t.template}</td>
                      <td className="td tabular">{count(t.sent)}</td>
                      <td className="td tabular">{count(t.delivered)} <span className="text-2xs text-muted">{t.delivery_pct == null ? '' : `${t.delivery_pct}%`}</span></td>
                      <td className="td tabular">{count(t.read)} <span className="text-2xs text-muted">{t.read_pct == null ? '' : `${t.read_pct}%`}</span></td>
                      <td className={`td tabular ${t.failed ? 'text-wrong-700' : ''}`}>{count(t.failed)}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
            <div className="card">
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold text-ink">Failures</h2>
                <p className="text-2xs text-muted">Messages WhatsApp refused, with its reason · tap for the person's journey</p>
              </div>
              {!data.failures.length ? <Empty>Nothing failed in this period.</Empty> : (
                <ul className="divide-y divide-line">
                  {data.failures.map((f, i) => (
                    <li key={i} className="cursor-pointer px-4 py-2 hover:bg-shell/70" onClick={() => navigate(`/journey?mobile=${f.mobile}`)}>
                      <div className="flex justify-between text-2xs">
                        <span className="text-ink">{fmtMobile(f.mobile)} · {f.template_name || f.message_type}</span>
                        <span className="text-muted">{ago(f.created_at)}</span>
                      </div>
                      <div className="text-2xs text-wrong-700">{f.reason}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <LiveChat navigate={navigate} />
        </>
      )}
    </Shell>
  );
}

function Tile({ t }) {
  const up = t.previous != null && t.value > t.previous; const down = t.previous != null && t.value < t.previous;
  const good = t.worse_up ? down : up; const bad = t.worse_up ? up : down;
  return (
    <Hint note={t.note} className="block">
      <div className="card p-3">
        <div className="text-2xs uppercase tracking-wider text-muted">{t.label}</div>
        <div className="tabular mt-1 text-xl font-bold text-ink">{count(t.value)}</div>
        <div className={`text-2xs ${good ? 'text-good-700' : bad ? 'text-wrong-700' : 'text-muted'}`}>
          {t.previous == null ? ' ' : t.value === t.previous ? 'same' : `${up ? '▲' : '▼'} ${t.change_pct == null ? 'new' : `${Math.abs(t.change_pct)}%`} · was ${count(t.previous)}`}
        </div>
      </div>
    </Hint>
  );
}

function Rate({ label, v, note, bad = false }) {
  return (
    <Hint note={note} className="block">
      <div className="card p-3">
        <div className="text-2xs uppercase tracking-wider text-muted">{label}</div>
        <div className={`mt-1 text-xl font-bold ${bad && v ? 'text-wrong-700' : 'text-ink'}`}>{v == null ? 'No data' : `${v}%`}</div>
        <div className="mt-1 h-1.5 rounded bg-shell">
          <div className={`h-1.5 rounded ${bad ? 'bg-wrong-500' : 'bg-good-500'}`} style={{ width: `${Math.min(100, v || 0)}%`, transition: 'width .5s' }} />
        </div>
      </div>
    </Hint>
  );
}

/* The chat as it happens: the command center's live stream, WhatsApp only. */
function LiveChat({ navigate }) {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    let since = null; let stop = false;
    const tick = async () => {
      try {
        const out = await api.commandLive(since);
        const wa = out.events.filter((e) => e.channel === 'whatsapp');
        if (out.events.length) since = out.last_id;
        if (!stop && wa.length) setEvents((x) => [...x, ...wa].slice(-40));
      } catch { /* the next tick retries */ }
    };
    tick();
    const t = setInterval(() => { if (!document.hidden) tick(); }, 5000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return (
    <div className="card mt-4">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <span className="breathe h-2 w-2 rounded-full bg-good-500" />
        <h2 className="text-sm font-semibold text-ink">Live WhatsApp activity</h2>
      </div>
      {!events.length ? <Empty>Waiting for the next message…</Empty> : (
        <ul className="max-h-72 divide-y divide-line overflow-y-auto">
          {[...events].reverse().map((e, i) => (
            <li key={e.id} className="fade flex cursor-pointer items-center gap-2 px-4 py-1.5 text-2xs hover:bg-shell/70"
              onClick={() => e.mobile && navigate(`/journey?mobile=${e.mobile}`)}>
              <span className={`h-1.5 w-1.5 rounded-full ${e.status === 'failed' ? 'bg-wrong-500' : i === 0 ? 'breathe bg-good-500' : 'bg-line'}`} />
              <span className="tabular text-muted">{dateTime(e.occurred_at)}</span>
              <span className="text-ink">{e.words}{e.reg_no ? ` · ${e.reg_no}` : ''}</span>
              <span className="text-muted">· {e.person_name || (e.mobile ? fmtMobile(e.mobile) : '')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
