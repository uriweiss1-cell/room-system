# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (local — not used in production)
npm run dev           # starts both server (port 3001) and client (port 5173) via concurrently

# Build client (required before pushing if testing locally)
cd client && npm run build

# Deploy to production
git push origin master   # Render auto-builds and deploys (branch is 'master', NOT 'main')
```

Render's build command (from render.yaml): `cd server && npm install && cd ../client && npm install && npm run build`
Start command: `node server/index.js`

**IMPORTANT**: The user accesses the Render cloud deployment, not a local server. Local changes are invisible until pushed. `client/dist` is in .gitignore — Render builds it automatically.

## Architecture

```
room-system/
  server/          Express.js backend (port 3001)
    index.js       Entry point, serves client/dist as static files in production
    database.js    lowdb v1.0.0 + CloudAdapter (MongoDB Atlas sync via MONGODB_URI env var)
    middleware/auth.js   JWT authentication
    routes/
      import.js    One-time data import from hardcoded תשנ"ו schedule
      assignments.js  Room assignment algorithm + CRUD
      schedules.js    Employee regular_schedules (work days/hours/preferred room)
      requests.js     One-time and permanent special-room requests
      users.js        User management
      rooms.js        Room management
      notifications.js
      auth.js
  client/src/      React + Vite + Tailwind
    pages/admin/   Assignments.jsx, Users.jsx, Rooms.jsx, Requests.jsx
    pages/employee/ MySchedule.jsx, OneTimeRequest.jsx, Library.jsx, MeetingRoom.jsx, RoomQuery.jsx
    api.js         Axios instance (baseURL: '/api', auto-attaches JWT from localStorage)
    constants.js   ROLES, ROLE_COLORS, DAYS
```

## Database (lowdb v1.0.0)

Collections: `users`, `rooms`, `room_assignments`, `regular_schedules`, `one_time_requests`, `notifications`, `_ids`

Key quirks:
- `preferred_room_id` is stored as a **string** when coming from HTML `<select>` (e.g. `"4"` not `4`). Always coerce with `+` before numeric comparison: `db.get('rooms').find({ id: +s.preferred_room_id })`
- `_ids` collection stores auto-increment counters. Use `nextId('collection_name')` helper from database.js
- Room IDs ≠ room numbers. After import, "חדר 6" has database `id: 4` (rooms were renamed/reordered). Never assume room number = room ID.
- 24 rooms total, numbered: 3,4,5,6,7,8,9,10,11,13,14,17,18,19,20,21,22,23,24,25,26,27,28,29

## Assignment Algorithm (assignments.js → generateAssignments)

**Who gets processed**: Only users with entries in `regular_schedules`. Users without schedules keep their existing `room_assignments` untouched.

**Priority order**: admin(-1) > psychiatrist(0) > supervisor(1) > art_therapist(2) > clinical_intern(3) > educational_intern(4)

**Room pool**: `rooms.filter(r => r.room_type === 'regular' || r.room_type === 'committee')` — committee rooms (like חדר 6) ARE included since they serve as regular offices on non-meeting days.

**Wednesday protection**: `effectiveSlots()` removes Wednesday 09:00–13:00 slots for supervisors/clinical_interns/educational_interns, and 11:00–13:00 for art_therapists (staff meeting time).

**Two-pass logic**:
1. **Pass 1**: Users whose `preferred_room_id === currentRoomId` are pre-reserved — they keep their room regardless of priority.
2. **Pass 2**: Everyone else, in priority order: try preferred room → try current room (only if it doesn't block someone else's explicit preference, via `blocksPreference()`) → try any free room → per-slot fallback.

**`blocksPreference(roomId, userId)`**: Returns true if some OTHER user has `roomId` as their preferred room. Prevents "current room" continuity from blocking another user's explicit preference.

**Import behavior** (`import.js`):
- Renames 24 rooms to match תשנ"ו document numbers
- Creates users for all unique employee names (password: `changeme123`)
- Creates `room_assignments` (permanent) for all slots
- Creates `regular_schedules` for all employees — work days/hours only, `preferred_room_id: null`. Each employee/admin sets preferred room manually afterward.

## Key Data Flows

**Employee sets preferred room**: MySchedule.jsx → `PUT /schedules/my` → stored in regular_schedules.preferred_room_id → algorithm reads it next run.

**Admin sets employee schedule**: Users.jsx "לוח זמנים" button → `GET/PUT /schedules/user/:userId`.

**Permanent special-room requests** (library/meeting room): When approved in requests.js, a `room_assignments` entry is created with `notes` from the request. When deleted or rejected, that assignment is cleaned up.

**Conflict resolution UI** (Assignments.jsx): After clicking "אשר ↵" on a suggestion, the resolved slot disappears from the UI immediately and the applied room+day+time is tracked in `occupiedSlots` state — filtering those rooms out of remaining suggestions so they aren't double-offered.

## Roles

Hebrew names in UI: `admin=מנהל`, `psychiatrist=פסיכיאטרית`, `supervisor=מדריכה`, `art_therapist=מטפלת באמנות`, `clinical_intern=מתמחה קלינית`, `educational_intern=מתמחה חינוכית`

Admin users log in with email+password (JWT). Non-admin users log in with name+PIN (or name+password). `can_admin` flag gives non-admin users access to the admin panel.

## Environment Variables (Render)

- `NODE_ENV=production`
- `DATA_DIR=/data` (persistent disk mount)
- `JWT_SECRET` (auto-generated)
- `MONGODB_URI` (set manually in Render dashboard — MongoDB Atlas connection string for CloudAdapter sync)
