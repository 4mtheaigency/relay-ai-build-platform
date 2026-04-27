const { getUncachableGoogleSheetClient } = require('./sheetsClient');

const SPREADSHEET_ID = '1B08-0NhdeydCci3El4vWiq6KewfItDGp04Jm254NkHU';
const SHEET_TAB = 'Sheet1';

// The message_type that n8n watches for to kick off Stage 1 (OpenAI/Chat Strategic).
// Set RELAY_TRIGGER_TYPE env var to override if your n8n uses a different value.
const RELAY_TRIGGER_TYPE = process.env.RELAY_TRIGGER_TYPE || 'new_build_request';

// Generate a 12-character hex ID matching the relay's existing format
function generateCrossRefId() {
  return [...Array(12)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

// Headers: timestamp | channel | author | message | message_type | cross_ref_id
// Columns: A         | B       | C      | D       | E            | F
function rowToObject(row) {
  return {
    timestamp: row[0] || '',
    channel: row[1] || '',
    author: row[2] || '',
    message: row[3] || '',
    message_type: row[4] || '',
    cross_ref_id: row[5] || '',
  };
}

async function writeBuildRequest(username, prompt) {
  const sheets = await getUncachableGoogleSheetClient();
  const crossRefId = generateCrossRefId();
  const timestamp = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[timestamp, 'three-ai-relay', username, prompt, RELAY_TRIGGER_TYPE, crossRefId]],
    },
  });

  return crossRefId;
}

async function getRelayRows(crossRefId) {
  const sheets = await getUncachableGoogleSheetClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_TAB}!A:F`,
  });

  const rows = res.data.values || [];
  // Skip header row (row 0), filter by cross_ref_id
  return rows
    .slice(1)
    .filter((row) => row[5] === crossRefId)
    .map(rowToObject);
}

function deriveStatus(rows) {
  if (!rows || rows.length === 0) return 'building';
  const types = rows.map((r) => r.message_type);
  if (types.includes('build_complete')) return 'complete';
  return 'building';
}

function parseArtifactId(message) {
  const match = message && message.match(/^ARTIFACT:(.+)$/);
  return match ? match[1] : null;
}

function buildDriveLink(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function formatRowsForFrontend(rows) {
  return rows.map((row) => {
    const artifactId = parseArtifactId(row.message);
    return {
      timestamp: row.timestamp,
      author: row.author,
      message_type: row.message_type,
      message: artifactId ? null : row.message,
      artifact_id: artifactId || null,
      artifact_url: artifactId ? buildDriveLink(artifactId) : null,
    };
  });
}

module.exports = {
  writeBuildRequest,
  getRelayRows,
  deriveStatus,
  formatRowsForFrontend,
  RELAY_TRIGGER_TYPE,
};
