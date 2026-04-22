const express = require('express');
const bcrypt = require('bcryptjs');
const { db, nextId } = require('../database');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireAdmin);

// Document room numbers in order (24 rooms total)
const ROOM_NUMBERS = [3,4,5,6,7,8,9,10,11,13,14,17,18,19,20,21,22,23,24,25,26,27,28,29];
const ROOM_TYPES   = [
  'regular','regular','regular','committee','regular','regular',
  'regular','regular','regular','regular','regular','regular',
  'regular','regular','regular','regular','regular','regular',
  'regular','regular','regular','regular','regular','regular',
];

// [room_num, day(0=Sun..4=Thu), start, end, person]
const ASSIGNMENTS = [
  // Room 3
  [3,0,'08:00','17:00','אורי'],[3,1,'08:00','15:00','אורי'],[3,1,'15:00','16:00','רועי'],
  [3,2,'08:00','17:00','אורי'],[3,3,'08:00','09:00','אורי'],[3,3,'11:00','15:00','סיגל'],
  [3,3,'15:00','17:00','אור א.'],[3,4,'08:00','17:00','אור א.'],
  // Room 4
  [4,0,'08:00','15:00','עדי'],[4,0,'08:00','15:00','סיון ב.'],[4,1,'08:00','16:00','סיון ב.'],
  [4,2,'08:00','15:00','עדי'],[4,3,'08:00','14:00','עדי'],[4,3,'08:00','14:00','סיון ב.'],
  [4,3,'14:00','16:00','יובל'],[4,4,'08:00','15:00','סיון ב.'],
  // Room 5
  [5,0,'08:00','17:00','ניצן'],[5,1,'08:00','15:00','ניצן'],[5,1,'15:00','17:00','עמית'],
  [5,2,'08:00','17:00','אור א.'],[5,3,'08:00','09:00','ניצן'],[5,3,'13:00','17:00','ניצן'],
  [5,4,'08:00','17:00','ניצן'],
  // Room 6 (committee - reserved Wed; still show regular assignments)
  [6,0,'08:00','17:00','עמית'],[6,1,'08:00','17:00','אסף'],[6,2,'08:00','17:00','עמית'],
  [6,3,'13:00','16:00','נעמה'],[6,3,'16:00','17:00','עמית'],[6,4,'08:00','10:00','נעמה'],
  // Room 7
  [7,0,'08:00','15:00','אורית נ.'],[7,1,'08:00','16:00','אורית נ.'],
  [7,3,'08:00','09:00','אורית נ.'],[7,3,'12:00','15:00','אורית נ.'],[7,3,'15:00','17:00','דרור'],
  // Room 8
  [8,0,'08:00','10:00','מיכל'],[8,0,'14:00','16:00','מיכל'],
  [8,1,'08:00','10:00','עבדאללה'],[8,1,'08:00','10:00','מיכל'],
  [8,1,'13:00','17:00','עבדאללה'],[8,1,'13:00','16:00','מיכל'],
  [8,2,'08:00','12:00','עבדאללה'],[8,2,'12:00','17:00','אודל'],
  [8,3,'08:00','11:00','עבדאללה'],[8,3,'08:00','10:00','מיכל'],
  [8,3,'11:00','14:00','דנה'],[8,3,'14:00','17:00','עבדאללה'],[8,3,'14:00','16:00','מיכל'],
  [8,4,'08:00','17:00','עבדאללה'],
  // Room 9
  [9,0,'08:00','13:00','אופק'],[9,0,'13:00','17:00','אור ה.'],
  [9,1,'13:00','16:00','אור ה.'],[9,1,'16:00','17:00','נועם'],
  [9,2,'08:00','13:00','אודי'],[9,2,'14:00','17:00','אור ה.'],
  [9,3,'08:00','09:00','אור ה.'],[9,3,'13:00','17:00','אור ה.'],[9,4,'08:00','17:00','אופק'],
  // Room 10
  [10,0,'08:00','17:00','עומר'],[10,1,'08:00','15:00','עומר'],[10,1,'15:00','17:00','ניצן י.'],
  [10,2,'08:00','14:00','טטיאנה'],[10,2,'14:00','17:00','ניצן י.'],
  [10,3,'08:00','13:00','עומר'],[10,3,'13:00','17:00','ניצן י.'],[10,4,'08:00','17:00','עומר'],
  // Room 11
  [11,0,'13:00','15:00','סיגל'],[11,1,'08:00','15:00','אודל'],[11,1,'15:00','17:00','שניר'],
  [11,2,'08:00','17:00','שניר'],[11,3,'08:00','11:00','עדן'],[11,3,'13:00','16:00','שניר'],
  [11,4,'08:00','15:00','שניר'],
  // Room 13
  [13,0,'08:00','13:00','סיגל'],[13,0,'13:00','17:00','מאיה'],
  [13,1,'08:00','09:00','מאיה'],[13,1,'13:00','17:00','מאיה'],
  [13,2,'08:00','17:00','מאיה'],[13,3,'08:00','09:00','מאיה'],[13,3,'14:00','17:00','מאיה'],
  [13,4,'08:00','17:00','מאיה'],
  // Room 14
  [14,0,'08:00','17:00','צוף'],[14,1,'08:00','17:00','צוף'],[14,2,'08:00','17:00','צוף'],
  [14,3,'08:00','09:00','טל'],[14,3,'12:00','17:00','צוף'],[14,4,'08:00','17:00','צוף'],
  // Room 17
  [17,0,'08:00','17:00','מאי'],[17,1,'08:00','16:00','מאי'],[17,2,'08:00','15:00','מאי'],
  [17,3,'08:00','09:00','מאי'],[17,3,'09:00','16:00','רימה'],[17,4,'08:00','15:00','מאי'],
  // Room 18
  [18,0,'08:00','16:00','רוני'],[18,1,'08:00','16:00','טטיאנה'],[18,2,'08:00','17:00','עומר'],
  [18,3,'08:00','09:00','רוני'],[18,3,'13:00','17:00','איילת'],[18,4,'12:00','16:00','רוני'],
  // Room 19
  [19,0,'13:00','17:00','מריה'],
  [19,1,'08:00','11:00','רועי'],[19,1,'11:00','16:00','דנה'],[19,1,'16:00','17:00','רועי'],[19,1,'16:00','17:00','מריה'],
  [19,2,'08:00','16:00','רועי'],
  [19,3,'08:00','13:00','מריה'],[19,3,'13:00','15:00','רועי'],[19,3,'13:00','15:00','מריה'],[19,3,'15:00','17:00','טל'],
  [19,4,'08:00','15:00','מריה'],
  // Room 20
  [20,0,'08:00','17:00','טל'],[20,1,'08:00','10:00','אור א.'],[20,1,'13:00','17:00','חן'],
  [20,2,'08:00','17:00','טל'],[20,3,'08:00','17:00','חן'],[20,4,'08:00','17:00','טל'],
  // Room 21
  [21,0,'08:00','16:00','גילי'],[21,1,'08:00','17:00','סתיו ק.'],
  [21,2,'09:00','11:00','מיכל ה.'],[21,2,'12:00','16:00','גילי'],
  [21,3,'08:00','17:00','סתיו ק.'],[21,4,'13:00','14:00','דרור'],
  // Room 22
  [22,1,'08:00','17:00',"ז'אנה"],[22,2,'14:00','17:00','יעל'],[22,3,'08:00','17:00',"ז'אנה"],
  // Room 23
  [23,0,'08:00','13:00','אודי'],[23,0,'13:00','15:00','יהודית'],
  [23,1,'08:00','11:00','אוראל'],[23,1,'13:00','17:00','תמר'],
  [23,2,'08:00','15:00','יהודית'],
  [23,3,'08:00','15:00','תמר'],[23,3,'08:00','15:00','יהודית'],[23,3,'15:00','17:00','תמר'],
  [23,4,'08:00','11:00','יובל'],
  // Room 24
  [24,0,'08:00','15:00','סיון ג.'],[24,1,'08:00','15:00','תהילה'],
  [24,2,'08:00','11:00','רוסלנה'],[24,2,'11:00','16:00','תהילה'],
  [24,3,'08:00','14:00','סיון ג.'],[24,3,'08:00','14:00','תהילה'],[24,3,'14:00','17:00','איסנה'],
  [24,4,'13:00','16:00','רוסלנה'],
  // Room 25
  [25,0,'08:00','17:00','עמיחי'],[25,0,'09:00','12:00','בועז'],
  [25,1,'08:00','12:00','עמיחי'],[25,1,'12:00','13:00','בועז'],[25,1,'13:00','15:00','אן'],[25,1,'15:00','17:00','עמיחי'],
  [25,2,'08:00','17:00','עמיחי'],
  [25,3,'08:00','17:00','עמיחי'],[25,3,'12:00','16:00','בועז'],
  [25,4,'08:00','17:00','עדן'],
  // Room 26
  [26,0,'08:00','14:00','טטיאנה'],[26,0,'14:00','17:00','נועם'],[26,0,'14:00','17:00','ספיר'],[26,0,'15:00','17:00','יפעת'],
  [26,1,'08:00','17:00','נועם'],[26,1,'08:00','17:00','ספיר'],
  [26,2,'08:00','17:00','נועם'],[26,2,'08:00','17:00','ספיר'],
  [26,3,'08:00','11:00','נועם'],[26,3,'08:00','11:00','ספיר'],[26,3,'08:00','11:00','יפעת'],
  [26,3,'13:00','17:00','נועם'],[26,3,'13:00','17:00','ספיר'],[26,3,'13:00','17:00','יפעת'],
  [26,4,'08:00','17:00','טטיאנה'],
  // Room 27
  [27,0,'09:00','12:00','אוראל'],[27,0,'14:00','15:00','אוראל'],[27,0,'15:00','17:00','בר'],
  [27,1,'09:00','14:00','אוראל'],[27,1,'09:00','14:00','מיטל'],[27,1,'14:00','17:00','אור א.'],
  [27,2,'08:00','17:00','אורית ס.'],[27,2,'09:00','14:00','אוראל'],
  [27,3,'13:00','14:00','אוראל'],[27,3,'13:00','17:00','אורית ס.'],[27,3,'13:00','17:00','מיטל'],
  [27,4,'13:00','16:00','בר'],
  // Room 28
  [28,0,'08:00','17:00','אסף'],
  [28,1,'08:00','10:00','לירון'],[28,1,'13:00','17:00','לירון'],
  [28,2,'08:00','17:00','לירון'],
  [28,3,'08:00','09:00','לירון'],[28,3,'13:00','17:00','לירון'],
  [28,4,'08:00','10:00','לירון'],[28,4,'13:00','17:00','לירון'],
  // Room 29
  [29,0,'13:00','16:00','אירית'],
  [29,1,'10:00','17:00','אריאל'],
  [29,2,'10:00','17:00','אריאל'],
  [29,3,'08:00','09:00','איילת'],[29,3,'09:00','10:00','אירית'],[29,3,'13:00','16:00','אריאל'],[29,3,'13:00','16:00','אירית'],
  [29,4,'10:00','17:00','אריאל'],
];

router.post('/', (req, res) => {
  try {
    // 1. Rename rooms to match document numbers
    const allRooms = db.get('rooms').sortBy('id').value();
    const roomNumToId = {};
    allRooms.forEach((room, idx) => {
      if (idx < ROOM_NUMBERS.length) {
        const num = ROOM_NUMBERS[idx];
        const type = ROOM_TYPES[idx];
        db.get('rooms').find({ id: room.id }).assign({ name: `חדר ${num}`, room_type: type }).write();
        roomNumToId[num] = room.id;
      }
    });

    // 2. Create users for all unique employee names
    const allNames = [...new Set(ASSIGNMENTS.map(a => a[4]))];
    const nameToId = {};
    let created = 0;

    allNames.forEach(name => {
      const existing = db.get('users').find(u => u.name === name && u.is_active).value();
      if (existing) {
        nameToId[name] = existing.id;
      } else {
        const safeEmail = `${name.replace(/[\s'.\/]/g, '_')}_${nextId('users')}@clinic.local`;
        const user = {
          id: db.get('_ids.users').value() - 1, // already incremented above
          name,
          email: safeEmail,
          password_hash: bcrypt.hashSync('changeme123', 10),
          role: 'clinical_intern',
          work_percentage: 100,
          phone: null, notes: null,
          is_active: true, can_admin: false,
          created_at: new Date().toISOString(),
        };
        // Re-do with correct ID
        const id = nextId('users');
        user.id = id - 1;
        // Actually just do it properly:
        const uid = db.get('_ids.users').value();
        db.set('_ids.users', uid + 1).write();
        const newUser = { ...user, id: uid };
        db.get('users').push(newUser).write();
        nameToId[name] = uid;
        created++;
      }
    });

    // 3. Clear and re-import permanent assignments
    db.get('room_assignments').remove({ assignment_type: 'permanent' }).write();
    let imported = 0;

    ASSIGNMENTS.forEach(([roomNum, day, start, end, person]) => {
      const roomId = roomNumToId[roomNum];
      const userId = nameToId[person];
      if (!roomId || !userId) return;
      const id = db.get('_ids.room_assignments').value();
      db.set('_ids.room_assignments', id + 1).write();
      db.get('room_assignments').push({
        id,
        user_id: userId,
        room_id: roomId,
        day_of_week: day,
        start_time: start,
        end_time: end,
        assignment_type: 'permanent',
        specific_date: null,
        created_at: new Date().toISOString(),
      }).write();
      imported++;
    });

    // 4. Populate regular_schedules from imported assignments
    const importedUserIds = new Set(Object.values(nameToId));
    db.get('regular_schedules').remove(s => importedUserIds.has(s.user_id)).write();

    const timeToMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
    const userSlots = {};    // userId -> Map<slotKey, {day,start,end}>
    const userRoomHours = {}; // userId -> { roomId: totalMinutes }

    ASSIGNMENTS.forEach(([roomNum, day, start, end, person]) => {
      const userId = nameToId[person];
      const roomId = roomNumToId[roomNum];
      if (!userId || !roomId) return;

      if (!userSlots[userId]) userSlots[userId] = new Map();
      if (!userRoomHours[userId]) userRoomHours[userId] = {};

      const slotKey = `${day}-${start}-${end}`;
      if (!userSlots[userId].has(slotKey)) userSlots[userId].set(slotKey, { day, start, end });

      const dur = timeToMins(end) - timeToMins(start);
      userRoomHours[userId][roomId] = (userRoomHours[userId][roomId] || 0) + dur;
    });

    let schedulesCreated = 0;
    Object.entries(userSlots).forEach(([userId, slotsMap]) => {
      const roomHours = userRoomHours[userId] || {};
      // Preferred room = the room this employee spends the most hours in per week
      const preferredRoomId = Object.entries(roomHours).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      slotsMap.forEach(({ day, start, end }) => {
        db.get('regular_schedules').push({
          id: nextId('regular_schedules'),
          user_id: +userId,
          day_of_week: day,
          start_time: start,
          end_time: end,
          preferred_room_id: preferredRoomId ? +preferredRoomId : null,
        }).write();
        schedulesCreated++;
      });
    });

    res.json({
      message: `הייבוא הושלם בהצלחה`,
      details: `עודכנו שמות 24 חדרים • נוצרו ${created} עובדים חדשים • יובאו ${imported} שיבוצים • נוצרו ${schedulesCreated} רשומות לוח זמנים`,
      rooms: Object.keys(roomNumToId).length,
      usersCreated: created,
      assignments: imported,
      schedulesCreated,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
