const express = require('express');
const fs = require('fs');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

const dataDir = process.env.DATA_DIR
  || path.join(process.env.LOCALAPPDATA || process.env.APPDATA || __dirname, 'room-system-data');
const backupsDir = path.join(dataDir, 'backups');
const dbPath = path.join(dataDir, 'db.json');

const MAX_BACKUPS = 20;

function ensureDir() {
  if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
}

function pruneOld() {
  const files = fs.readdirSync(backupsDir).filter(f => f.endsWith('.json')).sort();
  if (files.length > MAX_BACKUPS) {
    files.slice(0, files.length - MAX_BACKUPS).forEach(f => {
      try { fs.unlinkSync(path.join(backupsDir, f)); } catch {}
    });
  }
}

// Called internally before destructive operations
function createBackup(label = 'auto') {
  if (!fs.existsSync(dbPath)) return null;
  ensureDir();
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `db_${ts}_${label}.json`;
  fs.copyFileSync(dbPath, path.join(backupsDir, filename));
  pruneOld();
  return filename;
}

// GET /api/backups — list all backups
router.get('/', (req, res) => {
  ensureDir();
  const files = fs.readdirSync(backupsDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .map(f => {
      const stat = fs.statSync(path.join(backupsDir, f));
      return { filename: f, size: stat.size, created_at: stat.mtime.toISOString() };
    });
  res.json(files);
});

// POST /api/backups — manual backup
router.post('/', (req, res) => {
  const { label } = req.body;
  const filename = createBackup(label || 'manual');
  if (!filename) return res.status(500).json({ error: 'מסד הנתונים לא נמצא' });
  res.json({ message: 'גיבוי נוצר בהצלחה', filename });
});

// POST /api/backups/restore/:filename — restore a backup
router.post('/restore/:filename', (req, res) => {
  const { filename } = req.params;
  // Security: only allow simple filenames, no path traversal
  if (!/^db_[\w\-.]+\.json$/.test(filename)) return res.status(400).json({ error: 'שם קובץ לא תקין' });
  const src = path.join(backupsDir, filename);
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'גיבוי לא נמצא' });

  // Backup current state before restoring
  createBackup('before-restore');

  // Overwrite db.json
  fs.copyFileSync(src, dbPath);

  // Reload lowdb from disk
  const { db } = require('../database');
  db.read();

  res.json({ message: `שוחזר בהצלחה מגיבוי ${filename}` });
});

// DELETE /api/backups/:filename — delete a backup
router.delete('/:filename', (req, res) => {
  const { filename } = req.params;
  if (!/^db_[\w\-.]+\.json$/.test(filename)) return res.status(400).json({ error: 'שם קובץ לא תקין' });
  const p = path.join(backupsDir, filename);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'גיבוי לא נמצא' });
  fs.unlinkSync(p);
  res.json({ message: 'גיבוי נמחק' });
});

module.exports = { router, createBackup };
