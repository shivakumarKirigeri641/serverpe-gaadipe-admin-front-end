import { useState } from 'react';
import Shell from '../../components/Shell.jsx';
import { snack } from '../../components/Live.jsx';
import { usePrefs, savePrefs, motionLevel } from '../../lib/motion.jsx';

/**
 * DISPLAY & MOTION (user, 2026-09-25) — this admin's own settings, saved to
 * their account so they follow them to any browser: how much the panel
 * moves, how often screens refresh themselves, and whether charts draw in.
 */
const OPTIONS = {
  motion: [
    ['full', 'Full', 'Numbers count, charts draw, rows slide in — every change shows.'],
    ['reduced', 'Reduced', 'No movement. Fades and colour changes still show what changed.'],
    ['minimal', 'Minimal', 'Nothing animates; every change is instant.'],
  ],
  realtime: [
    ['live', 'Live', 'Screens refresh every few seconds, as each screen needs.'],
    ['30s', 'Every 30 seconds', 'Lighter on the connection.'],
    ['60s', 'Every minute', 'Lighter still.'],
    ['manual', 'Manual', 'Only when you press Refresh in the header.'],
  ],
};

export default function Preferences() {
  const p = usePrefs();
  const [busy, setBusy] = useState(false);
  const set = async (patch) => {
    setBusy(true);
    try { await savePrefs(patch); snack('Saved to your account'); } catch (e) { snack(`Saved in this browser only — ${e.message}`, 'wrong'); } finally { setBusy(false); }
  };
  const os = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const group = (key, title) => (
    <fieldset className="card p-4" disabled={busy}>
      <legend className="sr-only">{title}</legend>
      <h2 className="mb-2 text-sm font-semibold text-ink">{title}</h2>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {OPTIONS[key].map(([v, label, about]) => (
          <label key={v} className={`m-press cursor-pointer rounded-xl border p-3 ${p[key] === v ? 'border-brand bg-brand/5' : 'border-line hover:bg-shell'}`}>
            <span className="flex items-center gap-2"><input type="radio" name={key} checked={p[key] === v} onChange={() => set({ [key]: v })} /><b className="text-sm text-ink">{label}</b></span>
            <span className="mt-1 block text-2xs text-muted">{about}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <Shell title="Display & motion" subtitle="Your own settings — saved to your account">
      <div className="space-y-4">
        {group('motion', 'Motion')}
        {os && <p className="-mt-2 text-2xs text-muted">Your device asks for reduced motion, so the panel moves no more than “Reduced” whatever is chosen here (now: {motionLevel()}).</p>}
        {group('realtime', 'Realtime')}
        <div className="card flex items-center justify-between gap-3 p-4">
          <div><h2 className="text-sm font-semibold text-ink">Chart animation</h2><p className="text-2xs text-muted">Charts draw in the first time they appear. Updates never replay the whole drawing.</p></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.charts} disabled={busy} onChange={(e) => set({ charts: e.target.checked })} /> {p.charts ? 'On' : 'Off'}</label>
        </div>
      </div>
    </Shell>
  );
}
