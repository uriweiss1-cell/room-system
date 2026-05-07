let webpush;
try { webpush = require('web-push'); } catch (e) { webpush = null; }

function initVapid() {
  if (!webpush) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (pub && priv) {
    webpush.setVapidDetails(
      'mailto:' + (process.env.ADMIN_EMAIL || 'admin@clinic.local'),
      pub,
      priv
    );
  }
}

async function sendPushToUser(db, userId, title, body) {
  if (!webpush || !process.env.VAPID_PUBLIC_KEY) return;
  if (!db.has('push_subscriptions').value()) return;
  const subs = db.get('push_subscriptions').filter({ user_id: +userId }).value();
  if (!subs.length) return;
  const payload = JSON.stringify({ title, body });
  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        db.get('push_subscriptions').remove({ id: sub.id }).write();
      } else {
        console.error('[push] שגיאה:', e.message);
      }
    }
  }
}

module.exports = { initVapid, sendPushToUser };
