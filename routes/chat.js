const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');
const { authenticate } = require('../middleware/auth');
const db = require('../models/db');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FOURM_URL = process.env.FOURM_API_URL || 'http://localhost:5000/chat';
const FOURM_KEY = process.env.FOURM_CHAT_SECRET;
const FOURM_USER_EMAIL = process.env.FOURM_USER_EMAIL;

async function callFourm(message, username) {
  const response = await axios.post(
    FOURM_URL,
    { message, author: username || 'Commander', channel: 'three-ai-relay' },
    {
      headers: {
        'X-Fourm-Key': FOURM_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 35000,
    }
  );
  return response.data?.reply || '';
}

async function callClaude(message, history, buildsSummary) {
  const systemPrompt = `You are the Relay Assistant — an expert AI agent embedded inside the Relay AI Build Platform.
Relay is a Three-AI system: ChatGPT (strategic planning) → Claude (code creation) → Gemini (integration & deploy) → GitHub → Railway.
You help users manage their builds, debug issues, trigger new builds, and understand what Relay produced.

The current user's recent builds:
${buildsSummary}

Keep responses concise (2-4 sentences max unless the user asks for detail). Be direct and technical when needed.`;

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message.trim() },
  ];

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    system: systemPrompt,
    messages,
  });
  return response.content[0]?.text || 'No response generated.';
}

// Lets the frontend know which agent is active for this user
router.get('/agent', authenticate, (req, res) => {
  const isFourmUser = FOURM_USER_EMAIL &&
    req.user.email &&
    req.user.email.toLowerCase() === FOURM_USER_EMAIL.toLowerCase();
  res.json({ agent: isFourmUser ? 'fourm' : 'claude' });
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const builds = db.prepare(
      `SELECT id, prompt, status, github_url, deploy_url, created_at
       FROM projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 5`
    ).all(req.user.id);

    const buildsSummary = builds.length
      ? builds.map((b, i) =>
          `#${i + 1}: "${(b.prompt || '').slice(0, 80)}" — ${b.status}` +
          (b.deploy_url ? ` — live: ${b.deploy_url}` : '') +
          (b.github_url ? ` — github: ${b.github_url}` : '')
        ).join('\n')
      : 'No builds yet.';

    const isFourmUser = FOURM_USER_EMAIL &&
      req.user.email &&
      req.user.email.toLowerCase() === FOURM_USER_EMAIL.toLowerCase();

    let reply;
    if (isFourmUser) {
      try {
        reply = await callFourm(message.trim(), req.user.username);
      } catch (fourmErr) {
        console.error('Fourm unreachable, falling back to Claude:', fourmErr.message);
        reply = await callClaude(message, history, buildsSummary);
      }
    } else {
      reply = await callClaude(message, history, buildsSummary);
    }

    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Chat failed: ' + err.message });
  }
});

module.exports = router;
