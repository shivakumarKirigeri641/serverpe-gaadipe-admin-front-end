import { useState } from 'react';
import PhoneNotifications from '../../components/PhoneNotifications.jsx';
import Shell from '../../components/Shell.jsx';
import { snack, setActivityPopups, celebrate } from '../../components/Live.jsx';
import { usePrefs, savePrefs, motionLevel } from '../../lib/motion.jsx';
import { chime, soundOn, setSound } from '../../lib/sound';

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
  const [sound, setSoundState] = useState(soundOn);
  const [pops, setPops] = useState(() => { try { return localStorage.getItem('gp.pop.activity.off') !== '1'; } catch { return true; } });
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
        <PhoneNotifications />
        {group('motion', 'Motion')}
        {os && <p className="-mt-2 text-2xs text-muted">Your device asks for reduced motion, so the panel moves no more than “Reduced” whatever is chosen here (now: {motionLevel()}).</p>}
        {group('realtime', 'Realtime')}
        <div className="card flex items-center justify-between gap-3 p-4">
          <div><h2 className="text-sm font-semibold text-ink">Chart animation</h2><p className="text-2xs text-muted">Charts draw in the first time they appear. Updates never replay the whole drawing.</p></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.charts} disabled={busy} onChange={(e) => set({ charts: e.target.checked })} /> {p.charts ? 'On' : 'Off'}</label>
        </div>
        <div className="card flex items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Pop-ups when someone says hi or checks a vehicle</h2>
            <p className="text-2xs text-muted">A small note in the corner that goes by itself in six seconds. Payments (with a celebration 🎉) and alerts always pop up. This browser only.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pops} onChange={(e) => { setActivityPopups(e.target.checked); setPops(e.target.checked); snack(e.target.checked ? 'Hi & check pop-ups on' : 'Hi & check pop-ups off'); }} />
            {pops ? 'On' : 'Off'}
          </label>
        </div>
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">Pop-up sounds</h2>
            <p className="text-2xs text-muted">A chime with each pop-up: a bright one for payments, a firmer one for alerts, a soft one for hi and checks. Browsers play sound only after you click once on the page. This browser only.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[['payment', '🎉 Payment'], ['alert', '⚠️ Alert', 'critical'], ['recovered', '✅ Recovered'], ['hi', '👋 Hi']].map(([kind, label, severity]) => (
                <button key={kind} type="button" className="btn-quiet !px-2.5 !py-1 text-2xs" onClick={() => chime({ kind, severity }, { force: true })}>▶ {label}</button>
              ))}
              <button type="button" className="btn-quiet !px-2.5 !py-1 text-2xs" onClick={() => celebrate(100)}>▶ 🎉 100 customers</button>
              <button type="button" className="btn-quiet !px-2.5 !py-1 text-2xs" onClick={() => celebrate(1000)}>▶ 🏆 1,000 customers</button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sound} onChange={(e) => { setSound(e.target.checked); setSoundState(e.target.checked); snack(e.target.checked ? 'Sounds on' : 'Sounds off'); if (e.target.checked) chime({ kind: 'recovered' }, { force: true }); }} />
            {sound ? 'On' : 'Off'}
          </label>
        </div>
      </div>
    </Shell>
  );
}
