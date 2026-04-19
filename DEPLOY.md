# פריסה לענן – מדריך מהיר

## שלב 1: GitHub
1. צור חשבון ב־https://github.com (חינם)
2. צור repository חדש בשם `room-system` (פרטי/ציבורי – לא משנה)
3. בתיקיית הפרויקט (`C:\...\room-system`) הרץ בטרמינל:
   ```
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/room-system.git
   git push -u origin main
   ```

## שלב 2: Render.com
1. צור חשבון ב־https://render.com (חינם)
2. לחץ **New → Web Service**
3. חבר את ה־GitHub repository שיצרת
4. Render יזהה אוטומטית את `render.yaml` ויגדיר הכל

**חשוב:** הוסף **Disk** ($1/חודש):
- Dashboard → שירות → **Disks** → Add Disk
- Mount Path: `/data`
- Size: 1 GB

## שלב 3: קישור נוח + QR
לאחר הפריסה תקבל URL כגון:
`https://room-system-xxxx.onrender.com`

1. שמור כ-Bookmark בטלפון
2. ליצירת QR Code: https://qr.io → הכנס את ה-URL → הורד תמונה
3. **PWA (כמו אפליקציה)**: מדפדפן Safari/Chrome, לחץ **Share → Add to Home Screen** → האפליקציה תופיע כאייקון

## פרטי מנהל ראשוניים (בסביבה חדשה)
- מייל: `admin@clinic.local`
- סיסמה: `admin123`
- **החלף מיד** לאחר הכניסה הראשונה!

## הפעלה מקומית (כרגיל)
```
cd room-system
npm run dev
```
