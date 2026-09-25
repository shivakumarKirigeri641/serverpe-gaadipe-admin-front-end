import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import Shell from '../../components/Shell.jsx';
import { Chip, Skeleton, Empty } from '../../components/ui.jsx';
import { rs } from './common.jsx';

/**
 * LIVE ACTIVITY (user, 2026-09-25) — everything happening, as it happens:
 * website visits, vehicle searches, WhatsApp chats, lookups, reports,
 * payments and records-API errors. Pause stops the stream (nothing is lost —
 * resuming picks up from where it paused); filter by kind.
 */
const KIND = { website: ['Website', 'info'], whatsapp: ['WhatsApp', 'good'], lookup: ['Lookup', 'brand'], report: ['Report', 'watch'], payment: ['Payment', 'good'], api_error: ['API error', 'wrong'] };

export default function LiveActivity() {
  const [rows, setRows] = useState(null);
  const [paused, setPaused] = useState(false);
  const [only, setOnly] = useState('');
  const [fresh, setFresh] = useState(new Set());
  const cursor = useRef(null);
  const tick = useCallback(async () => {
    if (document.hidden) return;
    try {
      const out = await api.activityStream(cursor.current || undefined);
      if (cursor.current && out.rows.length) { setFresh(new Set(out.rows.map((r) => r.id))); setRows((old) => [...out.rows, ...(old || [])].slice(0, 300)); }
      else if (!cursor.current) setRows(out.rows);
      cursor.current = out.cursor;
    } catch { /* next tick */ }
  }, []);
  useEffect(() => {
    if (paused) return undefined;
    tick(); const t = setInterval(tick, 3000); return () => clearInterval(t);
  }, [tick, paused]);
  const list = (rows || []).filter((r) => !only || r.kind === only);
  return (
    <Shell title="Live activity" subtitle={paused ? 'Paused' : 'Every 3 seconds · the last 24 hours'}
      actions={<button className={paused ? 'btn-primary !py-1.5 text-2xs' : 'btn-quiet !py-1.5 text-2xs'} onClick={() => setPaused((p) => !p)}>{paused ? '▶ Resume' : '❚❚ Pause'}</button>}>
      <div className="mb-3 flex flex-wrap gap-1">
        {[['', 'Everything'], ...Object.entries(KIND).map(([k, [l]]) => [k, l])].map(([k, l]) => (
          <button key={k} onClick={() => setOnly(k)} className={`chip border ${only === k ? 'border-brand bg-brand text-white' : 'border-line bg-white text-body'}`}>{l}</button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`m-dot h-2.5 w-2.5 ${paused ? 'bg-muted' : 'bg-good-500 m-dot-live'}`} /></span>
          <b className="text-ink">{paused ? 'Paused' : 'Live'}</b>
        </div>
        {!rows ? <Skeleton rows={8} /> : !list.length ? <Empty>Nothing in the last 24 hours{only ? ' of this kind' : ''}.</Empty> : (
          <ul className="divide-y divide-line">
            {list.map((r) => (
              <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-sm transition-colors duration-1000 ${fresh.has(r.id) ? (r.kind === 'api_error' ? 'm-row-new m-row-warn' : 'm-row-new') : ''}`}>
                <span className="tabular w-16 shrink-0 text-2xs text-muted">{new Date(r.at).toLocaleTimeString('en-IN', { hour12: false })}</span>
                <Chip tone={KIND[r.kind]?.[1]}>{KIND[r.kind]?.[0]}</Chip>
                <span className="text-ink">{r.label}</span>
                {r.reg_no && <Link className="font-mono text-brand-deep hover:underline" to={`/vehicles/${r.reg_no}`}>{r.display}</Link>}
                <span className="text-2xs text-muted">{[r.customer, r.source, r.status, r.duration_ms != null && `${r.duration_ms} ms`, r.amount_paise != null && rs(r.amount_paise), r.detail].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
