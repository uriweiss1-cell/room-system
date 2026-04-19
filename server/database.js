const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// In production use DATA_DIR (mounted disk); locally store outside OneDrive
const dataDir = process.env.DATA_DIR
  || path.join(process.env.LOCALAPPDATA || process.env.APPDATA || __dirname, 'room-system-data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const db = low(new FileSync(path.join(dataDir, 'db.json')));

db.defaults({
  users: [],
  rooms: [],
  regular_schedules: [],
  room_assignments: [],
  one_time_requests: [],
  uploaded_files: [],
  notifications: [],
  _ids: { users: 1, rooms: 1, regular_schedules: 1, room_assignments: 1, one_time_requests: 1, uploaded_files: 1, notifications: 1 },
}).write();

function nextId(table) {
  const id = db.get(`_ids.${table}`).value();
  db.set(`_ids.${table}`, id + 1).write();
  return id;
}

// Seed on first run
if (db.get('users').size().value() === 0) {
  db.get('users').push({
    id: nextId('users'),
    name: 'מנהל מערכת',
    email: 'admin@clinic.local',
    password_hash: bcrypt.hashSync('admin123', 10),
    role: 'admin',
    work_percentage: 100,
    phone: null,
    notes: null,
    is_active: true,
    can_admin: true,
    created_at: new Date().toISOString(),
  }).write();

  const rooms = [
    ...Array.from({ length: 22 }, (_, i) => ({ name: `חדר ${i + 1}`, room_type: 'regular' })),
    { name: 'חדר צוות', room_type: 'staff' },
    { name: 'חדר ועדה', room_type: 'committee' },
  ];
  rooms.forEach(r => {
    db.get('rooms').push({ id: nextId('rooms'), capacity: 1, notes: null, is_active: true, ...r }).write();
  });

  console.log('✅ Database initialized. Admin: admin@clinic.local / admin123');
}

module.exports = { db, nextId };
