import { useState, useEffect } from 'react';
import api from '../../api';
import { STATUS_LABELS, STATUS_COLORS } from '../../constants';
import { useAuth } from '../../context/AuthContext';

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}

export default function AbsenceReport() {
  const { isAdmin, user } = useAuth();
  const [date, setDate] = useState(todayStr());
  const [dateTo, setDateTo] = useState('');
  const [partial, setPartial] = useState(false);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('success');
  const [loading, setLoading] = useState(false);
  const [myAbsences, setMyAbsences] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [impersonateId, setImpersonateId] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // Recurring absences state
  const [recurringPatterns, setRecurringPatterns] = useState([]);
  const [upcomingOccurrences, setUpcomingOccurrences] = useState([]);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [recDay, setRecDay] = useState('1');
  const [recPartial, setRecPartial] = useState(false);
  const [recStart, setRecStart] = useState('08:00');
  const [recEnd, setRecEnd] = useState('17:00');
  const [recFrom, setRecFrom] = useState(todayStr());
  const [recUntil, setRecUntil] = useState('');
  const [recNotes, setRecNotes] = useState('');
  const [recLoading, setRecLoading] = useState(false);
  const [recMsg, setRecMsg] = useState('');
  // Move modal state
  const [moveModal, setMoveModal] = useState(null); // { recurringId, originalDate }
  const [moveToDate, setMoveToDate] = useState('');

  useEffect(() => {
    loadAbsences();
    loadRecurring();
    if (isAdmin) api.get('/users').then(r => setAllUsers(r.data.filter(u => u.is_active && u.role !== 'admin'))).catch(() => {});
  }, [isAdmin]);

  const loadAbsences = () =>
    api.get('/requests/my').then(r =>
      setMyAbsences(r.data.filter(x => x.request_type === 'absence'))
    ).catch(() => {});

  const loadRecurring = () => {
    api.get('/recurring-absences').then(r => setRecurringPatterns(r.data)).catch(() => {});
    api.get('/recurring-absences/upcoming?weeks=4').then(r => setUpcomingOccurrences(r.data)).catch(() => {});
  };

  const submit = async () => {
    setLoading(true); setMsg('');
    try {
      const body = {
        request_type: 'absence',
        specific_date: date,
        start_time: partial ? startTime : null,
        end_time: partial ? endTime : null,
        notes,
      };
      if (dateTo && dateTo > date) body.date_to = dateTo;
      if (isAdmin && impersonateId) body.impersonate_user_id = impersonateId;
      const r = await api.post('/requests', body);
      setMsg(r.data.message);
      setMsgType('success');
      setDate(todayStr()); setDateTo(''); setPartial(false); setNotes('');
      setImpersonateId(''); setUserSearch('');
      loadAbsences();
    } catch (e) {
      setMsg('שגיאה: ' + (e.response?.data?.error || e.message));
      setMsgType('error');
    } finally { setLoading(false); }
  };

  const cancelAbsence = async (id) => {
    if (!confirm('לבטל את ההיעדרות?')) return;
    try {
      await api.delete(`/requests/my/${id}`);
      loadAbsences();
    } catch (e) { alert('שגיאה: ' + (e.response?.data?.error || e.message)); }
  };

  const submitRecurring = async () => {
    setRecLoading(true); setRecMsg('');
    try {
      await api.post('/recurring-absences', {
        day_of_week: +recDay,
        start_time: recPartial ? recStart : null,
        end_time: recPartial ? recEnd : null,
        active_from: recFrom,
        active_until: recUntil || null,
        notes: recNotes || null,
      });
      setShowRecurringForm(false);
      setRecDay('1'); setRecPartial(false); setRecFrom(todayStr()); setRecUntil(''); setRecNotes('');
      loadRecurring();
    } catch (e) {
      setRecMsg('שגיאה: ' + (e.response?.data?.error || e.message));
    } finally { setRecLoading(false); }
  };

  const deletePattern = async (id) => {
    if (!confirm('למחוק את תבנית ההיעדרות החוזרת? כל מחזורי העתיד יבוטלו.')) return;
    try {
      await api.delete(`/recurring-absences/${id}`);
      loadRecurring();
    } catch (e) { alert('שגיאה'); }
  };

  const skipOccurrence = async (recurringId, date) => {
    try {
      await api.post(`/recurring-absences/${recurringId}/exceptions`, { exception_date: date, type: 'skip' });
      loadRecurring();
    } catch (e) { alert('שגיאה'); }
  };

  const restoreOccurrence = async (recurringId, exId) => {
    try {
      await api.delete(`/recurring-absences/${recurringId}/exceptions/${exId}`);
      loadRecurring();
    } catch (e) { alert('שגיאה'); }
  };

  const submitMove = async () => {
    if (!moveToDate) return;
    try {
      await api.post(`/recurring-absences/${moveModal.recurringId}/exceptions`, {
        exception_date: moveModal.originalDate,
        type: 'moved',
        moved_to_date: moveToDate,
      });
      setMoveModal(null); setMoveToDate('');
      loadRecurring();
    } catch (e) { alert('שגיאה'); }
  };

  const filteredUsers = userSearch
    ? allUsers.filter(u => u.name.includes(userSearch))
    : allUsers;

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* One-time absence form */}
      <div className="card space-y-4">
        <h2 className="text-xl font-bold">דיווח היעדרות</h2>

        {isAdmin && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 space-y-2">
            <label className="label text-purple-800">🎭 הגשה בשם עובד (אופציונלי)</label>
            <input
              type="text"
              className="input w-full"
              placeholder="חיפוש לפי שם..."
              value={userSearch}
              onChange={e => { setUserSearch(e.target.value); setImpersonateId(''); }}
            />
            <select
              className="select w-full"
              value={impersonateId}
              onChange={e => { setImpersonateId(e.target.value); setUserSearch(''); }}
              size={userSearch ? Math.min(filteredUsers.length + 1, 6) : 1}
            >
              <option value="">הגש בשמי ({user?.name})</option>
              {filteredUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <div>
            <label className="label">מתאריך</label>
            <input type="date" className="input w-44" value={date}
              onChange={e => setDate(e.target.value)} min={todayStr()} />
          </div>
          <div>
            <label className="label">עד תאריך (אופציונלי)</label>
            <input type="date" className="input w-44" value={dateTo}
              onChange={e => setDateTo(e.target.value)} min={date || todayStr()} />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input type="checkbox" checked={partial} onChange={e => setPartial(e.target.checked)} className="w-4 h-4" />
          היעדרות חלקית (רק בשעות מסוימות)
        </label>

        {partial && (
          <div className="flex gap-3">
            <div>
              <label className="label">משעה</label>
              <input type="time" className="input w-36" value={startTime} onChange={e => setStartTime(e.target.value)} />
            </div>
            <div>
              <label className="label">עד שעה</label>
              <input type="time" className="input w-36" value={endTime} onChange={e => setEndTime(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <label className="label">הערות (אופציונלי)</label>
          <textarea className="input h-16 resize-none" value={notes}
            onChange={e => setNotes(e.target.value)} placeholder="הוסף הסבר אם רצוי..." />
        </div>

        {msg && (
          <div className={`px-4 py-2 rounded-lg text-sm ${msgType === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {msg}
          </div>
        )}

        <button className="btn btn-primary w-full" onClick={submit} disabled={loading}>
          {loading ? 'שולח...' : 'דווח על היעדרות'}
        </button>
      </div>

      {/* One-time absences list */}
      {myAbsences.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-3 text-gray-700">ההיעדרויות שלי</h3>
          <div className="space-y-2">
            {myAbsences.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{a.specific_date}</div>
                  <div className="text-xs text-gray-500">
                    {a.start_time ? `${a.start_time}–${a.end_time}` : 'כל היום'}
                    {a.notes ? ` · ${a.notes}` : ''}
                  </div>
                </div>
                <span className={`badge ${STATUS_COLORS[a.status]} shrink-0`}>{STATUS_LABELS[a.status]}</span>
                <button
                  className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  onClick={() => cancelAbsence(a.id)}
                  title="בטל היעדרות"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recurring absences */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-700">היעדרות חוזרת</h3>
          <button className="btn btn-primary text-sm" onClick={() => setShowRecurringForm(v => !v)}>
            {showRecurringForm ? 'ביטול' : '+ הגדר תבנית'}
          </button>
        </div>

        {showRecurringForm && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
            <div className="flex gap-3 flex-wrap">
              <div>
                <label className="label">יום בשבוע</label>
                <select className="select w-32" value={recDay} onChange={e => setRecDay(e.target.value)}>
                  {[0,1,2,3,4,5].map(d => <option key={d} value={d}>{DAYS_HE[d]}</option>)}
                </select>
              </div>
              <div>
                <label className="label">מתאריך</label>
                <input type="date" className="input w-40" value={recFrom} min={todayStr()}
                  onChange={e => setRecFrom(e.target.value)} />
              </div>
              <div>
                <label className="label">עד תאריך (אופציונלי)</label>
                <input type="date" className="input w-40" value={recUntil} min={recFrom}
                  onChange={e => setRecUntil(e.target.value)} />
              </div>
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input type="checkbox" checked={recPartial} onChange={e => setRecPartial(e.target.checked)} className="w-4 h-4" />
              חלקית (שעות מסוימות בלבד)
            </label>

            {recPartial && (
              <div className="flex gap-3">
                <div>
                  <label className="label">משעה</label>
                  <input type="time" className="input w-32" value={recStart} onChange={e => setRecStart(e.target.value)} />
                </div>
                <div>
                  <label className="label">עד שעה</label>
                  <input type="time" className="input w-32" value={recEnd} onChange={e => setRecEnd(e.target.value)} />
                </div>
              </div>
            )}

            <div>
              <label className="label">הערות (אופציונלי)</label>
              <input type="text" className="input w-full" value={recNotes}
                onChange={e => setRecNotes(e.target.value)} placeholder="למשל: קורס / גיבוש צוות..." />
            </div>

            {recMsg && <div className="text-sm text-red-600">{recMsg}</div>}

            <button className="btn btn-primary w-full" onClick={submitRecurring} disabled={recLoading}>
              {recLoading ? 'שומר...' : 'שמור תבנית'}
            </button>
          </div>
        )}

        {recurringPatterns.length === 0 && !showRecurringForm && (
          <p className="text-sm text-gray-400">אין תבניות פעילות</p>
        )}

        {/* Active patterns */}
        {recurringPatterns.map(p => {
          const upcoming = upcomingOccurrences.find(u => u.pattern.id === p.id);
          return (
            <div key={p.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-sm">
                    כל יום {DAYS_HE[p.day_of_week]}
                    {p.start_time ? ` · ${p.start_time}–${p.end_time}` : ' · כל היום'}
                  </div>
                  <div className="text-xs text-gray-500">
                    מ-{formatDate(p.active_from)}{p.active_until ? ` עד ${formatDate(p.active_until)}` : ''}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </div>
                </div>
                <button
                  onClick={() => deletePattern(p.id)}
                  className="text-red-400 hover:text-red-600 text-xs shrink-0"
                  title="מחק תבנית"
                >
                  מחק תבנית
                </button>
              </div>

              {/* Upcoming occurrences */}
              {upcoming && upcoming.occurrences.length > 0 && (
                <div className="space-y-1 mt-1">
                  <div className="text-xs text-gray-500 font-medium">מחזורים קרובים:</div>
                  {upcoming.occurrences.map(occ => {
                    const ex = p.exceptions?.find(e => e.exception_date === occ.date);
                    const isSkipped = ex?.type === 'skip';
                    const isMoved = occ.isMoved;
                    return (
                      <div key={occ.date} className={`flex items-center justify-between rounded px-2 py-1 text-xs ${isSkipped ? 'bg-gray-100 text-gray-400' : isMoved ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-700'}`}>
                        <span>
                          {formatDate(occ.date)}
                          {isSkipped && ' — דולג'}
                          {isMoved && ' — הוזז לכאן'}
                        </span>
                        <div className="flex gap-2">
                          {isSkipped ? (
                            <button onClick={() => restoreOccurrence(p.id, ex.id)} className="text-blue-500 hover:underline">שחזר</button>
                          ) : !isMoved ? (
                            <>
                              <button onClick={() => skipOccurrence(p.id, occ.date)} className="text-orange-500 hover:underline">דלג</button>
                              <button onClick={() => { setMoveModal({ recurringId: p.id, originalDate: occ.date }); setMoveToDate(''); }} className="text-blue-500 hover:underline">הזז</button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Move modal */}
      {moveModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setMoveModal(null)}>
          <div className="bg-white rounded-xl p-5 w-80 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
            <h4 className="font-bold">הזז היעדרות</h4>
            <p className="text-sm text-gray-600">
              מחזור {formatDate(moveModal.originalDate)} יבוטל ויועבר לתאריך חדש:
            </p>
            <div>
              <label className="label">תאריך חדש</label>
              <input type="date" className="input w-full" value={moveToDate} min={todayStr()}
                onChange={e => setMoveToDate(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary flex-1" onClick={submitMove} disabled={!moveToDate}>אשר</button>
              <button className="btn btn-ghost flex-1" onClick={() => setMoveModal(null)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
