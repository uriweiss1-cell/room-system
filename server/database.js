const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const dataDir = process.env.DATA_DIR
  || path.join(process.env.LOCALAPPDATA || process.env.APPDATA || __dirname, 'room-system-data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const dbPath = path.join(dataDir, 'db.json');

let _db = null;
let mongoCollection = null;

// lowdb adapter that syncs every write to MongoDB in the background
class CloudAdapter extends FileSync {
  write(data) {
    super.write(data);
    if (mongoCollection) {
      mongoCollection
        .replaceOne({ _id: 'db' }, { _id: 'db', data }, { upsert: true })
        .catch(e => console.error('Cloud sync error:', e.message));
    }
  }
}

async function initDB() {
  const MONGODB_URI = process.env.MONGODB_URI;

  if (MONGODB_URI) {
    try {
      const client = new MongoClient(MONGODB_URI);
      await client.connect();
      mongoCollection = client.db('room-system').collection('store');

      // Restore from cloud if local file is missing
      if (!fs.existsSync(dbPath)) {
        const doc = await mongoCollection.findOne({ _id: 'db' });
        if (doc?.data) {
          fs.writeFileSync(dbPath, JSON.stringify(doc.data));
          console.log('✅ Database restored from cloud');
        } else {
          // First production run — seed from committed data file if available
          const seedPath = path.join(__dirname, 'data', 'db.json');
          if (fs.existsSync(seedPath)) {
            fs.copyFileSync(seedPath, dbPath);
            console.log('✅ Database seeded from repository');
          }
        }
      }
    } catch (e) {
      console.error('⚠️ MongoDB unavailable:', e.message);
      mongoCollection = null;
    }
  }

  _db = low(new CloudAdapter(dbPath));

  _db.defaults({
    users: [],
    rooms: [],
    regular_schedules: [],
    room_assignments: [],
    one_time_requests: [],
    uploaded_files: [],
    notifications: [],
    push_subscriptions: [],
    _ids: { users: 1, rooms: 1, regular_schedules: 1, room_assignments: 1, one_time_requests: 1, uploaded_files: 1, notifications: 1, push_subscriptions: 1 },
  }).write();

  if (_db.get('users').size().value() === 0) {
    _db.get('users').push({
      id: nextId('users'),
      name: 'מנהל מערכת',
      email: 'admin@clinic.local',
      password_hash: bcrypt.hashSync('admin123', 10),
      role: 'admin',
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
      _db.get('rooms').push({ id: nextId('rooms'), capacity: 1, notes: null, is_active: true, ...r }).write();
    });

    console.log('✅ Database initialized. Admin: admin@clinic.local / admin123');
  }
}

function nextId(table) {
  const id = _db.get(`_ids.${table}`).value();
  _db.set(`_ids.${table}`, id + 1).write();
  return id;
}

module.exports = { get db() { return _db; }, nextId, initDB, dbPath };
