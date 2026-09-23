import { NavLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { useSession, allowed } from '../lib/session';
import { BusyBar } from './ui.jsx';

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
const NAV = [
  {
    group: 'Watch',
    items: [
      { to: '/', label: 'Dashboard', end: true, icon: GridIcon },
      { to: '/live', label: 'Live', icon: PulseIcon },
      { to: '/customers', label: 'Customers', icon: UsersIcon },
      { to: '/sign-ins', label: 'Sign-ins', icon: DoorIcon },
      { to: '/vehicles', label: 'Vehicles', icon: CarIcon },
      { to: '/analytics', label: 'Analytics', icon: ChartIcon },
    ],
  },
  {
    group: 'Money',
    items: [
      { to: '/finance', label: 'Revenue & GST', icon: RupeeIcon, cap: 'money' },
      { to: '/documents', label: 'Reports & invoices', icon: DocIcon },
      { to: '/referrals', label: 'Referrals', icon: UsersIcon },
      { to: '/referrals-quizpe', label: 'Referrals (QuizPe) — off', icon: UsersIcon },
      { to: '/free-reports', label: 'Free reports', icon: GiftIcon },
    ],
  },
  {
    group: 'Operate',
    items: [
      { to: '/check', label: 'Check a vehicle', icon: SearchIcon, cap: 'lookup' },
      { to: '/blocks', label: 'Blocked', icon: ShieldIcon },
      // Owner only, and only while Settings → admin_report_access_enabled is on.
      { to: '/report-access', label: 'Report access ⚠️', icon: KeyIcon, cap: 'report_access' },
      { to: '/tickets', label: 'Support', icon: LifebuoyIcon },
      { to: '/feedback', label: 'Messages', icon: StarIcon },
      { to: '/customer-emails', label: 'Customer emails', icon: MailIcon },
      { to: '/broadcast', label: 'Broadcast', icon: SendIcon },
    ],
  },
  {
    group: 'Administer',
    items: [
      { to: '/settings', label: 'Prices & settings', icon: CogIcon, cap: 'settings' },
      { to: '/policies', label: 'Policies & terms', icon: BookIcon, cap: 'settings' },
      { to: '/people', label: 'Panel users', icon: KeyIcon, cap: 'admins' },
      { to: '/audit', label: 'Audit trail', icon: ListIcon },
      { to: '/security', label: 'Security', icon: ShieldIcon },
      { to: '/health', label: 'System health', icon: HeartIcon },
    ],
  },
];

export default function Shell({ title, subtitle, actions, children }) {
  const { me, can, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen lg:flex">
      <BusyBar />

      <aside className={`fixed inset-y-0 left-0 z-40 w-60 shrink-0 overflow-y-auto border-r border-line bg-white transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-xs font-bold text-white">GP</span>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink">GaadiPe</div>
            <div className="text-2xs text-muted">Admin</div>
          </div>
        </div>

        <nav className="px-3 py-4">
          {NAV.map((section) => {
            const items = section.items.filter((i) => allowed(can, i.cap));
            if (!items.length) return null;
            return (
              <div key={section.group} className="mb-5">
                <div className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted">
                  {section.group}
                </div>
                {items.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => `mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                      isActive || (item.match && item.match(pathname))
                        ? 'bg-brand/8 font-semibold text-brand-deep'
                        : 'text-body hover:bg-shell'}`}>
                    <item.icon />
                    {item.label}
                  </NavLink>
                ))}
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
            <h1 className="truncate text-sm font-semibold text-ink">{title}</h1>
            {subtitle && <p className="truncate text-2xs text-muted">{subtitle}</p>}
          </div>
          <div className="no-print flex items-center gap-2">{actions}</div>
          <div className="no-print hidden items-center gap-2 border-l border-line pl-3 sm:flex">
            <div className="text-right leading-tight">
              <div className="text-2xs font-semibold text-ink">{me?.name}</div>
              <div className="text-2xs capitalize text-muted">{me?.role}</div>
            </div>
            <button className="btn-quiet !px-2.5 !py-1.5 text-2xs" onClick={signOut}>Sign out</button>
          </div>
        </header>

        <main className="px-4 py-5 lg:px-6">{children}</main>
      </div>
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
function HeartIcon() { return <I><path d="M20.8 6.6a5 5 0 0 0-8.8-1.6A5 5 0 0 0 3.2 6.6C1.9 9.7 4.3 13 12 19c7.7-6 10.1-9.3 8.8-12.4Z" /></I>; }
