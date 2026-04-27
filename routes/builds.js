const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../models/db');
const { authenticate } = require('../middleware/auth');
const { writeBuildRequest, getRelayRows, deriveStatus, formatRowsForFrontend } = require('../services/sheetRelay');
const { fetchArtifacts } = require('../services/artifactFetcher');
const { deployToGitHub } = require('../services/githubDeploy');
const { deployToRailway, getDeploymentStatus } = require('../services/railwayDeploy');

function buildRelayPrompt(userPrompt, opts = {}) {
  const lines = [
    '[RELAY AI BUILD PLATFORM]',
    'You are one stage of a three-AI relay pipeline (ChatGPT → Claude → Gemini).',
    'Your output will be automatically parsed, pushed to a GitHub repository, and deployed LIVE to Railway.',
    'Build complete, production-ready, fully deployable code — no placeholders, no mocked data.',
    '',
  ];
  if (opts.iteration) {
    lines.push('ORIGINAL BUILD REQUEST:');
    lines.push(opts.originalPrompt);
    lines.push('');
    if (opts.githubUrl) lines.push(`PREVIOUS DEPLOYMENT: ${opts.githubUrl}`, '');
    lines.push('USER REFINEMENT / ITERATION REQUEST:');
  } else {
    lines.push('BUILD REQUEST:');
  }
  lines.push(userPrompt);
  return lines.join('\n');
}

// POST /api/builds — submit a new build request to the relay Sheet
router.post('/', authenticate, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const projectId = uuidv4();
  const userId = req.user.id;
  const username = req.user.username;
  const cleanPrompt = prompt.trim();

  try {
    const relayPrompt = buildRelayPrompt(cleanPrompt);
    const crossRefId = await writeBuildRequest(username, relayPrompt);
    db.prepare(`
      INSERT INTO projects (id, user_id, cross_ref_id, prompt, status, missing_requirements)
      VALUES (?, ?, ?, ?, 'building', '[]')
    `).run(projectId, userId, crossRefId, cleanPrompt);
    res.json({ success: true, id: projectId, cross_ref_id: crossRefId, status: 'building' });
  } catch (err) {
    console.error('Sheet write error:', err.message);
    res.status(500).json({ error: 'Failed to submit build request: ' + err.message });
  }
});

// GET /api/builds — list all projects for this user
router.get('/', authenticate, (req, res) => {
  const projects = db.prepare(`
    SELECT id, cross_ref_id, prompt, status, missing_requirements, created_at, updated_at
    FROM projects WHERE user_id = ?
    ORDER BY created_at DESC
  `).all(req.user.id);
  res.json(projects.map((p) => ({
    ...p,
    missing_requirements: JSON.parse(p.missing_requirements || '[]'),
  })));
});

// GET /api/builds/:id — get project + live relay rows + stored artifacts
router.get('/:id', authenticate, async (req, res) => {
  const project = db.prepare(`SELECT * FROM projects WHERE id = ? AND user_id = ?`)
    .get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  // Load any already-fetched artifacts from DB
  const storedArtifacts = db.prepare(`SELECT * FROM artifacts WHERE project_id = ?`)
    .all(project.id);

  let stages = [];
  let liveStatus = project.status;
  let sheetError = null;

  try {
    const rows = await getRelayRows(project.cross_ref_id);
    liveStatus = deriveStatus(rows);
    stages = formatRowsForFrontend(rows);

    // Update local status if changed
    if (liveStatus !== project.status) {
      db.prepare(`UPDATE projects SET status = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(liveStatus, project.id);
    }

    // If complete and we haven't fetched artifacts yet, fetch them from Drive now
    if (liveStatus === 'complete' && storedArtifacts.length === 0) {
      try {
        const fetched = await fetchArtifacts(project.cross_ref_id);
        for (const a of fetched) {
          db.prepare(`
            INSERT OR IGNORE INTO artifacts (id, project_id, file_id, author, message_type, artifact_type, name, mime_type, content)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(uuidv4(), project.id, a.file_id, a.agent, a.stage, a.stage, a.file_name, 'application/json', a.output);
        }
        // Reload from DB
        storedArtifacts.push(...db.prepare(`SELECT * FROM artifacts WHERE project_id = ?`).all(project.id));
      } catch (driveErr) {
        console.error('Drive fetch error:', driveErr.message);
        sheetError = 'Could not fetch artifact content from Drive: ' + driveErr.message;
      }
    }
  } catch (err) {
    console.error('Sheet read error:', err.message);
    sheetError = err.message;
  }

  res.json({
    id: project.id,
    cross_ref_id: project.cross_ref_id,
    prompt: project.prompt,
    status: liveStatus,
    created_at: project.created_at,
    updated_at: project.updated_at,
    github_url: project.github_url || null,
    deploy_url: project.deploy_url || null,
    railway_url: project.railway_url || null,
    railway_project_id: project.railway_project_id || null,
    railway_service_id: project.railway_service_id || null,
    parent_id: project.parent_id || null,
    stages,
    artifacts: storedArtifacts,
    error: sheetError,
  });
});

// POST /api/builds/:id/deploy — push artifacts to GitHub
router.post('/:id/deploy', authenticate, async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (project.status !== 'complete') return res.status(400).json({ error: 'Build is not complete yet' });

  const artifacts = db.prepare('SELECT * FROM artifacts WHERE project_id = ?').all(project.id);
  if (!artifacts.length) return res.status(400).json({ error: 'No artifacts found for this build' });

  const deployId = uuidv4();
  db.prepare(`INSERT INTO deployments (id, project_id, user_id, status) VALUES (?, ?, ?, 'pending')`)
    .run(deployId, project.id, req.user.id);

  try {
    // Step 1 — Push to GitHub (skip if already done)
    let github;
    if (project.github_url) {
      const repoName = `relay-${project.cross_ref_id}`;
      const ghToken = process.env.GITHUB_TOKEN;
      let owner = '4mtheaigency';
      try {
        const axios = require('axios');
        const u = await axios.get('https://api.github.com/user', {
          headers: { Authorization: `token ${ghToken}`, 'User-Agent': 'Three-AI-Relay-Platform' }
        });
        owner = u.data.login;
      } catch (_) {}
      github = { repo_url: project.github_url, owner, repo: repoName };
    } else {
      github = await deployToGitHub(project.cross_ref_id, artifacts, project.prompt);
      db.prepare(`UPDATE projects SET github_url = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(github.repo_url, project.id);
    }

    // Step 2 — Deploy to Railway (optional, skip gracefully if no token)
    let railway = null;
    let railway_error = null;
    if (process.env.RAILWAY_TOKEN) {
      try {
        const repoFullName = `${github.owner}/${github.repo}`;
        railway = await deployToRailway(repoFullName, project.cross_ref_id);
        db.prepare(`UPDATE projects SET deploy_url = ?, railway_url = ?, railway_project_id = ?, railway_service_id = ?, updated_at = datetime('now') WHERE id = ?`)
          .run(railway.deploy_url, railway.railway_project_url, railway.project_id, railway.service_id, project.id);
      } catch (railwayErr) {
        railway_error = railwayErr.message;
        console.error('Railway deploy error:', railwayErr.message);
      }
    }

    db.prepare(`UPDATE deployments SET status = 'success', github_repo_url = ?, deployment_url = ?, deploy_type = 'code' WHERE id = ?`)
      .run(github.repo_url, railway ? railway.deploy_url : github.repo_url, deployId);

    res.json({
      success: true,
      github_url: github.repo_url,
      deploy_url: railway ? railway.deploy_url : null,
      railway_project_url: railway ? railway.railway_project_url : null,
      files_pushed: github.files_pushed,
      railway_error: railway_error || null,
    });
  } catch (err) {
    console.error('Deploy error:', err.message);
    db.prepare(`UPDATE deployments SET status = 'failed', error_message = ? WHERE id = ?`)
      .run(err.message, deployId);
    res.status(500).json({ error: 'Deploy failed: ' + err.message });
  }
});

// GET /api/builds/:id/deployments — deployment history for a build
router.get('/:id/deployments', authenticate, (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const deployments = db.prepare('SELECT * FROM deployments WHERE project_id = ? ORDER BY created_at DESC')
    .all(project.id);
  res.json(deployments);
});

// GET /api/builds/:id/railway-status — live Railway deployment status
router.get('/:id/railway-status', authenticate, async (req, res) => {
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  if (!project.railway_project_id || !project.railway_service_id) {
    return res.json({ status: null, message: 'Not deployed to Railway yet' });
  }

  try {
    const deployment = await getDeploymentStatus(project.railway_project_id, project.railway_service_id);
    if (!deployment) return res.json({ status: 'UNKNOWN', message: 'No deployment found yet' });

    // If deployment succeeded and we now have a static URL but no deploy_url stored, save it
    if (deployment.staticUrl && !project.deploy_url) {
      db.prepare(`UPDATE projects SET deploy_url = ?, updated_at = datetime('now') WHERE id = ?`)
        .run(deployment.staticUrl, project.id);
    }

    res.json({
      status: deployment.status,
      deploy_url: deployment.staticUrl || project.deploy_url || null,
      deployment_id: deployment.id,
      created_at: deployment.createdAt,
    });
  } catch (err) {
    res.json({ status: 'ERROR', message: err.message });
  }
});

// POST /api/builds/:id/iterate — submit a refinement/iteration of an existing build
router.post('/:id/iterate', authenticate, async (req, res) => {
  const { refinement } = req.body;
  if (!refinement || !refinement.trim()) {
    return res.status(400).json({ error: 'Refinement prompt is required' });
  }

  const parent = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!parent) return res.status(404).json({ error: 'Build not found' });
  if (parent.status !== 'complete') return res.status(400).json({ error: 'Can only iterate on a completed build' });

  const projectId = uuidv4();
  const cleanRefinement = refinement.trim();

  try {
    // Fetch Railway deployment status for AI context
    let railwayContext = '';
    if (parent.railway_project_id && parent.railway_service_id) {
      try {
        const dep = await getDeploymentStatus(parent.railway_project_id, parent.railway_service_id);
        if (dep && (dep.status === 'FAILED' || dep.status === 'CRASHED')) {
          railwayContext = `\n[RAILWAY DEPLOYMENT STATUS: ${dep.status}] The previous build failed on Railway. Common fixes: ensure PORT uses process.env.PORT, package.json has a valid start script, app.listen binds to 0.0.0.0, and all dependencies are in package.json.\n`;
        } else if (dep) {
          railwayContext = `\n[RAILWAY DEPLOYMENT STATUS: ${dep.status}] The app is currently ${dep.status.toLowerCase()} on Railway.\n`;
        }
      } catch (_) {}
    }

    const relayPrompt = buildRelayPrompt(cleanRefinement + railwayContext, {
      iteration: true,
      originalPrompt: parent.prompt,
      githubUrl: parent.github_url || null,
    });
    const crossRefId = await writeBuildRequest(req.user.username, relayPrompt);
    db.prepare(`
      INSERT INTO projects (id, user_id, cross_ref_id, prompt, status, missing_requirements, parent_id)
      VALUES (?, ?, ?, ?, 'building', '[]', ?)
    `).run(projectId, req.user.id, crossRefId, cleanRefinement, parent.id);
    res.json({ success: true, id: projectId, cross_ref_id: crossRefId, status: 'building' });
  } catch (err) {
    console.error('Iteration error:', err.message);
    res.status(500).json({ error: 'Failed to submit iteration: ' + err.message });
  }
});

// DELETE /api/builds/:id
router.delete('/:id', authenticate, (req, res) => {
  const project = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  db.prepare('DELETE FROM artifacts WHERE project_id = ?').run(req.params.id);
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
