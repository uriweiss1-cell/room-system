const express = require('express');
const { db } = require('../database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const list = db.get('notifications').filter({ user_id: req.user.id }).value().reverse();
  res.json(list);
});

router.put('/:id/read', (req, res) => {
  db.get('notifications').find({ id: +req.params.id, user_id: req.user.id }).assign({ read: true }).write();
  res.json({ ok: true });
});

router.put('/read-all', (req, res) => {
  db.get('notifications').filter({ user_id: req.user.id }).each(n => { n.read = true; }).write();
  res.json({ ok: true });
});

module.exports = router;
