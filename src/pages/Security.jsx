import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { dateTime, ago, mobile as fmtMobile } from '../lib/format';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import Shell from '../components/Shell.jsx';
import { Chip, Empty, Failed, Hint, Pager, PAGE_SIZE, Spinner } from '../components/ui.jsx';

/**
 * What the guard refused or slowed down (user, 2026-09-18): floods, loops,
 * scraping, automation tools, requests that skipped the encryption or were
 * tampered with or replayed. Every one of these was already handled when it
 * happened; this is the record, and the admin is emailed a batch of them.
 */
const KINDS = {
  rate_limit: ['Too many requests', 'watch'],
  blocked_ip: ['Address blocked', 'wrong'],
  loop: ['Request loop', 'watch'],
  scraping: ['Scraping', 'wrong'],
  bot: ['Automation tool', 'wrong'],
  plain_request: ['Unencrypted call', 'watch'],
  bad_envelope: ['Tampered request', 'wrong'],
  replay: ['Replayed request', 'wrong'],
  key_misuse: ['Key misuse', 'wrong'],
  full_view_cap: ['Daily record limit', 'watch'],
};

export default function Security() {
  const [kind, setKind] = useState('');
  const [ip, setIp] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => { setPage(1); }, [kind, ip]);
  const load = useCallback(async () => {
    try { setError(null); setData(await api.securityEvents({ kind, ip, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })); }
    catch (e) { setError(e); }
  }, [kind, ip, page]);
  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load);
  const s = data?.summary;

  return (
    <Shell title="Security" subtitle="Everything the API refused or slowed down — handled automatically, recorded here, emailed to you"
      actions={
        <select className="input !w-auto !py-1.5 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Every kind</option>
          {Object.entries(KINDS).map(([k, [label]]) => <option key={k} value={k}>{label}</option>)}
        </select>
      }>
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[['Events, 24h', s.today, s.today ? 'text-watch-700' : ''], ['Serious, 24h', s.serious_today, s.serious_today ? 'text-wrong-700' : ''],
            ['Addresses, 24h', s.ips_today], ['All time', s.total]].map(([k, v, tone], i) => (
            <div key={k} className="card cv-rise cv-tile px-4 py-3" style={{ animationDelay: `${i * 30}ms` }}>
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{k}</div>
              <div className={`tabular mt-1 text-2xl font-semibold ${tone || 'text-ink'}`}>{v}</div>
            </div>
          ))}
        </div>
      )}
      {ip && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-muted">Only</span><span className="chip bg-brand/10 font-mono text-brand-deep">IP {ip}</span>
          <button type="button" className="btn-quiet !px-2.5 !py-1 text-2xs" onClick={() => setIp('')}>Show everything</button>
        </div>
      )}
      <div className="card">
        {error ? <Failed error={error} onRetry={load} />
          : !data ? <Spinner />
          : !data.rows.length ? <Empty>Nothing suspicious{kind || ip ? ' here' : ' yet'}. Good.</Empty>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b border-line bg-shell/60">
                  <tr><th className="th">When</th><th className="th">What</th><th className="th">From</th><th className="th">Where</th><th className="th">Client</th><th className="th">Detail</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.rows.map((e, i) => {
                    const [label, tone] = KINDS[e.kind] || [e.kind, 'info'];
                    return (
                      <tr key={e.id} className="cv-row hover:bg-shell/40" style={{ animationDelay: `${Math.min(i, 14) * 18}ms` }}>
                        <td className="td whitespace-nowrap"><Hint note={dateTime(e.created_at)}><span className="text-2xs">{ago(e.created_at)}</span></Hint></td>
                        <td className="td"><Chip tone={tone}>{label}</Chip>{e.severity === 'high' && <div className="mt-0.5 text-2xs font-semibold text-wrong-700">serious</div>}</td>
                        <td className="td">
                          <button type="button" className="font-mono text-2xs text-brand-deep hover:underline" onClick={() => setIp(e.ip)}>{e.ip}</button>
                          <div className="text-2xs text-muted">{e.place || ''}{e.mobile ? ` · ${fmtMobile(e.mobile)}` : ''}</div>
                        </td>
                        <td className="td text-2xs"><span className="capitalize">{e.surface}</span><div className="font-mono text-muted">{e.path}</div></td>
                        <td className="td text-2xs"><Hint note={e.user_agent || 'No client given'}><span className="border-b border-dotted border-muted/40">{e.described || 'Unknown'}</span></Hint></td>
                        <td className="td font-mono text-2xs text-muted">{e.detail ? JSON.stringify(e.detail).slice(0, 120) : ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        {data && <Pager page={page} total={data.total} onPage={setPage} />}
      </div>
    </Shell>
  );
}
