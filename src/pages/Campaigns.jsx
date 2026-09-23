import { useState } from 'react';
import CustomerEmails from './CustomerEmails.jsx';
import Broadcast from './Broadcast.jsx';
import { TabStrip } from './Conversations.jsx';

/**
 * CAMPAIGNS (user, 2026-09-23).
 *
 * Customer emails and WhatsApp broadcasts were two nav entries doing one job:
 * saying something to a group of customers. One screen now, with the channel
 * as a tab, so "who am I about to write to" is asked once rather than twice in
 * two different shapes.
 *
 * EMAIL FIRST, because it is the channel that works today — GaadiPe has no
 * WhatsApp number yet, and the WhatsApp tab says so rather than pretending.
 */
const TABS = [['email', 'Email'], ['whatsapp', 'WhatsApp']];

export default function Campaigns() {
  const [tab, setTab] = useState('email');
  const Page = tab === 'email' ? CustomerEmails : Broadcast;
  return <Page tabs={<TabStrip tabs={TABS} active={tab} onPick={setTab} />} />;
}
