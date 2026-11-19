// MeelieFont service worker — Web Push only (Tahap G).
// Deliberately NO fetch handler: nothing is cached, every open loads the
// latest deploy (ponytail: add precache/offline shell only if offline use is requested).

self.addEventListener('push', (event) => {
  let payload = { title: 'MeelieFont', body: 'Pembaruan aplikasi tersedia.' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // non-JSON push body → keep defaults
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'MeelieFont', {
      body: payload.body || 'Pembaruan aplikasi tersedia.',
      data: { url: payload.url || '/' },
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        // App already open (possibly stale bundle) → ask it to reload.
        client.postMessage({ type: 'UPDATE_AVAILABLE', url });
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
