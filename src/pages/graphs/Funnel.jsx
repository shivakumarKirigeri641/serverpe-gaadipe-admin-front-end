import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, LabelList } from 'recharts';
import { count } from '../../lib/format';
import { AnimatedGauge } from '../../lib/motion.jsx';
import { SERIES, AXIS, anim, Card, Drill, People, Stats, Gauges, drill } from './kit.jsx';

/*
 * The funnel: people at each step in the period, as horizontal bars from the
 * first "hi" down to "Paid", each with the share that went on from the step
 * before. Click a step: who reached it and went no further.
 */
export default function Funnel({ data, days }) {
  const steps = data.steps.map((s, i, all) => ({
    ...s,
    from_prev: i && all[i - 1].people ? Math.round((s.people / all[i - 1].people) * 100) : null,
  }));
  const first = steps[0]?.people || 0;
  const paid = steps[steps.length - 1]?.people || 0;
  const [step, setStep] = useState(null);
  const [people, setPeople] = useState(null);
  const open = (s) => {
    if (!s?.key || s.key === 'paid') return;
    setStep(s); setPeople(null);
    drill('funnel', { days, step: s.key }).then((x) => setPeople(x.people)).catch(() => setPeople([]));
  };

  const FunnelTip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const s = payload[0].payload;
    return (
      <div className="rounded-xl border border-line bg-white px-3 py-2 text-2xs shadow-lg">
        <div className="font-semibold text-ink">{s.label}</div>
        <div className="text-body"><b className="tabular text-ink">{count(s.people)}</b> people</div>
        {s.from_prev != null && <div className="text-body">{s.from_prev}% of the step before</div>}
        {first > 0 && <div className="text-muted">{Math.round((s.people / first) * 100)}% of everyone who said hi</div>}
        {s.key !== 'paid' && <div className="mt-1 text-[10px] text-muted">Click: who stopped here</div>}
      </div>
    );
  };

  return (
    <>
      <Stats items={[
        ['Said hi', count(first), `in ${data.days} days`],
        ['Paid', count(paid), 'people'],
        ['Hi → paid', first ? `${Math.round((paid / first) * 1000) / 10}%` : '—', 'conversion'],
      ]} />
      {(() => {
        const conv = first ? Math.round((paid / first) * 1000) / 10 : null;
        const top = Math.max(10, Math.ceil(((conv || 0) * 2) / 5) * 5);
        return (
          <Gauges>
            <AnimatedGauge label="Conversion" value={conv} max={top} danger="low" bands={[0.4, 0.2]}
              text={conv == null ? null : `${conv}%`} tone={conv == null ? 'muted' : conv >= top * 0.4 ? 'good' : conv >= top * 0.2 ? 'watch' : 'wrong'}
              caption="Said hi → paid, this period" />
          </Gauges>
        );
      })()}
      <Card title="From hi to paid" note="Different people who reached each step in the period. Click a step to see who stopped there."
        height={340}
        table={{ columns: [['label', 'Step'], ['people', 'People'], ['from_prev', 'From the step before', (v) => (v == null ? '—' : `${v}%`)]], rows: steps }}>
        <BarChart data={steps} layout="vertical" margin={{ top: 4, right: 70, left: 20, bottom: 0 }} barCategoryGap={6} maxBarSize={40}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={150} tick={{ ...AXIS, fill: '#0b1f1c' }} tickLine={false} axisLine={false} />
          <Tooltip content={<FunnelTip />} cursor={{ fill: '#f3f7f6' }} />
          <Bar dataKey="people" radius={[0, 4, 4, 0]} onClick={open} className="cursor-pointer" {...anim()}>
            {steps.map((s, i) => <Cell key={s.key} fill={s.key === 'paid' ? SERIES[2] : SERIES[0]} fillOpacity={s.key === 'paid' ? 1 : 1 - i * 0.08} />)}
            <LabelList dataKey="people" position="right" className="fill-ink text-2xs" formatter={(v) => count(v)} />
          </Bar>
        </BarChart>
      </Card>
      {step && (
        <Drill title={`Reached “${step.label}” and went no further`} onClose={() => setStep(null)} loading={!people}>
          <p className="mb-2 text-2xs text-muted">The latest 100 in the period, each a tap from their journey.</p>
          <People rows={people} />
        </Drill>
      )}
    </>
  );
}
