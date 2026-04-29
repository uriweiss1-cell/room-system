const express = require('express');
const multer = require('multer');
const path = require('path');
const { db, nextId } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

router.get('/', (req, res) => {
  res.json(db.get('rooms').filter({ is_active: true }).value());
});

router.post('/', requireAdmin, (req, res) => {
  const { name, capacity, room_type, notes, has_camera } = req.body;
  const room = { id: nextId('rooms'), name, capacity: capacity ?? 1, room_type: room_type ?? 'regular', notes: notes || null, has_camera: !!has_camera, is_active: true };
  db.get('rooms').push(room).write();
  res.json({ id: room.id });
});

router.put('/:id', requireAdmin, (req, res) => {
  const { name, capacity, room_type, notes, is_active, has_camera } = req.body;
  db.get('rooms').find({ id: +req.params.id }).assign({ name, capacity: capacity ?? 1, room_type, notes: notes || null, has_camera: !!has_camera, is_active: !!is_active }).write();
  res.json({ message: 'עודכן' });
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.get('rooms').find({ id: +req.params.id }).assign({ is_active: false }).write();
  res.json({ message: 'החדר הושבת' });
});

router.post('/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'לא נבחר קובץ' });
  const f = { id: nextId('uploaded_files'), filename: req.file.filename, original_name: req.file.originalname, uploaded_by: req.user.id, notes: req.body.notes || null, created_at: new Date().toISOString() };
  db.get('uploaded_files').push(f).write();
  res.json({ id: f.id, filename: f.filename, originalName: f.original_name });
});

router.get('/files', requireAdmin, (req, res) => {
  const files = db.get('uploaded_files').value().map(f => {
    const uploader = db.get('users').find({ id: f.uploaded_by }).value();
    return { ...f, uploaded_by_name: uploader?.name || null };
  });
  res.json(files.reverse());
});

module.exports = router;
