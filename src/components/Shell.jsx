import { NavLink, Link, useLocation } from 'react-router-dom';
import { useLayoutEffect, useRef, useState } from 'react';
import { ConnectionStatus, RefreshButton } from './HeaderStatus.jsx';
import { Hint } from './ui.jsx';
import { onBusyChange } from '../lib/api';
import { useSession, allowed } from '../lib/session';
import { BusyBar } from './ui.jsx';
import { useLive, Toasts } from './Live.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import Notifications from './Notifications.jsx';

/*
 * The frame every screen sits in: a fixed sidebar on a desk, a drawer on a
 * phone, and a slim top bar that only says where you are and who you are.
 *
 * THE NAVIGATION LISTS WHAT EXISTS. Items appear as their screen and its API
 * are built — a menu full of dead links is how an admin panel loses the trust
 * of the person using it. `soon` draws an item as a disabled label instead, so
 * the shape of what is coming is visible without pretending.
 *
 * AND ONLY WHAT YOU MAY OPEN. `cap` is the capability the screen's API demands;
 * an item the role lacks is not drawn at all.
 */
/*
 * THE SIDEBAR (user, 2026-09-25, operations module §42): Dashboard,
 * Customers, Vehicles, WhatsApp, Reports, Payments, Analytics, Technical,
 * Operations, Finance, System. Every screen the panel had keeps a place.
 * Referrals is not a group: GaadiPe has no referral programme for now.
 * Groups fold; which are folded is remembered in this browser, and the group
 * holding the open screen always shows.
 */
const view = (v) => (p, s) => p === '/vehicles' && new URLSearchParams(s).get('view') === v;
const NAV = [
  {
    group: 'Dashboard',
    items: [
      { to: '/', label: 'Business Health', end: true, icon: HeartIcon, cap: 'dashboard.view' },
      { to: '/command', label: 'Live Command Center', icon: GridIcon },
      { to: '/activity', label: 'Live activity', icon: PulseIcon, cap: 'dashboard.view' },
      { to: '/overview', label: 'Overview', icon: ListIcon },
      { to: '/live', label: 'Live chats', icon: LifebuoyIcon },
      { to: '/where', label: 'Where', icon: CarIcon },
    ],
  },
  {
    group: 'Customers',
    items: [
      { to: '/customers', label: 'Customers', icon: UsersIcon },
      { to: '/journey', label: 'Customer journeys', icon: PulseIcon },
      { to: '/customer-intelligence', label: 'Customer intelligence', icon: UsersIcon, cap: 'customers.view' },
      { to: '/retention', label: 'Retention & repeat', icon: ChartIcon, cap: 'customers.view' },
    ],
  },
  {
    group: 'Vehicles',
    items: [
      { to: '/vehicles', label: 'Vehicle Explorer', icon: CarIcon, cap: 'vehicles.view', badge: 'vehicles',
        match: (p, s) => (p === '/vehicles' && !/[?&](view|list)=/.test(s))
          || (/^\/vehicles\/[^/]+$/.test(p) && !/^\/vehicles\/(lists|insights|api-logs)$/.test(p)) },
      { to: '/vehicles?view=recent', label: 'Recent vehicles', icon: PulseIcon, cap: 'vehicles.view', match: view('recent') },
      { to: '/vehicles?view=expired', label: 'Expired documents', icon: DocIcon, cap: 'vehicles.view', match: view('expired') },
      { to: '/vehicles?view=challans', label: 'Challans', icon: BookIcon, cap: 'vehicles.view', match: view('challans') },
      { to: '/vehicles/lists', label: 'Saved vehicles', icon: StarIcon, cap: 'vehicles.view',
        match: (p, s) => p === '/vehicles/lists' || (p === '/vehicles' && /[?&]list=/.test(s)) },
      ...[['paid', 'Paid reports', RupeeIcon], ['unpaid', 'Unpaid lookups', SearchIcon], ['whatsapp', 'WhatsApp vehicles', SendIcon],
        ['web', 'Web vehicles', DoorIcon], ['blacklisted', 'Blacklisted vehicles', ShieldIcon], ['loan', 'Loan / hypothecation', KeyIcon]]
        .map(([v, label, icon]) => ({ to: `/vehicles?view=${v}`, label, icon, cap: 'vehicles.view', match: view(v) })),
      { to: '/vehicles/insights', label: 'Patterns & signals', icon: ChartIcon, cap: 'vehicles.view' },
      { to: '/lookups', label: 'Vehicle lookups', icon: SearchIcon },
      { to: '/check', label: 'Check a vehicle', icon: SearchIcon, cap: 'lookup' },
    ],
  },
  {
    group: 'WhatsApp',
    items: [
      { to: '/whatsapp', label: 'WhatsApp Command Center', end: true, icon: SendIcon, badge: 'whatsapp' },
      { to: '/conversations', label: 'Conversations', icon: LifebuoyIcon },
      { to: '/whatsapp/operations', label: 'Message analytics & cost', icon: RupeeIcon, cap: 'dashboard.view' },
      { to: '/campaigns', label: 'Campaigns', icon: SendIcon },
    ],
  },
  {
    group: 'Reports',
    items: [
      { to: '/documents', label: 'Reports', icon: DocIcon },
      { to: '/reports/delivery', label: 'Delivery status', icon: SendIcon, cap: 'dashboard.view' },
      { to: '/free-reports', label: 'Free reports', icon: GiftIcon },
    ],
  },
  {
    group: 'Payments',
    items: [
      { to: '/payments', label: 'Transactions', end: true, icon: RupeeIcon, cap: 'money', badge: 'payments' },
      { to: '/payments/reconciliation', label: 'Payment reconciliation', icon: ShieldIcon, cap: 'payments.view' },
      { to: '/payments/abandoned', label: 'Abandoned payments', icon: DoorIcon, cap: 'payments.view' },
      { to: '/payments/refunds', label: 'Refunds', icon: RupeeIcon, cap: 'payments.view' },
      { to: '/payments/failures', label: 'Payment funnel & failures', icon: ChartIcon, cap: 'payments.view' },
    ],
  },
  {
    group: 'Analytics',
    items: [
      { to: '/analytics', label: 'Website analytics', icon: ChartIcon },
      { to: '/attribution', label: 'Campaigns & attribution', icon: SendIcon, cap: 'customers.view' },
      { to: '/drop-off', label: 'Conversion funnel', icon: ChartIcon },
      { to: '/profitability', label: 'Revenue', icon: RupeeIcon, cap: 'finance.view',
        match: (p, s) => p === '/profitability' && new URLSearchParams(s).get('tab') !== 'transactions' },
      { to: '/profitability?tab=transactions', label: 'Profitability', icon: ListIcon, cap: 'finance.view',
        match: (p, s) => p === '/profitability' && new URLSearchParams(s).get('tab') === 'transactions' },
    ],
  },
  {
    group: 'Technical',
    items: [
      { to: '/api-monitor', label: 'API monitor', icon: PulseIcon },
      { to: '/api-providers', label: 'API providers', icon: ChartIcon, cap: 'api.view' },
      { to: '/vehicles/api-logs', label: 'API request log', icon: ListIcon, cap: 'api.view' },
      { to: '/data-quality', label: 'Data quality', icon: ShieldIcon, cap: 'api.view' },
      { to: '/jobs', label: 'Jobs', icon: ListIcon, cap: 'system.view' },
      { to: '/health', label: 'System health', icon: HeartIcon },
      { to: '/infrastructure', label: 'Infrastructure', icon: CogIcon, cap: 'system.view' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/alerts', label: 'Alerts', icon: BellIcon, badge: 'alerts' },
      { to: '/alert-rules', label: 'Alert rules', icon: BellIcon, cap: 'dashboard.view' },
      { to: '/tasks', label: 'Tasks', icon: ListIcon, cap: 'dashboard.view' },
      { to: '/notes', label: 'Admin notes', icon: BookIcon, cap: 'dashboard.view' },
      { to: '/exports', label: 'Exports', icon: DocIcon, cap: 'dashboard.view' },
      { to: '/blocks', label: 'Blocked', icon: ShieldIcon },
      { to: '/security', label: 'Security', icon: ShieldIcon },
      // Website logins: kept, but not where customers are while GaadiPe is WhatsApp-first.
      { to: '/sign-ins', label: 'Website sign-ins', icon: DoorIcon },
    ],
  },
  {
    group: 'Finance',
    items: [
      { to: '/finance', label: 'Finance summary', icon: RupeeIcon, cap: 'money' },
      { to: '/finance/export', label: 'GST / accounting export', icon: DocIcon, cap: 'finance.export' },
    ],
  },
  {
    group: 'System',
    items: [
      { to: '/configuration', label: 'Configuration', icon: RupeeIcon, cap: 'settings.manage' },
      { to: '/flags', label: 'Feature flags', icon: KeyIcon, cap: 'dashboard.view' },
      { to: '/settings', label: 'Prices & settings', icon: CogIcon, cap: 'settings' },
      { to: '/policies', label: 'Policies & terms', icon: BookIcon, cap: 'settings' },
      { to: '/people', label: 'Admin users', icon: KeyIcon, cap: 'admins' },
      { to: '/permissions', label: 'Permissions', icon: ShieldIcon, cap: 'audit.view' },
      { to: '/audit', label: 'Audit logs', icon: ListIcon, cap: 'audit.view' },
      { to: '/backups', label: 'Backup / recovery', icon: ShieldIcon, cap: 'system.view' },
      { to: '/preferences', label: 'Display & motion', icon: CogIcon },
      // Owner only, and only while Settings → admin_report_access_enabled is on.
      { to: '/report-access', label: 'Report access ⚠️', icon: KeyIcon, cap: 'report_access' },
    ],
  },
];

/* The count beside a menu item (phase 6): people on WhatsApp now, open alerts
   (red when one is critical), payments in progress. Nothing when zero. */
function Badge({ kind, b }) {
  if (!b) return null;
  const [n, text, tone] = {
    whatsapp: [b.whatsapp_live, `${b.whatsapp_live} live`, 'bg-good-50 text-good-700'],
    alerts: [b.alerts_open, String(b.alerts_open), b.alerts_critical ? 'bg-wrong-500 text-white' : 'bg-watch-50 text-watch-700'],
    payments: [b.payments_pending, `${b.payments_pending} pending`, 'bg-shell text-body'],
    vehicles: [b.vehicles_today, `${b.vehicles_today} today`, 'bg-brand/10 text-brand-deep'],
  }[kind] || [0];
  return n ? <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>{text}</span> : null;
}

/* "Updating…" beside the title — only while a request is running, after 300 ms. */
function Updating() {
  const [on, setOn] = useState(false);
  useLayoutEffect(() => {
    let t;
    return onBusyChange((b) => { clearTimeout(t); if (b > 0) t = setTimeout(() => setOn(true), 300); else setOn(false); });
  }, []);
  return on ? <span className="m-fade text-2xs font-normal text-muted" role="status">Updating…</span> : null;
}

/*
 * Remembered between screens (each screen draws its own Shell): where the
 * sidebar was scrolled, where the active marker sat — so it glides from the
 * last item to the new one — and whether the sidebar is collapsed.
 */
const navMemory = { scroll: 0, marker: null };
const readCollapsed = () => { try { return localStorage.getItem('gp.nav.collapsed') === '1'; } catch { return false; } };

export default function Shell({ title, subtitle, actions, tabs, children }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggleCollapsed = () => setCollapsed((c) => { try { localStorage.setItem('gp.nav.collapsed', c ? '0' : '1'); } catch { /* private */ } return !c; });
  const asideRef = useRef(null);
  const navRef = useRef(null);
  const [marker, setMarker] = useState(navMemory.marker);
  const { me, can, signOut } = useSession();
  const { badges } = useLive();
  const [open, setOpen] = useState(false);
  const { pathname, search } = useLocation();
  // Folded groups, remembered in this browser.
  const [folded, setFolded] = useState(() => { try { return JSON.parse(localStorage.getItem('gp.nav.folded') || '[]'); } catch { return []; } });
  const fold = (g) => setFolded((f) => {
    const next = f.includes(g) ? f.filter((x) => x !== g) : [...f, g];
    try { localStorage.setItem('gp.nav.folded', JSON.stringify(next)); } catch { /* private window */ }
    return next;
  });
  const isOn = (item) => (item.match ? item.match(pathname, search) : (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)));

  // Restore the sidebar's scroll, then slide the marker to the active item.
  useLayoutEffect(() => {
    if (asideRef.current) asideRef.current.scrollTop = navMemory.scroll;
  }, []);
  useLayoutEffect(() => {
    const el = navRef.current?.querySelector('[data-active="1"]');
    const next = el ? { top: el.offsetTop, height: el.offsetHeight } : null;
    const raf = requestAnimationFrame(() => { setMarker(next); navMemory.marker = next; });
    return () => cancelAnimationFrame(raf);
  }, [pathname, search, collapsed, folded]);

  return (
    <div className="min-h-screen lg:flex">
      <BusyBar />

      <aside ref={asideRef} onScroll={(e) => { navMemory.scroll = e.currentTarget.scrollTop; }}
        className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 overflow-y-auto overflow-x-hidden border-r border-line bg-white transition-[width,transform] duration-200 ease-out lg:static lg:translate-x-0 ${collapsed ? 'lg:w-16' : 'lg:w-60'} ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand text-xs font-bold text-white">GP</span>
          <div className={`leading-tight transition-opacity duration-150 ${collapsed ? 'lg:pointer-events-none lg:opacity-0' : ''}`}>
            <div className="text-sm font-semibold text-ink">GaadiPe</div>
            <div className="text-2xs text-muted">Admin</div>
          </div>
          <Hint note={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar to icons'}>
            <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="m-press ml-auto hidden h-7 w-7 place-items-center rounded-md text-muted hover:bg-shell hover:text-ink lg:grid">
              <span className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}>‹</span>
            </button>
          </Hint>
        </div>

        <nav ref={navRef} className="relative px-3 py-4">
          {/* The active marker: one bar that glides to whichever item is open. */}
          {marker && <span aria-hidden="true" className="absolute left-1 w-1 rounded-full bg-brand transition-all duration-300 ease-out"
            style={{ top: marker.top + 6, height: Math.max(0, marker.height - 12) }} />}
          {NAV.map((section) => {
            const items = section.items.filter((i) => allowed(can, i.cap));
            if (!items.length) return null;
            // The group holding the open screen always shows.
            const shut = folded.includes(section.group) && !items.some(isOn);
            return (
              <div key={section.group} className="mb-3">
                {collapsed ? <div className="mx-2 mb-1.5 hidden border-t border-line lg:block" /> : null}
                <button type="button" onClick={() => fold(section.group)} aria-expanded={!shut}
                  className={`flex w-full items-center justify-between px-2 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted hover:text-ink ${collapsed ? 'lg:hidden' : ''}`}>
                  {section.group}<span className={`transition-transform duration-150 ${shut ? '' : 'rotate-90'}`}>›</span>
                </button>
                {!(shut && !collapsed) && items.map((item) => {
                  const on = isOn(item);
                  const link = (
                    <NavLink key={item.to} to={item.to} end={item.end} data-active={on ? '1' : '0'} aria-label={item.label}
                      onClick={() => setOpen(false)}
                      className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150 ${
                        on ? 'bg-brand/8 font-semibold text-brand-deep' : 'text-body hover:bg-shell'} ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
                      <item.icon />
                      <span className={`truncate transition-opacity duration-150 ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
                      {item.badge && !collapsed && <Badge kind={item.badge} b={badges} />}
                    </NavLink>
                  );
                  return collapsed ? <Hint key={item.to} note={item.label} className="block">{link}</Hint> : link;
                })}
              </div>
            );
          })}
        </nav>
      </aside>

      {open && <div className="fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={() => setOpen(false)} />}

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:px-6">
          <button className="btn-quiet !px-2.5 !py-1.5 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">☰</button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 truncate text-sm font-semibold text-ink">{title}<Updating /></h1>
            {subtitle && <p className="truncate text-2xs text-muted">{subtitle}</p>}
          </div>
          {allowed(can, 'dashboard.view') && <div className="no-print"><GlobalSearch /></div>}
          <div className="no-print flex items-center gap-2">{actions}</div>
          <div className="no-print flex items-center gap-1"><ConnectionStatus /><RefreshButton /></div>
          <Notifications Icon={BellIcon} />
          <div className="no-print hidden items-center gap-2 border-l border-line pl-3 sm:flex">
            <div className="text-right leading-tight">
              <Link to="/preferences" className="text-2xs font-semibold text-ink hover:underline" title="Display & motion">{me?.name}</Link>
              <div className="text-2xs capitalize text-muted">{me?.role}</div>
            </div>
            <button className="btn-quiet !px-2.5 !py-1.5 text-2xs" onClick={signOut}>Sign out</button>
          </div>
        </header>

        {/* A screen made of tabs passes them here, so they sit under the
            header rather than floating over the sidebar. */}
        {tabs && <div className="border-b border-line bg-white px-4 lg:px-6">{tabs}</div>}
        {/* Each screen arrives with a short fade-rise (motion system). */}
        <main className="m-enter px-4 py-5 lg:px-6">{children}</main>
      </div>
      <Toasts />
    </div>
  );
}

/* Icons: small inline SVGs rather than a dependency — a dozen glyphs is not
   worth a package, and these never need to change with a version bump. */
const I = ({ children }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
function GridIcon() { return <I><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></I>; }
function PulseIcon() { return <I><path d="M3 12h4l3 8 4-16 3 8h4" /></I>; }
function UsersIcon() { return <I><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></I>; }
function CarIcon() { return <I><path d="M5 17h14M6 17v2M18 17v2" /><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4H3v-4Z" /><circle cx="7.5" cy="13.5" r="1" /><circle cx="16.5" cy="13.5" r="1" /></I>; }
function ChartIcon() { return <I><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></I>; }
function RupeeIcon() { return <I><path d="M7 4h10M7 8h10M7 12h4a4 4 0 0 0 0-8" /><path d="M7 12l7 8" /></I>; }
function DocIcon() { return <I><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></I>; }
function SearchIcon() { return <I><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>; }
function ShieldIcon() { return <I><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z" /><path d="m9 12 2 2 4-4" /></I>; }
function StarIcon() { return <I><path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.7l5.4-.8Z" /></I>; }
function CogIcon() { return <I><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1 2 2 0 1 1-4 0 1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a2 2 0 1 1 0-4 1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6a2 2 0 1 1 4 0 1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.6 1.6 0 0 0 19.4 11a2 2 0 1 1 0 4Z" /></I>; }
function BookIcon() { return <I><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2Z" /><path d="M8 7h7M8 11h7" /></I>; }
function KeyIcon() { return <I><circle cx="8" cy="12" r="4" /><path d="M12 12h9l-2 3 2 2" /></I>; }
function ListIcon() { return <I><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></I>; }
function DoorIcon() { return <I><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /><path d="M10 17l5-5-5-5M15 12H3" /></I>; }
function LifebuoyIcon() { return <I><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="m5.7 5.7 3.8 3.8M14.5 14.5l3.8 3.8M18.3 5.7l-3.8 3.8M9.5 14.5l-3.8 3.8" /></I>; }
function SendIcon() { return <I><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></I>; }
function MailIcon() { return <I><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></I>; }
function GiftIcon() { return <I><rect x="3" y="8" width="18" height="4" /><path d="M5 12v9h14v-9M12 8v13M12 8S10.5 3 8 3.5 7 8 12 8Zm0 0s1.5-5 4-4.5S17 8 12 8Z" /></I>; }
function BellIcon() { return <I><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></I>; }
function HeartIcon() { return <I><path d="M20.8 6.6a5 5 0 0 0-8.8-1.6A5 5 0 0 0 3.2 6.6C1.9 9.7 4.3 13 12 19c7.7-6 10.1-9.3 8.8-12.4Z" /></I>; }
