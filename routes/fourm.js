const express = require('express');
const router = express.Router();
const db = require('../models/db');

const FOURM_KEY = process.env.FOURM_CHAT_SECRET;

function fourmAuth(req, res, next) {
  const key = req.headers['x-fourm-key'];
  if (!FOURM_KEY || key !== FOURM_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/fourm/builds — Fourm pulls all builds for context
router.get('/builds', fourmAuth, (req, res) => {
  try {
    const builds = db.prepare(
      `SELECT p.id, p.prompt, p.status, p.github_url, p.deploy_url,
              p.railway_url, p.cross_ref_id, p.created_at, u.username, u.email
       FROM projects p
       JOIN users u ON u.id = p.user_id
       ORDER BY p.created_at DESC LIMIT 20`
    ).all();
    res.json({ builds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fourm/relay-status/:id — Fourm checks a specific build
router.get('/relay-status/:id', fourmAuth, (req, res) => {
  try {
    const build = db.prepare(
      `SELECT p.*, u.username, u.email
       FROM projects p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = ?`
    ).get(req.params.id);

    if (!build) return res.status(404).json({ error: 'Build not found' });

    const artifacts = db.prepare(
      `SELECT artifact_type, message_type, content, created_at
       FROM artifacts WHERE project_id = ? ORDER BY created_at DESC LIMIT 10`
    ).all(req.params.id);

    const deployments = db.prepare(
      `SELECT * FROM deployments WHERE project_id = ? ORDER BY created_at DESC LIMIT 3`
    ).all(req.params.id);

    res.json({ build, artifacts, deployments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/fourm/stats — overall platform stats Fourm can reference
router.get('/stats', fourmAuth, (req, res) => {
  try {
    const totalBuilds = db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
    const complete = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status='complete'").get().count;
    const building = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status='building'").get().count;
    const errors = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status='error'").get().count;
    res.json({ totalBuilds, complete, building, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
