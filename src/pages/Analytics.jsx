import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import Shell from '../components/Shell.jsx';
import { Spinner, Failed } from '../components/ui.jsx';
import Growth from './analytics/Growth.jsx';
import Revenue from './analytics/Revenue.jsx';
import Fleet from './analytics/Fleet.jsx';
import Expiry from './analytics/Expiry.jsx';
import Activity from './analytics/Activity.jsx';

/**
 * Analytics, in five views (user, 2026-09-18).
 *
 *   Growth     today / week / month against the period before, with % change.
 *   Revenue    money over time, growth per period, where each rupee went.
 *   Fleet      every vehicle known, by class (2W, 3W, 4W, multi-axle), status,
 *              fuel, maker, age — each slice opens its vehicles.
 *   Documents  expired and expiring, per document and class, the next 12 weeks.
 *   Activity   the funnel, when people check, and the raw volume.
 *
 * Each view loads what it needs once and keeps it while the reader moves
 * between tabs; "Refresh" asks again.
 */
const TABS = [
  ['growth', 'Growth'], ['revenue', 'Revenue'], ['fleet', 'Fleet'], ['documents', 'Documents'], ['activity', 'Activity'],
];
const GRAINS = { day: 'Daily', week: 'Weekly', month: 'Monthly' };
const SPAN = { day: 30, week: 120, month: 365 };

export default function Analytics() {
  const [tab, setTab] = useState(() => {
    try { return localStorage.getItem('gp.analytics.tab') || 'growth'; } catch { return 'growth'; }
  });
  const [grain, setGrain] = useState('day');
  const [data, setData] = useState({});
  const [error, setError] = useState(null);

  const pick = (t) => {
    setTab(t);
    try { localStorage.setItem('gp.analytics.tab', t); } catch { /* private window */ }
  };

  const load = useCallback(async (fresh = false) => {
    setError(null);
    try {
      const need = {
        growth: ['compare'],
        revenue: ['series'],
        fleet: ['fleet'],
        documents: ['fleet'],
        activity: ['series', 'funnel', 'heat'],
      }[tab];
      const calls = {
        compare: () => api.compare(),
        series: () => api.series({ grain, days: SPAN[grain] }),
        funnel: () => api.funnel({ days: 30 }),
        heat: () => api.heatmap({ days: 30 }),
        fleet: () => api.fleet(),
      };
      const todo = need.filter((k) => fresh || !data[k] || (k === 'series' && data.seriesGrain !== grain));
      if (!todo.length) return;
      const got = await Promise.all(todo.map((k) => calls[k]()));
      setData((d) => ({
        ...d,
        ...Object.fromEntries(todo.map((k, i) => [k, got[i]])),
        ...(todo.includes('series') ? { seriesGrain: grain } : {}),
      }));
    } catch (e) { setError(e); }
  }, [tab, grain, data]);

  useEffect(() => { load(); }, [tab, grain]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = (data.series?.rows || []).map((r) => ({
    ...r,
    label: grain === 'month' ? r.bucket.slice(0, 7) : r.bucket.slice(5),
  }));
  const seriesReady = data.series && data.seriesGrain === grain;
  const usesGrain = tab === 'revenue' || tab === 'activity';

  const ready = {
    growth: data.compare,
    revenue: seriesReady,
    fleet: data.fleet,
    documents: data.fleet,
    activity: seriesReady && data.funnel && data.heat,
  }[tab];

  return (
    <Shell title="Analytics" subtitle="Growth, revenue, the fleet, its documents, and how people use GaadiPe"
      actions={
        <div className="flex flex-wrap items-center gap-1">
          {usesGrain && Object.entries(GRAINS).map(([key, label]) => (
            <button key={key} type="button" onClick={() => setGrain(key)}
              className={`btn-quiet !px-3 !py-1.5 text-2xs ${grain === key ? '!border-brand !text-brand-deep' : ''}`}>
              {label}
            </button>
          ))}
          <button type="button" className="btn-quiet !px-3 !py-1.5 text-2xs" onClick={() => load(true)}>Refresh</button>
        </div>
      }>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => pick(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${tab === k ? 'border-brand text-brand-deep' : 'border-transparent text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {error ? <Failed error={error} onRetry={() => load(true)} /> : !ready ? <Spinner /> : (
        <div key={tab} className="cv-rise">
          {tab === 'growth' && <Growth data={data.compare} />}
          {tab === 'revenue' && <Revenue rows={rows} grain={grain} />}
          {tab === 'fleet' && <Fleet fleet={data.fleet} />}
          {tab === 'documents' && <Expiry fleet={data.fleet} />}
          {tab === 'activity' && <Activity rows={rows} grain={grain} funnel={data.funnel} heat={data.heat} />}
        </div>
      )}
    </Shell>
  );
}
