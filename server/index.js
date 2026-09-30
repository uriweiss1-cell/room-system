require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { initDB } = require('./database');
const { initVapid } = require('./webpush');

async function main() {
  await initDB();

  // One-time migration: coerce day_of_week from string to number in room_assignments and regular_schedules
  const { db } = require('./database');
  let migrated = 0;
  db.get('room_assignments').value().forEach(a => {
    if (typeof a.day_of_week === 'string') {
      db.get('room_assignments').find({ id: a.id }).assign({ day_of_week: +a.day_of_week }).write();
      migrated++;
    }
  });
  db.get('regular_schedules').value().forEach(s => {
    if (typeof s.day_of_week === 'string') {
      db.get('regular_schedules').find({ id: s.id }).assign({ day_of_week: +s.day_of_week }).write();
      migrated++;
    }
  });
  if (migrated > 0) console.log(`[migration] converted ${migrated} day_of_week string→number`);

  // One-time migration: change admin user (uriweiss1@gmail.com) role to supervisor + can_admin
  const adminUser = db.get('users').find({ email: 'uriweiss1@gmail.com', role: 'admin' }).value();
  if (adminUser) {
    db.get('users').find({ id: adminUser.id }).assign({
      role: 'supervisor',
      can_admin: true,
      perm_assignments: false, perm_algorithm: false, perm_requests: false, perm_users: false, perm_rooms: false,
    }).write();
    console.log(`[migration] ${adminUser.name}: role admin→supervisor, can_admin=true`);
  }

  // One-time migration: change חדר 6 from room_type 'committee' to 'regular'
  const room6 = db.get('rooms').find({ name: 'חדר 6', room_type: 'committee' }).value();
  if (room6) {
    db.get('rooms').find({ id: room6.id }).assign({ room_type: 'regular' }).write();
    console.log(`[migration] חדר 6 (id=${room6.id}) room_type changed: committee → regular`);
  }

  // One-time migration: fix NaN IDs in dismissed_conflicts
  if (!db.has('dismissed_conflicts').value()) db.set('dismissed_conflicts', []).write();
  if (!db.get('_ids.dismissed_conflicts').value()) {
    const maxId = db.get('dismissed_conflicts').map('id').filter(id => Number.isFinite(id)).max().value() || 0;
    db.set('_ids.dismissed_conflicts', maxId + 1).write();
    const badCount = db.get('dismissed_conflicts').filter(r => !Number.isFinite(r.id)).size().value();
    if (badCount > 0) {
      let next = maxId + 1;
      db.get('dismissed_conflicts').filter(r => !Number.isFinite(r.id)).value()
        .forEach(r => { db.get('dismissed_conflicts').find({ created_at: r.created_at }).assign({ id: next++ }).write(); });
      db.set('_ids.dismissed_conflicts', next).write();
      console.log(`[migration] fixed ${badCount} dismissed_conflicts NaN IDs`);
    }
  }

  initVapid();

  const app = express();
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:5173', 'http://localhost:3001'];
  app.use(cors({
    origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
    credentials: true,
  }));
  app.use(express.json());

  app.use('/api/auth', require('./routes/auth'));

  app.use('/api/users', require('./routes/users'));
  app.use('/api/rooms', require('./routes/rooms'));
  app.use('/api/schedules', require('./routes/schedules'));
  app.use('/api/assignments', require('./routes/assignments'));
  app.use('/api/requests', require('./routes/requests'));
  app.use('/api/import', require('./routes/import'));
  app.use('/api/backups', require('./routes/backups').router);
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/push', require('./routes/push'));

  const uploadsDir = path.join(process.env.DATA_DIR || require('path').join(process.env.LOCALAPPDATA || process.env.APPDATA || __dirname, 'room-system-data'), 'uploads');
  app.use('/uploads', express.static(uploadsDir));

  // Serve React build in production
  const clientDist = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    // Hashed assets (JS/CSS) can be cached indefinitely — their filename changes on every build.
    // index.html must NEVER be cached: it references the hashed bundle, so stale cache = wrong bundle.
    app.use(express.static(clientDist, {
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === 'index.html') {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
        }
      }
    }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

main().catch(console.error);
