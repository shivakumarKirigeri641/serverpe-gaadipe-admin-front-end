import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useSession, allowed } from '../../lib/session';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import Shell from '../../components/Shell.jsx';
import { Chip, Failed, Skeleton, Empty, Table, Modal, Pager } from '../../components/ui.jsx';
import { snack } from '../../components/Live.jsx';
import { dateTime, ago } from '../../lib/format';
import { Confirm } from '../vehicles/actions.jsx';
import { num } from './common.jsx';
import { ms } from '../vehicles/common.jsx';
import { useRowChanges } from '../../lib/motion.jsx';

/**
 * JOBS (user, 2026-09-25) — every background job: its state (RUNNING,
 * SUCCESS, FAILED, PAUSED, MISSED), last and next run, how long, how much it
 * did, its failures and last error, and its log. Running one now or pausing
 * it is confirmed first — and the confirmation says when a job sends messages
 * to customers.
 */
const TONE = { RUNNING: 'brand', SUCCESS: 'good', FAILED: 'wrong', PAUSED: 'watch', MISSED: 'wrong', WAITING: 'info' };

export default function Jobs() {
  const { can } = useSession();
  const may = allowed(can, 'system.manage');
  const [d, setD] = useState(null);
  const flash = useRowChanges(d?.rows, (j) => j.name, (j) => `${j.status}:${j.last_run}`);
  const [error, setError] = useState(null);
  const [log, setLog] = useState(null);
  const [ask, setAsk] = useState(null);
  const load = useCallback(async () => { try { setError(null); setD(await api.jobs()); } catch (e) { setError(e); } }, []);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 10000);
  return (
    <Shell title="Jobs" subtitle={d ? `${d.rows.length} background jobs in this process` : ' '}>
      <div className="card overflow-hidden">
        {error && !d ? <Failed error={error} onRetry={load} /> : !d ? <Skeleton rows={8} /> : !d.rows.length ? <Empty>No job has registered yet — they start with the server.</Empty> : (
          <Table head={<tr>{['Job', 'Status', 'Every', 'Last run', 'Next run', 'Duration', 'Processed', '24 h: runs · failed', 'Last error', ''].map((h, i) => <th key={i} className="th">{h}</th>)}</tr>}>
            {d.rows.map((j) => (
              <tr key={j.name} className={flash(j)}>
                <td className="td"><div className="font-semibold text-ink">{j.label}</div><div className="text-2xs text-muted">{j.about || j.name}</div></td>
                <td className="td"><Chip tone={TONE[j.status]}>{j.status}</Chip></td>
                <td className="td tabular text-2xs">{j.every_s >= 3600 ? `${j.every_s / 3600} h` : j.every_s >= 60 ? `${j.every_s / 60} min` : `${j.every_s} s`}</td>
                <td className="td whitespace-nowrap text-2xs">{j.last_run ? ago(j.last_run) : 'Not yet'}</td>
                <td className="td whitespace-nowrap text-2xs">{j.status === 'PAUSED' ? 'Paused' : j.next_run ? dateTime(j.next_run) : '—'}</td>
                <td className="td tabular">{ms(j.duration_ms)}</td>
                <td className="td tabular">{j.processed == null ? '—' : num(j.processed)}</td>
                <td className="td tabular">{num(j.runs_24h)} · <span className={j.failures_24h ? 'text-wrong-700' : ''}>{num(j.failures_24h)}</span></td>
                <td className="td max-w-[240px] text-2xs text-wrong-700"><span className="line-clamp-2" title={j.last_error || ''}>{j.last_error || ''}</span></td>
                <td className="td whitespace-nowrap text-right">
                  <button className="btn-quiet !px-2 !py-1 text-2xs" onClick={() => setLog(j)}>Logs</button>
                  {may && <button className="btn-quiet ml-1 !px-2 !py-1 text-2xs" onClick={() => setAsk({ kind: 'run', j })} disabled={j.status === 'RUNNING'}>{j.status === 'FAILED' ? 'Retry' : 'Run now'}</button>}
                  {may && <button className="btn-quiet ml-1 !px-2 !py-1 text-2xs" onClick={() => setAsk({ kind: j.status === 'PAUSED' ? 'resume' : 'pause', j })}>{j.status === 'PAUSED' ? 'Resume' : 'Pause'}</button>}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </div>
      {d && <p className="mt-2 text-2xs text-muted">{d.notes.missed} {d.notes.history}</p>}
      {log && <JobLog job={log} onClose={() => setLog(null)} />}
      {ask && (
        <Confirm title={ask.kind === 'run' ? `Run “${ask.j.label}” now?` : ask.kind === 'pause' ? `Pause “${ask.j.label}”?` : `Resume “${ask.j.label}”?`}
          action={ask.kind === 'run' ? 'Run now' : ask.kind === 'pause' ? 'Pause' : 'Resume'} tone={ask.kind === 'pause' ? 'danger' : 'primary'}
          onClose={() => setAsk(null)}
          onConfirm={async () => {
            if (ask.kind === 'run') {
              const out = await api.runJob(ask.j.name).catch((e) => ({ ok: false, message: e.message }));
              snack(out.ok ? `Done${out.processed != null ? ` — ${out.processed} processed` : ''}` : `Failed: ${out.message}`, out.ok ? 'good' : 'wrong');
            } else {
              await api.pauseJob(ask.j.name, ask.kind === 'pause'); snack(ask.kind === 'pause' ? 'Paused' : 'Resumed');
            }
            load();
          }}>
          {ask.kind === 'run' && <>Runs the same step the schedule would run within {ask.j.every_s >= 60 ? `${Math.round(ask.j.every_s / 60)} minutes` : `${ask.j.every_s} seconds`}.
            {ask.j.sends && <b className="mt-2 block text-watch-700">This job sends messages or makes changes for customers — anything due will go out now.</b>}</>}
          {ask.kind === 'pause' && <>The job stops running on its schedule until it is resumed. {ask.j.sends ? 'Customers will not get what it sends while it is paused.' : ''} It will not raise “missed” alerts while paused.</>}
          {ask.kind === 'resume' && <>The job runs on its schedule again from its next tick.</>}
          <span className="mt-2 block text-2xs text-muted">Logged against your name.</span>
        </Confirm>
      )}
    </Shell>
  );
}

function JobLog({ job, onClose }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [d, setD] = useState(null);
  useEffect(() => { api.jobRuns(job.name, { status: status || undefined, limit: 25, offset: (page - 1) * 25 }).then(setD).catch(() => setD({ rows: [], total: 0 })); }, [job.name, page, status]);
  return (
    <Modal wide title={`${job.label} — log`} subtitle={job.about} onClose={onClose}>
      <select className="input !w-auto !py-1.5 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
        <option value="">Every run</option><option value="failed">Failed</option><option value="success">Succeeded</option><option value="paused">Paused</option>
      </select>
      {!d ? <Skeleton rows={5} /> : !d.rows.length ? <Empty>No runs recorded.</Empty> : (
        <>
          <Table head={<tr>{['Started', 'Status', 'Duration', 'Processed', 'Trigger', 'Error'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
            {d.rows.map((r) => (
              <tr key={r.id}>
                <td className="td whitespace-nowrap text-2xs">{dateTime(r.started_at)}</td>
                <td className="td"><Chip tone={{ success: 'good', failed: 'wrong', paused: 'watch', running: 'brand' }[r.status]}>{r.status}</Chip></td>
                <td className="td tabular">{ms(r.duration_ms)}</td><td className="td tabular">{r.processed ?? '—'}</td>
                <td className="td text-2xs">{r.trigger === 'manual' ? `By ${r.admin || 'an admin'}` : 'Schedule'}</td>
                <td className="td text-2xs text-wrong-700">{r.error || ''}</td>
              </tr>
            ))}
          </Table>
          <Pager page={page} total={d.total} size={25} onPage={setPage} />
        </>
      )}
    </Modal>
  );
}
