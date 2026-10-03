import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { snack } from './Live.jsx';

/**
 * PHONE NOTIFICATIONS (user, 2026-10-03). Switch on in this browser — on a
 * phone, open the panel and add it to the home screen first on iPhone — and
 * payments, 4–5 star feedback, milestones and outages arrive as notifications
 * even with the browser closed. Server: src/util/push.js; worker: public/sw.js.
 */
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const fromB64 = (s) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};
const deviceName = () => {
  const ua = navigator.userAgent;
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${os} · ${br}`;
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) || navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

export default function PhoneNotifications() {
  const [state, setState] = useState('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported()) { setState('unsupported'); return; }
    if (Notification.permission === 'denied') { setState('blocked'); return; }
    navigator.serviceWorker.getRegistration('/').then(async (r) => {
      const sub = r && await r.pushManager.getSubscription();
      setState(sub ? 'on' : 'off');
    }).catch(() => setState('off'));
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const { key } = await api.pushKey();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64(key) });
      await api.pushSubscribe(sub.toJSON(), deviceName());
      await api.pushTest();
      setState('on');
      snack('Notifications on — a test one is on its way');
    } catch (e) {
      snack(`Could not switch on: ${e.message || e}`, 'wrong');
    } finally { setBusy(false); }
  };
  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = reg && await reg.pushManager.getSubscription();
      if (sub) { await api.pushUnsubscribe(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
      setState('off'); snack('Notifications off on this device');
    } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try { const r = await api.pushTest(); snack(r.sent ? 'Test sent' : 'No device is switched on', r.sent ? 'good' : 'wrong'); } finally { setBusy(false); }
  };

  const ios = /iPhone|iPad/i.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone;
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0 max-w-2xl">
        <h2 className="text-sm font-semibold text-ink">Phone notifications</h2>
        <p className="text-2xs text-muted">
          Payments, 4–5 star feedback, customer milestones, critical alerts and outages (VAHAN down or back, RC backup paused) arrive as notifications on this
          device — even with the browser closed. Switch on in each phone or computer you want them on.
        </p>
        {ios && !standalone && (
          <p className="mt-1 text-2xs text-watch-700">On iPhone: tap Share → <b>Add to Home Screen</b>, open GaadiPe from the home screen, then switch on here.</p>
        )}
        {state === 'blocked' && <p className="mt-1 text-2xs text-wrong-700">Notifications are blocked for this site in the browser settings. Allow them there, then reload.</p>}
        {state === 'unsupported' && <p className="mt-1 text-2xs text-muted">This browser cannot receive notifications.</p>}
      </div>
      <div className="flex items-center gap-2">
        {state === 'on' && <button type="button" className="btn-quiet !py-1.5 text-2xs" disabled={busy} onClick={test}>Send a test</button>}
        {state === 'on'
          ? <button type="button" className="btn-quiet !py-1.5 text-2xs" disabled={busy} onClick={disable}>Switch off</button>
          : <button type="button" className="btn-primary !py-1.5 text-2xs" disabled={busy || state === 'unsupported' || state === 'blocked' || state === 'checking'} onClick={enable}>Switch on</button>}
      </div>
    </div>
  );
}
