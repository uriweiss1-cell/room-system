require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { initDB } = require('./database');
const { initVapid } = require('./webpush');

async function main() {
  await initDB();
  initVapid();

  const app = express();
  app.use(cors({ origin: true, credentials: true }));
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
