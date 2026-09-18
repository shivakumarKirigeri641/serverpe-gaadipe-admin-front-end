import { useState } from 'react';
import { ResponsiveContainer } from 'recharts';
import { rupees, count, date, dateTime, plate } from '../../lib/format';
import { Hint, Pager, PAGE_SIZE, Empty } from '../../components/ui.jsx';

/*
 * The pieces every analytics tab draws with: the chart card, the colours that
 * mean the same thing on every chart, the change arrow, and the drill-down
 * list a tapped bar or cell opens onto.
 */

export const TOOLTIP = {
  borderRadius: 10, border: '1px solid #e3ecea', fontSize: 12,
  boxShadow: '0 12px 32px rgba(11,31,28,.12)',
};
export const AXIS = { fontSize: 11, fill: '#6b8380' };

/* One colour per meaning, everywhere. */
export const STATE_COLOURS = { expired: '#d92d20', due: '#e08700', valid: '#12a150', none: '#c9d6d4' };
export const STATE_WORDS = { expired: 'Expired', due: 'Expiring ≤30 days', valid: 'Valid', none: 'Not recorded' };
export const GROUP_COLOURS = { '2W': '#0d9488', '3W': '#e08700', '4W': '#0b4f4a', HV: '#7c3aed', OT: '#94a3b8' };
export const DOC_COLOURS = {
  insurance: '#0d9488', pucc: '#e08700', fitness: '#7c3aed', tax: '#0b4f4a', permit: '#d92d20', registration: '#2563eb',
};
export const PALETTE = ['#0d9488', '#0b4f4a', '#e08700', '#7c3aed', '#2563eb', '#d92d20', '#12a150', '#db2777', '#94a3b8', '#ca8a04', '#0891b2', '#65a30d'];

export const inr = (paise) => rupees(paise, { decimals: true });
export const rupeeAxis = (v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v >= 1000 ? `₹${(v / 1000).toFixed(1)}k` : `₹${v}`);

/** A chart in a card: title, what it shows, and room to draw. */
export const Chart = ({ title, note, height = 260, right, children }) => (
  <div className="card cv-rise p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {note && <p className="text-2xs text-muted">{note}</p>}
      </div>
      {right}
    </div>
    <div className="mt-3" style={{ width: '100%', height }}>
      <ResponsiveContainer>{children}</ResponsiveContainer>
    </div>
  </div>
);

/** Change from `before` to `now`: direction, percentage, and a sentence. */
export function delta(now, before) {
  const a = Number(now || 0); const b = Number(before || 0);
  if (!a && !b) return { dir: 'flat', pct: 0, label: '—' };
  if (!b) return { dir: 'up', pct: null, label: 'new' };
  const pct = Math.round(((a - b) / b) * 1000) / 10;
  return { dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat', pct, label: `${pct > 0 ? '+' : ''}${pct}%` };
}

/** ▲ 12.5% in green, ▼ in red — or the reverse where fewer is better. */
export function Delta({ now, before, lowerIsBetter = false, className = '' }) {
  const d = delta(now, before);
  const good = d.dir === 'flat' ? null : (d.dir === 'up') !== lowerIsBetter;
  const tone = good === null ? 'bg-shell text-muted' : good ? 'bg-good-50 text-good-700' : 'bg-wrong-50 text-wrong-700';
  return (
    <span className={`chip ${tone} ${className}`}>
      {d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '•'} {d.label}
    </span>
  );
}

/* ────────────────────────────────────────────────────── drill-down list ── */

const DOC_ORDER = [['insurance', 'Insurance'], ['pucc', 'PUC'], ['fitness', 'Fitness'], ['tax', 'Road tax'], ['permit', 'Permit'], ['registration', 'Registration']];
const GROUP_WORDS = { '2W': 'Two-wheeler', '3W': 'Three-wheeler', '4W': 'Four-wheeler', HV: 'Multi-axle / heavy', OT: 'Other' };

const daysWords = (d) => (d == null ? '' : d < 0 ? `${-d} day${d === -1 ? '' : 's'} ago` : d === 0 ? 'today' : `in ${d} day${d === 1 ? '' : 's'}`);

/* Everything known about one vehicle, as the hover note. */
function hoverNote(v) {
  return (
    <span className="block space-y-1">
      <b className="block text-ink">{plate(v.reg_no)} · {GROUP_WORDS[v.group]}</b>
      <span className="block">{[v.maker, v.model].filter(Boolean).join(' ') || 'Make not recorded'}</span>
      <span className="block">{[v.vehicle_class, v.fuel, v.manufactured && `made ${v.manufactured}`].filter(Boolean).join(' · ')}</span>
      <span className="block">RC: {v.status || '—'}{v.rto ? ` · ${v.rto}` : ''}</span>
      {DOC_ORDER.map(([k, label]) => (
        <span key={k} className="block" style={{ color: v.docs[k].state === 'none' ? undefined : STATE_COLOURS[v.docs[k].state] }}>
          {label}: {v.docs[k].date ? `${date(v.docs[k].date)} (${daysWords(v.docs[k].days)})` : 'not recorded'}
        </span>
      ))}
      <span className="block">Challans: {v.challans_pending ? `${v.challans_pending} pending · ${inr(v.challans_amount_paise)}` : 'none pending'}</span>
      <span className="block">{v.paid ? 'Report bought' : 'Not bought'}{v.watched ? ' · monitored' : ''}{v.blocked ? ' · BLOCKED' : ''} · checked by {v.checked_by}</span>
    </span>
  );
}

/**
 * The vehicles behind a number. `doc` puts that document's date first; each
 * row carries everything on hover and opens onto the full record on a tap.
 */
export function VehicleDrill({ title, list, doc, onClose }) {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const sorted = doc
    ? [...list].sort((a, b) => (a.docs[doc].days ?? 1e9) - (b.docs[doc].days ?? 1e9))
    : list;
  const rows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="card cv-rise overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-shell/60 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">{title} <span className="font-normal text-muted">· {count(list.length)}</span></h2>
        {onClose && <button type="button" className="btn-quiet !px-3 !py-1 text-2xs" onClick={onClose}>Close</button>}
      </div>
      {!list.length ? <Empty>No vehicles here.</Empty> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-line bg-shell/40">
                <tr>
                  <th className="th">Vehicle</th><th className="th">Class</th><th className="th">Make · model</th>
                  {doc ? <th className="th">{DOC_ORDER.find(([k]) => k === doc)[1]}</th> : <th className="th">Worst document</th>}
                  <th className="th">RC status</th><th className="th">Challans</th><th className="th">Customer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((v, i) => {
                  const focus = doc ? v.docs[doc] : null;
                  const isOpen = open === v.reg_no;
                  return (
                    <FragmentRow key={v.reg_no}>
                      <tr className={`cv-row cursor-pointer transition hover:bg-shell/60 ${isOpen ? 'bg-shell/50' : ''}`}
                        style={{ animationDelay: `${Math.min(i, 14) * 20}ms` }} onClick={() => setOpen(isOpen ? null : v.reg_no)}>
                        <td className="td"><Hint note={hoverNote(v)}><span className="font-mono font-semibold text-ink">{plate(v.reg_no)}</span></Hint></td>
                        <td className="td"><span className="chip text-white" style={{ background: GROUP_COLOURS[v.group] }}>{v.group === 'OT' ? '—' : v.group}</span></td>
                        <td className="td text-body">{[v.maker, v.model].filter(Boolean).join(' ') || '—'}</td>
                        <td className="td">
                          {focus ? (
                            <span style={{ color: STATE_COLOURS[focus.state] }} className="font-semibold">
                              {focus.date ? date(focus.date) : 'Not recorded'}
                              {focus.days != null && <span className="block text-2xs font-normal">{daysWords(focus.days)}</span>}
                            </span>
                          ) : <span className="chip text-white" style={{ background: STATE_COLOURS[v.worst] }}>{STATE_WORDS[v.worst]}</span>}
                        </td>
                        <td className="td text-2xs">{v.status || '—'}</td>
                        <td className="td tabular">{v.challans_pending ? <span className="font-semibold text-wrong-700">{v.challans_pending} · {inr(v.challans_amount_paise)}</span> : '—'}</td>
                        <td className="td text-2xs">{v.paid ? <span className="chip bg-good-50 text-good-700">bought</span> : 'free check'}{v.watched ? ' · monitored' : ''}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-shell/30">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="cv-unfold grid gap-4 md:grid-cols-3">
                              <div>
                                <div className="label">Documents</div>
                                {DOC_ORDER.map(([k, label]) => (
                                  <div key={k} className="flex justify-between gap-3 border-b border-line/60 py-1 text-sm">
                                    <span className="text-muted">{label}</span>
                                    <span style={{ color: v.docs[k].state === 'none' ? '#6b8380' : STATE_COLOURS[v.docs[k].state] }} className="text-right font-medium">
                                      {v.docs[k].date ? `${date(v.docs[k].date)} · ${daysWords(v.docs[k].days)}` : 'not recorded'}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <div className="label">Vehicle</div>
                                {[['Class', v.vehicle_class], ['Category', v.category], ['Fuel', v.fuel], ['Norms', v.norms],
                                  ['Manufactured', v.manufactured], ['Age', v.age_years != null ? `${v.age_years} years` : null],
                                  ['RTO', v.rto], ['Owner no.', v.owner_serial], ['Financed', v.financed ? 'Yes' : 'No']].map(([k, val]) => (
                                  <div key={k} className="flex justify-between gap-3 border-b border-line/60 py-1 text-sm">
                                    <span className="text-muted">{k}</span><span className="text-right font-medium text-ink">{val || '—'}</span>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <div className="label">With GaadiPe</div>
                                {[['First checked', dateTime(v.first_seen_at)], ['Last checked', dateTime(v.last_seen_at)],
                                  ['Record fetched', dateTime(v.rc_fetched_at)], ['Checked by', `${v.checked_by} customer(s)`],
                                  ['Report', v.paid ? 'Bought' : 'Not bought'], ['Monitoring', v.watched ? 'Active' : '—'],
                                  ['Blocked', v.blocked ? 'Yes' : 'No'],
                                  ['Challans pending', v.challans_pending ? `${v.challans_pending} · ${inr(v.challans_amount_paise)}` : 'None']].map(([k, val]) => (
                                  <div key={k} className="flex justify-between gap-3 border-b border-line/60 py-1 text-sm">
                                    <span className="text-muted">{k}</span><span className="text-right font-medium text-ink">{val || '—'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} total={list.length} onPage={(p) => { setPage(p); setOpen(null); }} />
        </>
      )}
    </div>
  );
}

const FragmentRow = ({ children }) => <>{children}</>;
