export const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
export const DAY_NUMS = [0, 1, 2, 3, 4, 5]; // Sun–Fri

export const ROLES = {
  admin: 'מנהל מערכת',
  supervisor: 'מדריך / מנהל',
  clinical_intern: 'מתמחה קליני',
  educational_intern: 'מתמחה חינוכי',
  art_therapist: 'מטפל/ת באמנות',
  psychiatrist: 'פסיכיאטר/ית',
};

export const ROLE_COLORS = {
  supervisor: 'badge-blue',
  clinical_intern: 'badge-green',
  educational_intern: 'badge-yellow',
  art_therapist: 'badge-red',
  psychiatrist: 'badge-blue',
  admin: 'badge-gray',
};

export const STATUS_LABELS = {
  pending: 'ממתין',
  assigned: 'אושר',
  approved: 'אושר',
  rejected: 'נדחה',
};

export const STATUS_COLORS = {
  pending: 'badge-yellow',
  assigned: 'badge-green',
  approved: 'badge-green',
  rejected: 'badge-red',
};

export const REQUEST_TYPE_LABELS = {
  absence: 'היעדרות',
  room_request: 'בקשת חדר חד-פעמית',
  room_swap: 'חדר חלופי',
  permanent_request: 'בקשת שינוי קבוע',
  library_request: 'בקשת ספריה',
  meeting_request: 'בקשת חדר ישיבות',
  mamod_request: 'בקשת ממד',
  permanent_reduce: 'הפחתת שעות קבועות',
};
