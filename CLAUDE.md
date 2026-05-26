# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Rules

**Before making any code changes, always summarize what you are about to do and wait for explicit user confirmation.** Do not implement anything automatically — present the plan first.

## Commands

```bash
# Development (local — not used in production)
npm run dev           # starts both server (port 3001) and client (port 5173) via concurrently
npm run server        # backend only
npm run client        # frontend only
npm run build         # production build of client (cd client && npm run build)
npm run install:all   # install deps for both server and client
```

Render's build command (from render.yaml): `cd server && npm install && cd ../client && npm install && npm run build`
Start command: `node server/index.js`

**IMPORTANT**: The user accesses the Render cloud deployment, not a local server. Local changes are invisible until pushed. `client/dist` is in .gitignore — Render builds it automatically. Branch is `master`, NOT `main`.

## Architecture

```
room-system/
  server/          Express.js backend (port 3001)
    index.js       Entry point, serves client/dist as static files in production
    database.js    lowdb v1.0.0 + CloudAdapter (MongoDB Atlas sync via MONGODB_URI env var)
    middleware/auth.js   JWT authentication + granular permissions (see Permissions section)
    routes/
      import.js        One-time data import from hardcoded תשנ"ו schedule
      assignments.js   Room assignment algorithm + CRUD + guest assignments + where-is query
                       Also includes GET /assignments/audit — compliance check route
      schedules.js     Employee regular_schedules (work days/hours/preferred room)
      requests.js      One-time and permanent special-room requests (absence, room_request,
                       room_swap, library_request, meeting_request, mamod_request,
                       permanent_request, permanent_reduce)
      users.js         User management
      rooms.js         Room management
      notifications.js
      auth.js
  client/src/      React + Vite + Tailwind
    pages/admin/   Assignments.jsx, Users.jsx, Rooms.jsx, Requests.jsx
    pages/employee/ Home.jsx (tile dashboard), MySchedule.jsx, AbsenceReport.jsx,
                    OneTimeRequest.jsx, Library.jsx, MeetingRoom.jsx,
                    Mamod.jsx, RoomQuery.jsx
    api.js         Axios instance (baseURL: '/api', auto-attaches JWT from localStorage)
    constants.js   DAYS, DAY_NUMS, ROLES, ROLE_COLORS, STATUS_LABELS, STATUS_COLORS,
                   REQUEST_TYPE_LABELS
```

## Database (lowdb v1.0.0)

Collections: `users`, `rooms`, `room_assignments`, `regular_schedules`, `one_time_requests`, `notifications`, `_ids`, `dismissed_conflicts`

`dismissed_conflicts` — created on first use (not seeded). Stores admin-dismissed conflict slots so the algorithm doesn't re-surface them on the next run. Schema: `{ user_id, day_of_week, start_time, end_time }`.

### Key quirks
- `preferred_room_id` is stored as a **string** when coming from HTML `<select>` (e.g. `"4"` not `4`). Always coerce with `+` before numeric comparison: `db.get('rooms').find({ id: +s.preferred_room_id })`
- `day_of_week` can also arrive as a string from client inputs. Always coerce with `+` before numeric comparison: `+a.day_of_week === dayOfWeek`. lodash `.filter({ day_of_week: 1 })` will silently miss string `"1"` — use explicit `.filter(a => +a.day_of_week === N)` instead.
- `_ids` collection stores auto-increment counters. Use `nextId('collection_name')` helper from database.js
- Room IDs ≠ room numbers. After import, "חדר 6" has database `id: 4` (rooms were renamed/reordered). Never assume room number = room ID.
- 24 rooms total, numbered: 3,4,5,6,7,8,9,10,11,13,14,17,18,19,20,21,22,23,24,25,26,27,28,29

### `room_assignments` fields
- `assignment_type`: `'permanent'` (regular weekly slot) | `'one_time'` (guest booking — has `specific_date` and `guest_name`)
- `is_manual: true` — set on assignments created via admin manual booking or approved permanent requests. Protects the assignment from being removed by the algorithm on the next run.
- `room_type` values on `rooms`: `'regular'`, `'committee'`, `'library'`, `'meeting'`, `'mamod'`

### `one_time_requests` fields
- `request_type` values: `absence`, `room_request`, `room_swap`, `library_request`, `meeting_request`, `mamod_request`, `permanent_request`, `permanent_reduce`
- `start_time` / `end_time` — the **original requested** time range. **Never overwrite these** — the admin picker restores them when reopening a request.
- `assigned_start_time` / `assigned_end_time` — the **actual assigned** slot (used for partial/split assignments where the assigned window differs from the requested window). Always prefer these over `start_time`/`end_time` when computing occupancy.
- `parent_request_id` — sibling records created via "add-partial" link back to the original request via this field.
- `status` values: `'pending'`, `'assigned'`, `'approved'`, `'rejected'`
- `room_swap` specific fields: `original_room_id` (the room the user is swapping from), `swap_reason` (user-provided text)
- `permanent_request` specific field: `target_room_type` — the room type the user is requesting (e.g. `'regular'`)

## Permissions System

Three tiers of access:

| Tier | Condition | Access |
|---|---|---|
| Full admin | `role === 'admin'` | Everything |
| Legacy can_admin | `can_admin: true` AND no new perm flags set | Everything (backward compat) |
| Granular perms | Any `perm_*` flag set | Only what's granted |

**5 permission flags**: `perm_assignments`, `perm_algorithm`, `perm_requests`, `perm_users`, `perm_rooms`

**Middleware**:
- `requireAdmin` — full admin or legacy can_admin only (destructive/system operations)
- `requirePerm('assignments')` — granular check; also passes for full admin and legacy can_admin
- `requirePermOrRole('assignments', 'secretary')` — passes if the user has the perm flag OR has the specified role. Used for read-only access routes (e.g. the secretary grid).

**Frontend**: `useAuth()` returns `{ isAdmin, isSecretary, perms }` where `perms` is an object with the 5 boolean flags. Use `perms.algorithm` etc. to gate UI elements, not just `isAdmin`.

**Always use `requirePerm(...)` for new routes** (not `requireAdmin`) unless the operation truly requires full system admin (e.g. user role changes).

### Secretary role
`role === 'secretary'` is a special non-admin role with read-only access to the weekly grid. Secretaries:
- See a limited nav (grid, room-query, library, meeting-room, mamod — no personal schedule/absence)
- Access the grid via `/secretary/grid` which renders Assignments.jsx in `readOnly` mode
- Are granted access to read-only assignment routes via `requirePermOrRole('assignments', 'secretary')`
- `isSecretary` is exported from `useAuth()` and used to filter nav links and Home.jsx tiles

## Assignment Algorithm (assignments.js → generateAssignments)

**Who gets processed**: Only users with entries in `regular_schedules`. Users without schedules keep their existing `room_assignments` untouched.

**Priority order**: admin(-1) > psychiatrist(0) > supervisor(1) > art_therapist(2) > clinical_intern(3) > educational_intern(4)

**Room pool**: `rooms.filter(r => r.room_type === 'regular' || r.room_type === 'committee')` — committee rooms (like חדר 6) ARE included since they serve as regular offices on non-meeting days.

**Wednesday protection**: `effectiveSlots()` removes Wednesday 09:00–13:00 slots for supervisors/clinical_interns/educational_interns, and 11:00–13:00 for art_therapists (staff meeting time).

**Role-based assignment rules**:
- **psychiatrist / supervisor**: must get a room for ALL requested hours; can be different rooms on different days if needed.
- **art_therapist**: priority capped at first 2 unique work-days; must get the SAME room across those days. Day 3+ is processed after all higher-priority users with whatever rooms remain (no fixed-room guarantee, no conflict raised). If no single room is free for the 2 priority days → `roleConstraintConflict`.
- **clinical_intern**: must get the SAME room for at least 2 days; remaining days can be any available room. If no single room is free for even 2 days → `roleConstraintConflict`.
- **educational_intern**: any available room per day; no fixed-room requirement.

**Three-path processing** (per user, in priority order):
1. **wantToMove** (`preferred_room_id ≠ most-used current room`): clear non-manual assignments, re-assign applying role rules above.
2. **stay/extend**: keep existing assignments; fill only uncovered sub-slots using `targetRoomId = preferredId || currentRoomId`.
3. **lowPriorityExtraSlots**: art_therapist day 3+ slots, processed after the main loop with no priority guarantee.

**Art-therapy preferred rooms**: `ART_THERAPY_ROOM_NUMBERS = [10, 11, 18, 20, 21, 22, 23, 25, 26, 27, 29]`. The algorithm tries these rooms first for any `art_therapist` user, in all three processing paths. If no suitable room is available and the user is assigned elsewhere, a warning is generated.

**Algorithm output** includes:
- `assigned` — count of new assignments written.
- `conflicts[]` — slots with no available room.
- `preferenceConflicts[]` — user wants room X but it's blocked by someone else.
- `roleConstraintConflicts[]` — fixed-room rule can't be met (art_therapist or clinical_intern). Each entry includes `availablePerDay` and `candidateRooms` (rooms free across all required days) so the admin can manually resolve.
- `artTherapistRoomWarnings[]` — art_therapist assigned to a room outside `ART_THERAPY_ROOM_NUMBERS`. Each entry includes `userName`, `assignedRoomName`, `slots`, and `artTherapyRoomsAvailable` (suitable rooms that were full at the time). Displayed as a separate dismissible panel in Assignments.jsx.
- `roomWishMismatches[]` — users whose current room ≠ preferred room, each with `canMove` and `assignmentId` for the actionable "move" button.
- `suggestions[]` — auto-generated resolution options for conflicts.
- `userStats` — per-user summary of assigned slots and rooms.
- `guestConflicts[]` — permanent assignments that clash with approved one-time/guest bookings on specific dates.
- `assignmentTrace[]` — debug log of what each user was assigned and whether they got their preferred room.
- `message` — Hebrew summary string shown to admin after algorithm run.

**Compliance audit** (`GET /assignments/audit`): a separate read-only endpoint that checks all current permanent assignments against role rules — fixed room for art_therapist priority days, art_therapist in suitable rooms, fixed room for clinical_intern, all days covered for psychiatrist/supervisor. Returns `{ violations[], okCount, totalChecked }`.

**Import behavior** (`import.js`):
- Renames 24 rooms to match תשנ"ו document numbers
- Creates users for all unique employee names (password: `changeme123`)
- Creates `room_assignments` (permanent) for all slots
- Creates `regular_schedules` for all employees — work days/hours only, `preferred_room_id: null`. Each employee/admin sets preferred room manually afterward.

## Key Data Flows

**Employee sets preferred room**: MySchedule.jsx → `PUT /schedules/my` → stored in regular_schedules.preferred_room_id → algorithm reads it next run.

**Admin sets employee schedule**: Users.jsx "לוח זמנים" button → `GET/PUT /schedules/user/:userId`.

**Permanent special-room requests** (library / meeting room / mamod): When approved in requests.js, a `room_assignments` entry is created with `is_manual: true` and `notes` from the request. When deleted or rejected, that assignment is cleaned up.

**Conflict resolution UI** (Assignments.jsx): After clicking "אשר ↵" on a suggestion, the resolved slot disappears from the UI immediately and the applied room+day+time is tracked in `occupiedSlots` state — filtering those rooms out of remaining suggestions so they aren't double-offered.

**Absence handling**: Partial absences (with `start_time`/`end_time`) only free a room if the absence window **fully covers** the requested time slot. A partial absence does not strike through an employee's full-day permanent assignment in MySchedule.jsx.

## Roles

Hebrew names in UI (from constants.js): `admin=מנהל מערכת`, `psychiatrist=פסיכיאטר/ית`, `supervisor=מדריך / מנהל`, `art_therapist=מטפל/ת באמנות`, `clinical_intern=מתמחה קליני`, `educational_intern=מתמחה חינוכי`, `secretary=מזכיר/ה`

Admin users log in with email+password (JWT). Non-admin users log in with name+PIN (or name+password).

`secretary` does not appear in the assignment algorithm priority order — secretaries have no room assignments and no `regular_schedules`.

## Environment Variables (Render)

- `NODE_ENV=production`
- `DATA_DIR=/data` (persistent disk mount)
- `JWT_SECRET` (auto-generated)
- `MONGODB_URI` (set manually in Render dashboard — MongoDB Atlas connection string for CloudAdapter sync)
