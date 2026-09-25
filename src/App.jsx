import { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './lib/session';
import SignIn from './pages/SignIn.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Home from './pages/Home.jsx';
import CommandCenter from './pages/CommandCenter.jsx';
import Journey from './pages/Journey.jsx';
import WhatsAppCenter from './pages/WhatsAppCenter.jsx';
import Lookups from './pages/Lookups.jsx';
import Payments from './pages/Payments.jsx';
import ApiMonitor from './pages/ApiMonitor.jsx';
import Alerts from './pages/Alerts.jsx';
import Geo from './pages/Geo.jsx';
import Conversations from './pages/Conversations.jsx';
import Campaigns from './pages/Campaigns.jsx';
import Customers from './pages/Customers.jsx';
import SignIns from './pages/SignIns.jsx';
import Security from './pages/Security.jsx';
import Referrals from './pages/Referrals.jsx';
import GpReferrals from './pages/GpReferrals.jsx';
import Tickets from './pages/Tickets.jsx';
import ReportAccess from './pages/ReportAccess.jsx';
import CustomerEmails from './pages/CustomerEmails.jsx';
import Broadcast from './pages/Broadcast.jsx';
import FreeReports from './pages/FreeReports.jsx';
import Live from './pages/Live.jsx';
import VehicleExplorer from './pages/vehicles/Explorer.jsx';
import BusinessHealth from './pages/ops/BusinessHealth.jsx';
import Profitability from './pages/ops/Profitability.jsx';
import FinanceExport from './pages/ops/FinanceExport.jsx';
import Reconciliation from './pages/ops/Reconciliation.jsx';
import PaymentFailures from './pages/ops/PaymentFailures.jsx';
import Abandoned from './pages/ops/Abandoned.jsx';
import Refunds from './pages/ops/Refunds.jsx';
import DropOff from './pages/ops/DropOff.jsx';
import CustomerIntel from './pages/ops/CustomerIntel.jsx';
import Retention from './pages/ops/Retention.jsx';
import Attribution from './pages/ops/Attribution.jsx';
import VehicleProfile from './pages/vehicles/Profile.jsx';
import VehicleLists from './pages/vehicles/Lists.jsx';
import VehicleInsights from './pages/vehicles/Insights.jsx';
import VehicleApiLogs from './pages/vehicles/ApiLogs.jsx';
/* Imported like every other screen, NOT lazily (user, 2026-09-25). It used to
   be lazy(() => import('./pages/Analytics.jsx')) to keep the charts out of the
   first download — but the production obfuscator encodes that path string
   before Vite sees it, so no chunk was built and the browser asked for
   /assets/pages/Analytics.jsx, got index.html back, and the screen never
   opened. Only production was affected: development is not obfuscated. */
import Analytics from './pages/Analytics.jsx';
import Finance from './pages/Finance.jsx';
import Documents from './pages/Documents.jsx';
import Check from './pages/Check.jsx';
import Blocks from './pages/Blocks.jsx';
import Feedback from './pages/Feedback.jsx';
import Settings from './pages/Settings.jsx';
import Policies from './pages/Policies.jsx';
import People from './pages/People.jsx';
import Audit from './pages/Audit.jsx';
import Health from './pages/Health.jsx';

/**
 * Nothing is drawn until the panel knows who is signed in — a dashboard full of
 * empty boxes behind an expired session looks like a broken product rather than
 * a finished one.
 */
export default function App() {
  const { me, ready } = useSession();

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-sm text-muted">Loading…</div>;
  }
  if (!me) return <SignIn />;

  return (
    <Routes>
      {/* The Command Center is the start page; the previous Home, with its
          "Needs you" list, stays as Overview. */}
      {/* Business Health is the owner's first screen (operations module, 2026-09-25);
          the Command Center keeps everything it had at /command. */}
      <Route path="/" element={<BusinessHealth />} />
      <Route path="/command" element={<CommandCenter />} />
      <Route path="/profitability" element={<Profitability />} />
      <Route path="/finance/export" element={<FinanceExport />} />
      <Route path="/payments/reconciliation" element={<Reconciliation />} />
      <Route path="/payments/failures" element={<PaymentFailures />} />
      <Route path="/payments/abandoned" element={<Abandoned />} />
      <Route path="/payments/refunds" element={<Refunds />} />
      <Route path="/drop-off" element={<DropOff />} />
      <Route path="/customer-intelligence" element={<CustomerIntel />} />
      <Route path="/retention" element={<Retention />} />
      <Route path="/attribution" element={<Attribution />} />
      <Route path="/overview" element={<Home />} />
      <Route path="/journey" element={<Journey />} />
      <Route path="/whatsapp" element={<WhatsAppCenter />} />
      <Route path="/lookups" element={<Lookups />} />
      <Route path="/payments" element={<Payments />} />
      <Route path="/api-monitor" element={<ApiMonitor />} />
      <Route path="/alerts" element={<Alerts />} />
      <Route path="/where" element={<Geo />} />
      {/* The old numbers screen keeps its place for anyone who wants it. */}
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/conversations" element={<Conversations />} />
      <Route path="/campaigns" element={<Campaigns />} />
      <Route path="/live" element={<Live />} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/sign-ins" element={<SignIns />} />
      <Route path="/security" element={<Security />} />
      <Route path="/referrals" element={<GpReferrals />} />
      {/* QuizPe is switched off; its history stays reachable for anyone holding a credit. */}
      <Route path="/referrals-quizpe" element={<Referrals />} />
      <Route path="/report-access" element={<ReportAccess />} />
      <Route path="/customer-emails" element={<CustomerEmails />} />
      <Route path="/broadcast" element={<Broadcast />} />
      <Route path="/tickets" element={<Tickets />} />
      <Route path="/free-reports" element={<FreeReports />} />
      {/* The Vehicles module (user, 2026-09-25). */}
      <Route path="/vehicles" element={<VehicleExplorer />} />
      <Route path="/vehicles/lists" element={<VehicleLists />} />
      <Route path="/vehicles/insights" element={<VehicleInsights />} />
      <Route path="/vehicles/api-logs" element={<VehicleApiLogs />} />
      <Route path="/vehicles/:reg" element={<VehicleProfile />} />
      <Route path="/analytics" element={
        <Suspense fallback={<div className="grid min-h-screen place-items-center text-sm text-muted">Loading charts…</div>}>
          <Analytics />
        </Suspense>} />
      <Route path="/finance" element={<Finance />} />
      <Route path="/documents" element={<Documents />} />
      <Route path="/check" element={<Check />} />
      <Route path="/blocks" element={<Blocks />} />
      <Route path="/feedback" element={<Feedback />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/policies" element={<Policies />} />
      <Route path="/people" element={<People />} />
      <Route path="/audit" element={<Audit />} />
      <Route path="/health" element={<Health />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
