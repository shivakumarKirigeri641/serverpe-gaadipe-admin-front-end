import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './lib/session';
import SignIn from './pages/SignIn.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import SignIns from './pages/SignIns.jsx';
import Security from './pages/Security.jsx';
import Referrals from './pages/Referrals.jsx';
import ReportAccess from './pages/ReportAccess.jsx';
import Live from './pages/Live.jsx';
import Vehicles from './pages/Vehicles.jsx';
/* Charts are a third of the whole panel's weight and are opened rarely, so the
   analytics screen is fetched only when somebody asks for it. */
const Analytics = lazy(() => import('./pages/Analytics.jsx'));
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
      <Route path="/" element={<Dashboard />} />
      <Route path="/live" element={<Live />} />
      <Route path="/customers" element={<Customers />} />
      <Route path="/sign-ins" element={<SignIns />} />
      <Route path="/security" element={<Security />} />
      <Route path="/referrals" element={<Referrals />} />
      <Route path="/report-access" element={<ReportAccess />} />
      <Route path="/vehicles" element={<Vehicles />} />
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
