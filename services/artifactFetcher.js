const { getArtifactsByRefId } = require('./driveClient');

async function fetchArtifacts(crossRefId) {
  return getArtifactsByRefId(crossRefId);
}

module.exports = { fetchArtifacts };
