import { useParams, Navigate } from 'react-router-dom';
import Shell from '../../components/Shell.jsx';
import { useGraph, Range, Body } from './kit.jsx';
import Overview from './Overview.jsx';
import Funnel from './Funnel.jsx';
import Money from './Money.jsx';
import CustomersG from './CustomersG.jsx';
import VehiclesG from './VehiclesG.jsx';
import WhatsAppG from './WhatsAppG.jsx';
import Services from './Services.jsx';
import TodayLive from './TodayLive.jsx';

/**
 * THE GRAPHS SECTION (user, 2026-10-03): everything GaadiPe counts, drawn —
 * one page per subject, the period chosen once (7 / 30 / 90 days, remembered),
 * kept current by the Realtime setting, every mark with its tooltip and a
 * click for the level below. Back end: src/admin/graphs.js.
 */
const PAGES = {
  // Today, live (user, 2026-10-06): its own window and a minute's refresh, so no period picker.
  today: ['Today live', 'Customers, checks found or failed, ₹19 taps and paid reports — minute by minute, updated every minute', TodayLive],
  overview: ['Overview', 'Customers, checks, full reports and revenue, day by day', Overview],
  funnel: ['Funnel', 'From the first “hi” to a paid report — and who stopped where', Funnel],
  money: ['Money', 'Revenue and where it goes — GST, gateway, APIs, WhatsApp, ads', Money],
  customers: ['Customers', 'New and returning, where they came from, STOP and why', CustomersG],
  vehicles: ['Vehicles', 'Which vehicles are checked — state, RTO, type, fuel, make — and what is expiring', VehiclesG],
  whatsapp: ['WhatsApp', 'Messages in and out, and what templates cost', WhatsAppG],
  services: ['Services', 'The outside APIs — calls answered and failed, speed, RC backup spend', Services],
};

export default function Graphs() {
  const { page } = useParams();
  if (!PAGES[page]) return <Navigate to="/graphs/overview" replace />;
  if (page === 'today') {
    const [title, subtitle] = PAGES.today;
    return <Shell title={`Graphs · ${title}`} subtitle={subtitle}><TodayLive /></Shell>;
  }
  return <Page key={page} page={page} />;
}

function Page({ page }) {
  const [title, subtitle, View] = PAGES[page];
  const g = useGraph(page);
  return (
    <Shell title={`Graphs · ${title}`} subtitle={subtitle} actions={<Range days={g.days} setDays={g.setDays} />}>
      <Body data={g.data} error={g.error} reload={g.reload}>
        <View data={g.data} days={g.days} />
      </Body>
    </Shell>
  );
}
