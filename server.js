require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/builds', require('./routes/builds'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/fourm', require('./routes/fourm'));

// Diagnostic: verify Drive folder access (authenticated users only)
app.get('/api/drive/test', require('./middleware/auth').authenticate, async (req, res) => {
  try {
    const { listFolderFiles, ARTIFACTS_FOLDER_ID } = require('./services/driveClient');
    const result = await listFolderFiles();
    res.json({
      folder_id: ARTIFACTS_FOLDER_ID,
      file_count: result.files?.length ?? 0,
      files: (result.files || []).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })),
      error: result.error || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/build/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'build.html')));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Relay AI Build Platform running on port ${PORT}`);
});
