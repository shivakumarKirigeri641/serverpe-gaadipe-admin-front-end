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
 * WHATSAPP FIRST (user, 2026-09-25). It opened on Email while GaadiPe had no
 * WhatsApp number; the chat is the product now, so the WhatsApp broadcast is
 * what this screen is for and Email is the second tab. (It was easy to miss:
 * "where is Broadcast?" was answered by a tab nobody saw.)
 */
const TABS = [['whatsapp', 'WhatsApp broadcast'], ['email', 'Email']];

export default function Campaigns() {
  const [tab, setTab] = useState('whatsapp');
  const Page = tab === 'email' ? CustomerEmails : Broadcast;
  return <Page tabs={<TabStrip tabs={TABS} active={tab} onPick={setTab} />} />;
}
