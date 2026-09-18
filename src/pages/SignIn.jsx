import { useState } from 'react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { Banner, Field } from '../components/ui.jsx';

/**
 * Sign in with a code sent to your own number.
 *
 * TWO STEPS, ONE SCREEN. The number is asked for, then the code, without a
 * route change — going "back" mid sign-in should return to the number, not to
 * whatever was open before.
 *
 * The answer to "send me a code" is deliberately the same whether or not the
 * number can open the panel: this screen is on the public internet, and telling
 * a stranger which numbers are admins is telling them who to target.
 */
export default function SignIn() {
  const { signIn } = useSession();
  const [step, setStep] = useState('mobile');
  const [mobile, setMobile] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);

  const ask = async (e) => {
    e.preventDefault();
    const m = mobile.replace(/\D/g, '').slice(-10);
    if (m.length !== 10) { setError('Please enter a ten-digit mobile number.'); return; }
    setBusy(true); setError(null);
    try {
      const out = await api.requestCode(m);
      setNote(out.message);
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const out = await api.verifyCode(mobile.replace(/\D/g, '').slice(-10), code.trim());
      if (!out.ok) { setError(out.message || 'That code is not valid.'); return; }
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
          {step === 'mobile' ? (
            <form onSubmit={ask} className="space-y-4">
              <Field label="Your mobile number" hint="The number registered for this panel.">
                <input className="input tabular" inputMode="numeric" autoFocus autoComplete="tel"
                  placeholder="98765 43210" value={mobile}
                  onChange={(e) => setMobile(e.target.value)} />
              </Field>
              {error && <Banner tone="wrong">{error}</Banner>}
              <button className="btn-primary w-full" disabled={busy}>
                {busy ? 'Sending…' : 'Send me a code'}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-4">
              <Field label="The code" hint={note}>
                <input className="input tabular tracking-[0.4em]" inputMode="numeric" autoFocus
                  maxLength={6} placeholder="••••" value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </Field>
              {error && <Banner tone="wrong">{error}</Banner>}
              <button className="btn-primary w-full" disabled={busy || code.length < 4}>
                {busy ? 'Checking…' : 'Sign in'}
              </button>
              <button type="button" className="btn-quiet w-full"
                onClick={() => { setStep('mobile'); setCode(''); setError(null); }}>
                Use a different number
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-2xs text-muted">
          Every sign-in, and everything done here, is recorded against your name.
        </p>
      </div>
    </div>
  );
}
