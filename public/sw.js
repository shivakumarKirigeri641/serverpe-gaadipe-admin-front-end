/*
 * GaadiPe admin — phone notifications (2026-10-03).
 *
 * This file only shows the notifications the server pushes (payments,
 * feedback, milestones, outages) and opens the panel on a tap. It caches
 * nothing and serves nothing: the panel always loads fresh from the network.
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'GaadiPe', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'GaadiPe', {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || '/' },
    vibrate: [120, 60, 120],
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const t of tabs) {
      if (t.url.startsWith(self.location.origin)) { await t.focus(); return t.navigate ? t.navigate(url) : undefined; }
    }
    return self.clients.openWindow(url);
  })());
});
