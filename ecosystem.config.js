module.exports = {
  apps: [{
    name: 'relay-platform',
    script: '/Users/christopherbrown/4m/02-projects/agency/relay-ai-build-platform/server.js',
    interpreter: '/opt/homebrew/bin/node',
    cwd: '/Users/christopherbrown/4m/02-projects/agency/relay-ai-build-platform',
    restart_delay: 5000,
    max_restarts: 10,
    env: {
    "OPENAI_API_KEY": "",
    "GOOGLE_DRIVE_FOLDER_ID": "",
    "SERVICE_ACCOUNT_JSON": "",
    "ANTHROPIC_API_KEY": "",
    "JWT_SECRET": "",
    "FOURM_CHAT_SECRET": "",
    "FOURM_USER_EMAIL": "",
    "GITHUB_TOKEN": "",
    "RAILWAY_TOKEN": "",
    "AUTO_POST_URL": "http://localhost:5001",
    "FOURM_API_URL": "http://localhost:5005/chat",
    "PORT": "5005"
}
  }]
}
