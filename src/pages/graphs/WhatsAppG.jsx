import { useState } from 'react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import { count } from '../../lib/format';
import { SERIES, AXIS, GRID, anim, Card, Tip, Drill, Stats, drill, dayLabel, rupeeAxis, inr, sumOf } from './kit.jsx';

/*
 * WhatsApp: messages in and out per day (replies inside the 24-hour window are
 * free; templates are what Meta bills), what templates cost by category, and
 * how many people wrote. A click on a day lists its messages by type.
 */
export default function WhatsAppG({ data }) {
  const s = data.series;
  const [day, setDay] = useState(null);
  const [kinds, setKinds] = useState(null);
  const open = (e) => {
    const d = e?.activeLabel; if (!d) return;
    setDay(d); setKinds(null);
    drill('whatsapp', { day: d }).then((x) => setKinds(x.kinds)).catch(() => setKinds([]));
  };
  const xProps = { dataKey: 'd', tickFormatter: dayLabel, tick: AXIS, tickLine: false, axisLine: false, minTickGap: 16 };
  const table = (cols) => ({ columns: [['d', 'Day', dayLabel], ...cols], rows: [...s].reverse() });
  const cost = sumOf(s, 'marketing') + sumOf(s, 'utility') + sumOf(s, 'other');

  return (
    <>
      <Stats items={[
        ['Messages in', count(sumOf(s, 'inbound')), `in ${data.days} days`],
        ['Replies', count(sumOf(s, 'replies')), 'free, in the window'],
        ['Templates', count(sumOf(s, 'templates')), 'billed by Meta'],
        ['Template cost', inr(cost), 'estimate'],
        ['Meta limit', count(data.limit), 'people / 24 h'],
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2" title="Messages in and out" note="Customers' messages, the bot's replies and templates, per day. Click a day for its message types."
          legend={[['In', SERIES[0]], ['Replies', SERIES[2]], ['Templates', SERIES[1]]]}
          table={table([['inbound', 'In'], ['replies', 'Replies'], ['templates', 'Templates']])} height={260}>
          <BarChart data={s} onClick={open} margin={{ top: 4, right: 8, left: -12, bottom: 0 }} barGap={2}>
            <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={dayLabel} />} cursor={{ fill: '#f3f7f6' }} />
            <Bar dataKey="inbound" name="In" fill={SERIES[0]} radius={[4, 4, 0, 0]} {...anim()} />
            <Bar dataKey="replies" name="Replies" stackId="out" fill={SERIES[2]} stroke="#fff" strokeWidth={1} {...anim()} />
            <Bar dataKey="templates" name="Templates" stackId="out" fill={SERIES[1]} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} {...anim()} />
          </BarChart>
        </Card>
        <Card title="What templates cost" note="Per day by Meta category, at the rates in Settings — an estimate until Meta's invoice."
          legend={[['Marketing', SERIES[1]], ['Utility', SERIES[0]], ['Other', SERIES[6]]]}
          table={table([['marketing', 'Marketing', inr], ['utility', 'Utility', inr], ['other', 'Other', inr]])}>
          <BarChart data={s} onClick={open} margin={{ top: 4, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis tickFormatter={rupeeAxis} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={dayLabel} fmt={inr} total="All templates" />} cursor={{ fill: '#f3f7f6' }} />
            <Bar dataKey="utility" name="Utility" stackId="c" fill={SERIES[0]} stroke="#fff" strokeWidth={1} {...anim()} />
            <Bar dataKey="marketing" name="Marketing" stackId="c" fill={SERIES[1]} stroke="#fff" strokeWidth={1} {...anim()} />
            <Bar dataKey="other" name="Other" stackId="c" fill={SERIES[6]} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} {...anim()} />
          </BarChart>
        </Card>
        <Card title="People who wrote" note="Different people who messaged the bot each day." table={table([['people', 'People']])}>
          <AreaChart data={s} onClick={open} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid {...GRID} /><XAxis {...xProps} /><YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<Tip title={dayLabel} />} cursor={{ stroke: '#c9d6d4' }} />
            <Area type="monotone" dataKey="people" name="People" stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.12} activeDot={{ r: 5 }} {...anim()} />
          </AreaChart>
        </Card>
      </div>
      {day && (
        <Drill title={`${dayLabel(day)} — messages by type`} onClose={() => setDay(null)} loading={!kinds}>
          {!kinds?.length ? <p className="text-2xs text-muted">No messages that day.</p> : (
            <Card title="By type" note="In and out, by message type and template." height={Math.max(160, kinds.length * 24)}
              table={{ columns: [['direction', 'Way'], ['kind', 'Type'], ['n', 'Messages']], rows: kinds }}>
              <BarChart data={kinds.map((k) => ({ ...k, label: `${k.direction === 'in' ? '↓ In' : '↑ Out'} · ${k.kind}` }))} layout="vertical" margin={{ top: 4, right: 40, left: 10, bottom: 0 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={260} tick={{ ...AXIS, fill: '#0b1f1c' }} tickLine={false} axisLine={false} />
                <Tooltip content={<Tip title={(l) => l} />} cursor={{ fill: '#f3f7f6' }} />
                <Bar dataKey="n" name="Messages" fill={SERIES[0]} radius={[0, 4, 4, 0]} {...anim()}>
                  <LabelList dataKey="n" position="right" className="fill-ink text-2xs" />
                </Bar>
              </BarChart>
            </Card>
          )}
        </Drill>
      )}
    </>
  );
}
