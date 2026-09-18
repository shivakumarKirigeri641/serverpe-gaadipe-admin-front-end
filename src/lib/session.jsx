import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, onSignedOut } from './api';

/**
 * Who is signed in, for the whole panel.
 *
 * The token in localStorage is a claim, not proof: on load the panel asks the
 * gateway who it belongs to, and only then draws anything. That way a session
 * that expired while the tab was closed sends the person to the sign-in screen
 * rather than to a dashboard full of empty boxes.
 */
const Ctx = createContext(null);

export function SessionProvider({ children }) {
  const [me, setMe] = useState(null);
  const [can, setCan] = useState([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!getToken()) { setMe(null); setReady(true); return; }
    try {
      const out = await api.session();
      setMe(out.user);
      setCan(out.can || []);
    } catch {
      setMe(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* One place hears "your session has ended", wherever it happened. */
  useEffect(() => onSignedOut(() => { setMe(null); setCan([]); }), []);

  const signIn = useCallback((token, user) => {
    setToken(token);
    setMe(user);
    return api.session().then((out) => { setMe(out.user); setCan(out.can || []); }).catch(() => {});
  }, []);

  const signOut = useCallback(async () => {
    try { await api.signOut(); } catch { /* the token is going either way */ }
    setToken(null);
    setMe(null);
    setCan([]);
  }, []);

  return (
    <Ctx.Provider value={{ me, can, ready, signIn, signOut, reload: load }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSession = () => useContext(Ctx);

/** Guard by capability, never by role name. */
export const allowed = (can, capability) =>
  !capability || (Array.isArray(capability)
    ? capability.some((c) => can.includes(c))
    : can.includes(capability));
