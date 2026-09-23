import { useState } from 'react';
import Tickets from './Tickets.jsx';
import Feedback from './Feedback.jsx';

/**
 * CONVERSATIONS (user, 2026-09-23).
 *
 * Support tickets and feedback were two nav entries, checked separately, each
 * easy to forget. They are the same job — somebody said something and may be
 * waiting — so they are one screen with two tabs.
 *
 * TICKETS FIRST, because a ticket is a question with a person behind it, while
 * feedback is usually an opinion nobody is waiting on.
 *
 * Each tab is the page that already existed, unchanged. The tab strip is
 * handed to that page, which passes it to its own Shell — so the tabs sit
 * under the header where they belong rather than floating over the sidebar.
 */
const TABS = [['tickets', 'Support tickets'], ['feedback', 'Feedback']];

export default function Conversations() {
  const [tab, setTab] = useState('tickets');
  const Page = tab === 'tickets' ? Tickets : Feedback;
  return <Page tabs={<TabStrip tabs={TABS} active={tab} onPick={setTab} />} />;
}

export function TabStrip({ tabs, active, onPick }) {
  return (
    <div className="flex gap-1">
      {tabs.map(([id, label]) => (
        <button key={id} onClick={() => onPick(id)}
          className={`-mb-px border-b-2 px-4 py-2.5 text-sm transition ${
            active === id
              ? 'border-brand font-semibold text-ink'
              : 'border-transparent text-muted hover:text-ink'}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
