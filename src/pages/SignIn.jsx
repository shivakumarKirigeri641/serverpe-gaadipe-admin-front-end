import { useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { Banner, Field } from '../components/ui.jsx';

/**
 * Sign in with the panel passcode (user, 2026-09-18).
 *
 * ONE FIELD. The passcode is checked on the server, never here: this screen is
 * on the public internet and holds nothing worth reading. Wrong tries are
 * limited per IP there, and every attempt is in the audit trail.
 */
export default function SignIn() {
  const { signIn } = useSession();
  const [passcode, setPasscode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const out = await api.signInWithPasscode(passcode.trim());
      if (!out.ok) { setError(out.message || 'That passcode is not right.'); setPasscode(''); return; }
      await signIn(out.token, out.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand text-sm font-bold text-white">GP</span>
          <div className="leading-tight">
            <div className="text-lg font-semibold text-ink">GaadiPe Admin</div>
            <div className="text-2xs text-muted">Har gaadi ki kundli.</div>
          </div>
        </div>

        <div className="card px-5 py-5">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Passcode">
              <input className="input tabular text-center text-xl tracking-[0.5em]" type="password"
                inputMode="numeric" autoFocus autoComplete="current-password" maxLength={12}
                placeholder="••••" value={passcode}
                onChange={(e) => setPasscode(e.target.value.replace(/\s/g, ''))} />
            </Field>
            {error && <Banner tone="wrong">{error}</Banner>}
            <button className="btn-primary w-full" disabled={busy || passcode.length < 4}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-2xs text-muted">
          Every sign-in, and everything done here, is recorded.
        </p>
      </div>
    </div>
  );
}
