const axios = require('axios');

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function callOpenAI(prompt) {
  if (!OPENAI_KEY) throw new Error('OPENAI_API_KEY not configured');
  const res = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a strategic software architect. Given a user's build request, output ONLY valid JSON with these fields:
{
  "project_summary": "string",
  "system_architecture": "string",
  "tech_stack": ["array", "of", "strings"],
  "file_structure": "string (multiline)",
  "build_instructions": "string (step by step)"
}`
      },
      { role: 'user', content: prompt }
    ],
    response_format: { type: 'json_object' }
  }, {
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' }
  });
  return JSON.parse(res.data.choices[0].message.content);
}

async function callClaude(prompt, designOutput) {
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const res = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are a senior software engineer. Given this build request and architecture design, output ONLY valid JSON with these fields:
{
  "env_variables_required": [{"key": "NAME", "description": "what it is", "required": true}],
  "integration_steps": ["step 1", "step 2"],
  "missing_requirements": ["list of accounts/keys/services user needs"]
}

Build Request: ${prompt}

Architecture Design: ${JSON.stringify(designOutput, null, 2)}`
      }
    ]
  }, {
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    }
  });
  const text = res.data.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

async function callGemini(prompt, designOutput, buildOutput) {
  if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured');
  const res = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_KEY}`,
    {
      contents: [{
        parts: [{
          text: `You are an integration specialist. Given this project's design and build details, output ONLY valid JSON with:
{
  "deployment_checklist": ["item 1", "item 2"],
  "monitoring_setup": "string",
  "final_status": "ready | needs_input | incomplete",
  "notes": "string"
}

Build Request: ${prompt}
Design: ${JSON.stringify(designOutput, null, 2)}
Build Details: ${JSON.stringify(buildOutput, null, 2)}`
        }]
      }],
      generationConfig: { responseMimeType: 'application/json' }
    }
  );
  const text = res.data.candidates[0].content.parts[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

async function runRelay(prompt) {
  const missing = [];
  if (!OPENAI_KEY) missing.push('OPENAI_API_KEY');
  if (!ANTHROPIC_KEY) missing.push('ANTHROPIC_API_KEY');
  if (!GEMINI_KEY) missing.push('GEMINI_API_KEY');

  if (missing.length > 0) {
    return {
      status: 'needs_input',
      missing_requirements: missing.map(k => `${k} — required for AI relay`),
      artifacts: {
        project_summary: `Build request received: "${prompt}". Waiting for API keys to proceed.`,
        system_architecture: 'Pending — API keys required',
        tech_stack: [],
        file_structure: 'Pending',
        build_instructions: 'Add the required API keys in Secrets, then re-trigger the build.',
        env_variables_required: missing.map(k => ({ key: k, description: 'Required AI provider API key', required: true })),
        integration_steps: ['Add missing API keys in Replit Secrets', 'Re-run the build'],
        deployment_checklist: [],
        monitoring_setup: 'Pending',
        final_status: 'needs_input',
        notes: `Missing keys: ${missing.join(', ')}`
      }
    };
  }

  const designOutput = await callOpenAI(prompt);
  const buildOutput = await callClaude(prompt, designOutput);
  const integrationOutput = await callGemini(prompt, designOutput, buildOutput);

  return {
    status: integrationOutput.final_status === 'ready' ? 'complete' : 'needs_input',
    missing_requirements: buildOutput.missing_requirements || [],
    artifacts: {
      ...designOutput,
      ...buildOutput,
      ...integrationOutput
    }
  };
}

module.exports = { runRelay };
