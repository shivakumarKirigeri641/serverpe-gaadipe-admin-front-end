import { useEffect, useRef } from 'react';
import { quietly } from './api';
import { usePrefs, refreshEvery, useRefreshSignal } from './motion.jsx';

/*
 * The panel keeps itself current (user, 2026-09-18): every screen that lists
 * something asks again every ten seconds.
 *
 * Quietly — no loading bar, no spinner, the rows simply change — and never
 * while the tab is hidden (a panel left open in a background tab should not
 * hammer the server) or while someone is typing in a field (a refresh must not
 * move the ground under the cursor).
 *
 * Motion system (2026-09-25): the admin's Realtime preference sets the pace —
 * live (as asked), every 30 s, every minute, or only by hand — and the
 * header's Refresh reloads every screen at once, visibly.
 */
export const REFRESH_MS = 10000;

export function useAutoRefresh(fn, ms = REFRESH_MS) {
  const latest = useRef(fn);
  latest.current = fn;
  const { realtime } = usePrefs();
  const every = refreshEvery(ms);

  useEffect(() => {
    if (!every) return undefined;
    const id = setInterval(() => {
      if (document.hidden) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'checkbox'))) return;
      quietly(() => latest.current()).catch(() => { /* the next tick tries again */ });
    }, every);
    return () => clearInterval(id);
  }, [every, realtime]);

  useRefreshSignal(() => latest.current());
}
