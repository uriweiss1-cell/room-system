const nodemailer = require('nodemailer');

const DAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const REQUEST_TYPE_LABELS = {
  absence: 'היעדרות',
  room_request: 'בקשת חדר חד-פעמית',
  room_swap: 'חדר חלופי',
  permanent_request: 'בקשת שינוי קבוע',
  library_request: 'בקשת ספריה',
  meeting_request: 'בקשת חדר ישיבות',
  mamod_request: 'בקשת ממד',
  permanent_reduce: 'הפחתת שעות קבועות',
};

function getTransporter() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return null;
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
}

async function sendAdminEmail(subject, rows) {
  const to = process.env.ADMIN_EMAIL;
  if (!to) return;
  const transporter = getTransporter();
  if (!transporter) return;

  const rowsHtml = rows.map(([label, value]) =>
    `<tr>
      <td style="padding:6px 12px;font-weight:bold;color:#374151;white-space:nowrap;">${label}</td>
      <td style="padding:6px 12px;color:#111827;">${value}</td>
    </tr>`
  ).join('');

  const html = `
<div dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
  <div style="background:#1d4ed8;padding:16px 20px;">
    <span style="color:#fff;font-size:18px;font-weight:bold;">מערכת שיבוץ חדרים</span>
  </div>
  <div style="padding:20px;">
    <h3 style="margin:0 0 16px;color:#1d4ed8;">${subject}</h3>
    <table style="border-collapse:collapse;width:100%;background:#f9fafb;border-radius:8px;">
      ${rowsHtml}
    </table>
  </div>
  <div style="background:#f3f4f6;padding:10px 20px;text-align:center;">
    <span style="color:#9ca3af;font-size:11px;">הודעה אוטומטית — אין להשיב למייל זה</span>
  </div>
</div>`;

  try {
    await transporter.sendMail({
      from: `"מערכת שיבוץ חדרים" <${process.env.GMAIL_USER}>`,
      to,
      subject: `[שיבוץ חדרים] ${subject}`,
      html,
    });
  } catch (e) {
    console.error('[email] שגיאה בשליחת מייל:', e.message);
  }
}

module.exports = { sendAdminEmail, REQUEST_TYPE_LABELS, DAYS_HE };
