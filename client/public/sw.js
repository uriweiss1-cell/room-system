self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  const title = data.title || 'מערכת שיבוץ חדרים';
  const body = data.body || '';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.ico',
      dir: 'rtl',
      lang: 'he',
      badge: '/favicon.ico',
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
