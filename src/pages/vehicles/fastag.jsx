import { useMemo, useState } from 'react';
import { Chip, Banner, Empty, Table } from '../../components/ui.jsx';
import { dateTime, ago } from '../../lib/format';
import { show, day } from './common.jsx';

/*
 * FASTAG AND ITS TOLL HISTORY (user, 2026-10-15: "in ULIP I also get FASTag history for
 * yellow boards — fill that history in the vehicle explorer"). Everything here is the stored
 * FASTag answer (src/ulip/fastag.js): the tags (FASTAG/02) and the toll crossings (FASTAG/01),
 * saved with the vehicle at its last fetch. Nothing is fetched from this page — a fresh
 * history is "Refresh vehicle data", which is a paid call.
 */

const STATUS_TONE = { active: 'good', inactive: 'info', closed: 'info', 'low balance': 'watch', exception: 'wrong' };
const timeOf = (at) => (/\d{2}:\d{2}/.exec(String(at || '').slice(10)) || [''])[0];
const dayKey = (c) => c.date || String(c.at || '').slice(0, 10);
const DIRECTION = { N: 'Northbound', S: 'Southbound', E: 'Eastbound', W: 'Westbound' };
const maskTag = (t) => (t && t.length > 10 ? `${t.slice(0, 6)}••••${t.slice(-4)}` : t);
const mapLink = (c) => (c.lat != null && c.lon != null ? `https://www.google.com/maps?q=${c.lat},${c.lon}` : null);

export default function FastagHistory({ f, plate }) {
  const [all, setAll] = useState(false);
  const crossings = useMemo(() => (Array.isArray(f?.crossings) ? f.crossings : null), [f]);
  const byDay = useMemo(() => {
    const out = [];
    for (const c of (crossings || []).slice(0, all ? undefined : 40)) {
      const k = dayKey(c);
      if (!out.length || out[out.length - 1].day !== k) out.push({ day: k, rows: [] });
      out[out.length - 1].rows.push(c);
    }
    return out;
  }, [crossings, all]);
  const plazas = useMemo(() => {
    const m = new Map();
    for (const c of crossings || []) if (c.plaza) m.set(c.plaza, (m.get(c.plaza) || 0) + 1);
    return [...m.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
  }, [crossings]);

  if (!f) {
    return (
      <Empty>
        FASTag has not been fetched for this vehicle.
        {['yellow', 'green_yellow'].includes(plate) ? ' Commercial vehicles usually carry a tag — “Refresh vehicle data” fetches it with its toll history (a paid call).' : ''}
      </Empty>
    );
  }
  const t = f.active_tag;
  const days = new Set((crossings || []).map(dayKey)).size;
  const first = crossings?.length ? crossings[crossings.length - 1] : null;
  const last = crossings?.[0] || null;
  const top = plazas[0]?.n || 1;

  return (
    <div className="space-y-4 p-4">
      {f.crossings_error && <Banner tone="watch">The toll history did not come back at the last fetch ({f.crossings_error}). The tag details below are still current.</Banner>}

      <div className="grid gap-3 lg:grid-cols-[minmax(260px,340px)_1fr]">
        {/* The tag itself, drawn like the sticker on a windscreen. */}
        <div className={`relative overflow-hidden rounded-2xl p-4 text-white shadow-pop ${t ? 'bg-gradient-to-br from-[#0f766e] via-[#115e59] to-[#0b3b37]' : 'bg-gradient-to-br from-[#475569] to-[#1e293b]'}`}>
          <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-12 right-8 h-28 w-28 rounded-full bg-white/5" />
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">FASTag</span>
            {t ? <Chip tone={STATUS_TONE[t.status] || 'info'}>{t.status || 'Unknown'}</Chip> : <Chip>No active tag</Chip>}
          </div>
          <div className="mt-3 font-mono text-lg font-semibold tracking-wider">{t ? maskTag(t.tag_id) : '— — — —'}</div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-2xs">
            {[['Bank', t?.bank_id], ['Issued', t?.issue_date && day(t.issue_date)], ['Tag class', t?.vehicle_class],
              ['Commercial', t ? (t.commercial ? 'Yes' : 'No') : null]].map(([k, v]) => (
              <div key={k}><div className="text-white/60">{k}</div><div className="font-semibold">{v ?? '—'}</div></div>
            ))}
          </div>
          <div className="mt-3 border-t border-white/15 pt-2 text-[10px] text-white/60">
            {f.tag_count || 0} tag{f.tag_count === 1 ? '' : 's'} on record · fetched {f.checked_at ? ago(f.checked_at) : '—'}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[
            ['Toll crossings', crossings ? String(crossings.length) : '—', crossings ? 'in the stored history' : 'not in this fetch'],
            ['Toll plazas', crossings ? String(plazas.length) : '—', days ? `over ${days} day${days === 1 ? '' : 's'}` : null],
            ['Last crossing', last ? day(dayKey(last)) : '—', last ? `${timeOf(last.at)} · ${last.plaza || 'plaza not named'}` : null],
            ['First in history', first ? day(dayKey(first)) : '—', first ? `${timeOf(first.at)} · ${first.plaza || 'plaza not named'}` : null],
          ].map(([l, v, s]) => (
            <div key={l} className="rounded-xl border border-line bg-gradient-to-b from-white to-shell/60 px-3 py-2.5">
              <div className="text-2xs font-semibold uppercase tracking-wider text-muted">{l}</div>
              <div className="tabular mt-0.5 text-lg font-semibold text-ink">{v}</div>
              {s && <div className="truncate text-2xs text-muted" title={s}>{s}</div>}
            </div>
          ))}
          {plazas.length > 0 && (
            <div className="col-span-2 rounded-xl border border-line px-3 py-2.5 md:col-span-4">
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Most crossed plazas</div>
              <div className="space-y-1">
                {plazas.slice(0, 5).map((p) => (
                  <div key={p.name} className="flex items-center gap-2 text-2xs">
                    <span className="w-48 shrink-0 truncate text-ink" title={p.name}>{p.name}</span>
                    <span className="flex-1"><span className="block h-2.5 rounded-full bg-gradient-to-r from-brand to-brand-deep" style={{ width: `${(p.n / top) * 100}%`, minWidth: 6 }} /></span>
                    <span className="tabular w-6 text-right text-muted">{p.n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* The journey: crossings by day, newest first. */}
      {crossings == null ? (
        <Empty>This FASTag answer was stored before toll history was kept. “Refresh vehicle data” fetches it (a paid call).</Empty>
      ) : !crossings.length ? (
        <Empty>No toll crossings in the FASTag answer{f.has_active_tag ? '' : ' — the vehicle has no active tag'}.</Empty>
      ) : (
        <div>
          <div className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted">Toll history · newest first</div>
          <ol className="relative space-y-3 border-l-2 border-brand/20 pl-5">
            {byDay.map((d) => (
              <li key={d.day}>
                <span className="absolute -left-[7px] mt-1 h-3 w-3 rounded-full bg-brand ring-4 ring-white" />
                <div className="text-sm font-semibold text-ink">{day(d.day)} <span className="text-2xs font-normal text-muted">· {d.rows.length} crossing{d.rows.length === 1 ? '' : 's'}</span></div>
                <ul className="mt-1 divide-y divide-line/70 rounded-xl border border-line bg-white">
                  {d.rows.map((c, i) => (
                    <li key={`${c.seq_no || ''}${c.at}${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                      <span className="tabular w-12 shrink-0 font-mono text-2xs text-muted">{timeOf(c.at) || '—'}</span>
                      <span className="min-w-0 flex-1 truncate font-medium text-ink" title={c.plaza || ''}>🛣️ {c.plaza || 'Plaza not named'}</span>
                      {c.direction && <Chip>{DIRECTION[String(c.direction).toUpperCase()] || c.direction}</Chip>}
                      {c.vehicle_class && <span className="text-2xs text-muted">{c.vehicle_class}</span>}
                      {mapLink(c) && <a href={mapLink(c)} target="_blank" rel="noreferrer" className="text-2xs text-brand hover:underline">Map ↗</a>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {crossings.length > 40 && (
            <button className="btn-quiet mt-2 !py-1 text-2xs" onClick={() => setAll((v) => !v)}>{all ? 'Show the latest 40' : `Show all ${crossings.length}`}</button>
          )}
        </div>
      )}

      {f.tags?.length > 0 && (
        <div>
          <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">Every tag on record</div>
          <Table head={<tr>{['Tag', 'Status', 'Bank', 'Issued', 'Class', 'Commercial'].map((h) => <th key={h} className="th">{h}</th>)}</tr>}>
            {f.tags.map((x) => (
              <tr key={x.tag_id}>
                <td className="td font-mono text-2xs">{maskTag(x.tag_id)}</td>
                <td className="td"><Chip tone={STATUS_TONE[x.status] || 'info'}>{x.status || '—'}</Chip></td>
                <td className="td">{show(x.bank_id)}</td>
                <td className="td whitespace-nowrap">{x.issue_date ? day(x.issue_date) : '—'}</td>
                <td className="td">{show(x.vehicle_class)}</td>
                <td className="td">{x.commercial ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </Table>
        </div>
      )}
      <p className="text-2xs text-muted">From FASTag (NETC, through ULIP) as stored at the last fetch{f.checked_at ? `, ${dateTime(f.checked_at)}` : ''}. Opening this page calls nothing.</p>
    </div>
  );
}
