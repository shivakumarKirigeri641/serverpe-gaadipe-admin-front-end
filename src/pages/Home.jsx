import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { chartAnim } from '../lib/motion.jsx';
import { api } from '../lib/api';
import { count, rupees } from '../lib/format';
import Shell from '../components/Shell.jsx';
import { Chip, Failed, Hint, SkeletonCards } from '../components/ui.jsx';
import { TOOLTIP, AXIS } from './analytics/kit.jsx';

/**
 * HOME (user, 2026-09-23).
 *
 * The panel had three overviews and none of them answered what a person opens
 * a panel to ask: is anything wrong, and is anyone waiting on me? So this page
 * answers that first and the numbers second.
 *
 * NEEDS YOU comes before everything, ordered by what it costs to ignore —
 * money that did not arrive, then a customer waiting, then a setting quietly
 * wrong. Each row goes straight to the screen that fixes it. "Nothing needs
 * you" is a real answer and the page says it plainly.
 *
 * The rest is deliberately small: five numbers against yesterday, today's
 * funnel, and a fortnight's shape. Anything deeper is Analytics, which is
 * built for reading rather than glancing.
 */
const LEVEL = { wrong: 'wrong', watch: 'watch', info: 'info' };

export default function Home() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => { setError(null); api.home().then(setData).catch(setError); }, []);
  useEffect(load, [load]);
  // The numbers move during the day; a minute is often enough to be useful.
  useEffect(() => {
    const t = setInterval(() => api.home().then(setData).catch(() => {}), 60000);
    return () => clearInterval(t);
  }, []);

  if (error && !data) return <Shell title="Home"><Failed error={error} onRetry={load} /></Shell>;
  if (!data) {
    return (
      <Shell title="Home" subtitle="What needs you, and how today is going.">
        <div className="card skeleton h-24" />
        <div className="mt-4"><SkeletonCards n={5} /></div>
      </Shell>
    );
  }

  const t = data.today;
  const most = Math.max(1, ...data.funnel.map((f) => f.n));

  return (
    <Shell title="Home" subtitle="What needs you, and how today is going."
      actions={<LiveNow live={data.live} />}>

      {/* ───────────────────────────────── what needs a person ── */}
      {data.attention.length === 0 ? (
        <div className="card flex items-center gap-3 p-5">
          <span className="text-2xl">✅</span>
          <div>
            <div className="text-sm font-semibold text-ink">Nothing needs you</div>
            <div className="text-2xs text-muted">No stuck payments, no unanswered customers, nothing misconfigured.</div>
          </div>
        </div>
      ) : (
        <div className="card divide-y divide-line">
          <div className="px-5 py-3 text-sm font-semibold text-ink">Needs you</div>
          {data.attention.map((a, i) => (
            <Link key={i} to={a.to}
              className={`row-hover rise flex items-start gap-3 px-5 py-3 hover:bg-shell ${
                i < 4 ? `rise-${i + 1}` : ''}`}>
              <Chip tone={LEVEL[a.level] || 'info'} note={
                a.level === 'wrong' ? 'Costs money or a customer if it waits. Do this one first.'
                  : a.level === 'watch' ? 'Worth doing today, but nothing breaks if it waits.'
                  : 'Nothing is wrong. This is a setting you chose, shown so it is not forgotten.'}>
                {a.level === 'wrong' ? 'Fix' : a.level === 'watch' ? 'Soon' : 'FYI'}
              </Chip>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">{a.title}</div>
                <div className="text-2xs text-muted">{a.detail}</div>
              </div>
              <span className="ml-auto self-center text-muted">→</span>
            </Link>
          ))}
        </div>
      )}

      {/* ───────────────────────────────────────────── today ── */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Number label="New customers" now={t.signed_up} before={t.signed_up_before} delay={1}
          note="People who wrote to GaadiPe on WhatsApp for the first time today, in India's day. Someone who wrote before is not counted again." />
        <Number label="Checks" now={t.checks} before={t.checks_before} delay={2}
          note="Vehicle lookups today — not people. One person checking four plates is four checks." />
        <Number label="Paid" now={t.paid} before={t.paid_before} delay={3}
          note="Payments that actually completed today. A payment started and abandoned is not here; it is under Needs you." />
        <Number label="Earned" now={t.earned_paise} before={t.earned_before_paise} money delay={4}
          note="Money received today, GST included — this is what the customer paid, not what GaadiPe keeps." />
        <Number label="Being monitored" now={t.monitoring} flat
          note="Vehicles with monitoring still running. It ends 28 days after each payment unless they renew."
          sub={`${count(t.customers)} customers · ${count(t.vehicles)} vehicles`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Today's funnel: the shape matters more than the numbers. */}
        <div className="card rise rise-1 p-5">
          <div className="text-sm font-semibold text-ink">How far people got today</div>
          <p className="mt-0.5 text-2xs text-muted">On WhatsApp, one person per number. Where they stop is where the money is.</p>
          <div className="mt-4 space-y-2">
            {data.funnel.map((f, i) => (
              <Hint key={f.step} note={FUNNEL_NOTE[f.step]} className="block">
                <div className="row-hover flex items-center gap-3 rounded px-1 py-0.5 hover:bg-shell">
                  <div className="w-36 shrink-0 text-2xs text-muted">{f.step}</div>
                  <div className="h-6 flex-1 rounded bg-shell">
                    {/* Grows to width as the screen settles: the shape of the
                        drop-off is the point, and a bar that grows shows it. */}
                    <div className="h-6 rounded bg-brand/80"
                      style={{
                        width: `${Math.max(f.n / most * 100, f.n ? 4 : 0)}%`,
                        transition: 'width .5s cubic-bezier(.2,.7,.3,1)',
                        transitionDelay: `${i * 70}ms`,
                      }} />
                  </div>
                  <div className="tabular w-8 shrink-0 text-right text-sm font-semibold text-ink">{f.n}</div>
                </div>
              </Hint>
            ))}
          </div>
        </div>

        {/* A fortnight, so a bad day reads as a bad day and not a trend. */}
        <div className="card rise rise-2 p-5">
          <div className="text-sm font-semibold text-ink">The last two weeks</div>
          <p className="mt-0.5 text-2xs text-muted">New customers and checks, day by day.</p>
          <div className="mt-3 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.recent} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef3f2" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={2} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...TOOLTIP} />
                <Area {...chartAnim()} type="monotone" dataKey="checks" name="Checks" stroke="#0d9488" fill="#0d9488" fillOpacity={0.15} />
                <Area {...chartAnim()} type="monotone" dataKey="signed_up" name="New customers" stroke="#0b4f4a" fill="#0b4f4a" fillOpacity={0.12} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Payments are rare enough that a bar per day reads better than a line. */}
      <div className="card rise rise-3 mt-4 p-5">
        <div className="text-sm font-semibold text-ink">Payments, day by day</div>
        <div className="mt-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.recent} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef3f2" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval={2} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip {...TOOLTIP} />
              <Bar {...chartAnim()} dataKey="paid" name="Paid" fill="#0d9488" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Shell>
  );
}

/** A number, and whether it is better or worse than the day before. */
function Number({ label, now, before, money = false, flat = false, sub, note, delay = 0 }) {
  // Money keeps its paise and wears its sign in front of the symbol: "-₹10.62",
  // never "₹-11", which reads as a price and rounds away what changed.
  const show = (v) => (money ? `${v < 0 ? '-' : ''}₹${(Math.abs(v) / 100).toFixed(Math.abs(v) % 100 ? 2 : 0)}` : count(v));
  const diff = flat || before === undefined ? null : now - before;
  const card = (
    <div className={`card rise p-4 ${delay ? `rise-${delay}` : ''}`}>
      <div className="text-2xs uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-1 text-xl font-bold text-ink">{show(now)}</div>
      {sub && <div className="mt-0.5 text-2xs text-muted">{sub}</div>}
      {diff !== null && (
        <div className={`mt-0.5 text-2xs ${diff > 0 ? 'text-good-700' : diff < 0 ? 'text-wrong-700' : 'text-muted'}`}>
          {diff === 0 ? 'same as yesterday' : `${diff > 0 ? '+' : ''}${show(diff)} vs yesterday`}
        </div>
      )}
    </div>
  );
  return note ? <Hint note={note} className="block">{card}</Hint> : card;
}

/** What each funnel step actually counts. */
const FUNNEL_NOTE = {
  'Said Hi': 'Wrote to GaadiPe on WhatsApp today and were shown the terms.',
  'Agreed to terms': 'Tapped Agree & continue.',
  'Checked a vehicle': 'Sent a number and got the basic details back.',
  'Tapped full report': 'Tapped the ₹19 full report button. This is the step most people never reach.',
  'Got payment link': 'Were sent the payment link.',
  'Paid': 'Money actually received.',
};

/**
 * Who is here right now.
 *
 * The chat comes first when WhatsApp is on, because that is where the
 * conversation happens; the website when it is not. It says which, rather than
 * showing a zero that could mean either "nobody" or "not switched on".
 */
function LiveNow({ live }) {
  return (
    <Hint note={live.whatsapp_on
      ? 'People in a WhatsApp conversation in the last half hour, and on the website in the last five minutes.'
      : 'People on the website in the last five minutes. WhatsApp is switched off, so nobody can be in a chat.'}>
    <Link to="/live" className="lift flex items-center gap-3 rounded-lg border border-line bg-white px-3 py-1.5">
      <span className="relative flex h-2 w-2">
        <span className={`absolute inline-flex h-2 w-2 rounded-full ${
          live.on_site || live.in_chat ? 'animate-ping bg-good-500/60' : 'bg-line'}`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${
          live.on_site || live.in_chat ? 'bg-good-500' : 'bg-line'}`} />
      </span>
      <span className="text-2xs text-body">
        {live.whatsapp_on
          ? <>{count(live.in_chat)} in chat · {count(live.on_site)} on site</>
          : <>{count(live.on_site)} on site · <span className="text-muted">chat off</span></>}
      </span>
    </Link>
    </Hint>
  );
}
