import { useState } from 'react';

/**
 * The period picker the command-center screens share (phase 4): a preset or
 * two custom dates, and what to compare with. Each screen remembers its own
 * choice. The back end (src/admin/command.js resolve) owns what each preset
 * means, in India's time, so every screen counts the same days.
 */
export const RANGES = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days'],
  ['this_month', 'This month'], ['last_month', 'Last month'], ['custom', 'Custom'],
];
export const COMPARES = [
  ['previous', 'vs previous period'], ['yesterday', 'vs day before'], ['last_week', 'vs same days last week'],
  ['last_month', 'vs same days last month'], ['none', 'No comparison'],
];

const saved = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };
export const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);

/** [params for the API, the controls to put in the page header]. */
export function usePeriod(key, { defaultRange = '7d', withCompare = true } = {}) {
  const [range, setRange] = useState(() => saved(`gp.${key}.range`, defaultRange));
  const [compare, setCompare] = useState(() => saved(`gp.${key}.compare`, 'previous'));
  const [from, setFrom] = useState(istToday);
  const [to, setTo] = useState(istToday);

  const params = { range, ...(withCompare ? { compare } : { compare: 'none' }), ...(range === 'custom' ? { from, to } : {}) };
  const controls = (
    <>
      <select className="input !w-auto !py-1.5 text-sm" value={range}
        onChange={(e) => { setRange(e.target.value); keep(`gp.${key}.range`, e.target.value); }}>
        {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {range === 'custom' && (
        <>
          <input type="date" className="input !w-auto !py-1.5 text-sm" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input !w-auto !py-1.5 text-sm" value={to} min={from} max={istToday()} onChange={(e) => setTo(e.target.value)} />
        </>
      )}
      {withCompare && (
        <select className="input !w-auto !py-1.5 text-sm" value={compare}
          onChange={(e) => { setCompare(e.target.value); keep(`gp.${key}.compare`, e.target.value); }}>
          {COMPARES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      )}
    </>
  );
  return [params, controls, JSON.stringify(params)];
}
