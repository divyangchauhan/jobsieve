const ACCOUNT_CACHE = 'jobsieve-account-v1';
self.addEventListener('message', (event) => {
  if (event.data?.type === 'account')
    event.waitUntil(
      caches
        .open(ACCOUNT_CACHE)
        .then((cache) =>
          cache.put(
            '/active-account',
            new Response(JSON.stringify(event.data.userId)),
          ),
        ),
    );
});
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data;
      try {
        data = event.data.json();
      } catch {
        return;
      }
      const cache = await caches.open(ACCOUNT_CACHE);
      const saved = await cache.match('/active-account');
      if (!saved || (await saved.json()) !== data.userId) return;
      const url =
        typeof data.url === 'string' && /^\/jobs\/\d+$/.test(data.url)
          ? data.url
          : '/';
      await self.registration.showNotification(
        data.title || 'New JobSieve match',
        { body: data.body, tag: data.tag, data: { url } },
      );
    })(),
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(
      new URL(event.notification.data?.url || '/', self.location.origin).href,
    ),
  );
});
