const express = require('express');
const { db, nextId } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

router.post('/subscribe', (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'חסר endpoint' });

  if (!db.has('push_subscriptions').value()) db.set('push_subscriptions', []).write();

  // Replace existing subscription with same endpoint
  db.get('push_subscriptions').remove({ user_id: req.user.id, endpoint: subscription.endpoint }).write();

  db.get('push_subscriptions').push({
    id: nextId('push_subscriptions'),
    user_id: req.user.id,
    endpoint: subscription.endpoint,
    keys: subscription.keys,
    created_at: new Date().toISOString(),
  }).write();

  res.json({ ok: true });
});

router.post('/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (db.has('push_subscriptions').value()) {
    db.get('push_subscriptions').remove({ user_id: req.user.id, endpoint }).write();
  }
  res.json({ ok: true });
});

module.exports = router;
