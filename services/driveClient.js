// Google Drive connector via @replit/connectors-sdk proxy
// Handles identity, token refresh, and auth headers automatically.
const { ReplitConnectors } = require('@replit/connectors-sdk');

const ARTIFACTS_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '1i09sqApDjt3qrEKLsMSx1FUjSXcNDx3Y';

async function driveGet(path) {
  const connectors = new ReplitConnectors();
  const response = await connectors.proxy('google-drive', path, { method: 'GET' });
  return response;
}

// List all files in the artifacts folder
async function listFolderFiles() {
  const res = await driveGet(
    `/drive/v3/files?q=${encodeURIComponent(`'${ARTIFACTS_FOLDER_ID}' in parents`)}&fields=files(id,name,mimeType,createdTime)&pageSize=100`
  );
  return res.json();
}

// Fetch all three artifact files for a given cross_ref_id
// Files are named: {cross_ref_id}_design.json, {cross_ref_id}_build.json, {cross_ref_id}_final.json
async function getArtifactsByRefId(crossRefId) {
  const { files = [] } = await listFolderFiles();

  const matching = files.filter(f => f.name.startsWith(crossRefId + '_'));
  if (!matching.length) return [];

  const results = await Promise.allSettled(
    matching.map(async (file) => {
      const res = await driveGet(`/drive/v3/files/${file.id}?alt=media`);
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = { output: text }; }
      return {
        file_id: file.id,
        file_name: file.name,
        stage: parsed.stage || file.name.replace(`${crossRefId}_`, '').replace('.json', ''),
        agent: parsed.agent || 'Unknown',
        output: parsed.output || '',
        timestamp: parsed.timestamp || null,
        next_stage: parsed.next_stage || null,
      };
    })
  );

  // Sort: design → build → final
  const order = ['design', 'build', 'final'];
  return results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value)
    .sort((a, b) => {
      const ai = order.findIndex(o => a.file_name.includes(o));
      const bi = order.findIndex(o => b.file_name.includes(o));
      return ai - bi;
    });
}

module.exports = { getArtifactsByRefId, listFolderFiles, ARTIFACTS_FOLDER_ID };
