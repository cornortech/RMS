// Loaded by the app's service worker (see vite.config.ts → importScripts).
// When staff click a pop-up notification, bring the RMS window to the front
// and open the right page. If no RMS window is open, open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = new URL(data.url || '/', self.location.origin);
  const isRider = target.pathname.startsWith('/rider/');

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const match = windows.find((w) => {
      const path = new URL(w.url).pathname;
      return isRider ? path === target.pathname : !/^\/(scan|order|track|rider)\//.test(path);
    });
    if (match) {
      await match.focus();
      if (data.view) match.postMessage({ type: 'rms-open', view: data.view });
      return;
    }
    await self.clients.openWindow(isRider ? target.pathname : '/');
  })());
});