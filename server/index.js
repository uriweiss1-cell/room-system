require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

require('./database'); // init DB

const app = express();

app.use(cors({ origin: true, credentials: true })); // allow all origins for local network access
app.use(express.json());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/rooms', require('./routes/rooms'));
app.use('/api/schedules', require('./routes/schedules'));
app.use('/api/assignments', require('./routes/assignments'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/import', require('./routes/import'));
app.use('/api/notifications', require('./routes/notifications'));

const uploadsDir = path.join(process.env.LOCALAPPDATA || process.env.APPDATA || __dirname, 'room-system-data', 'uploads');
app.use('/uploads', express.static(uploadsDir));

// Serve React build in production
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
