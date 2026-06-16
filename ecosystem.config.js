module.exports = {
  apps: [{
    name: 'relay-platform',
    script: '/Users/christopherbrown/4m/02-projects/agency/relay-ai-build-platform/server.js',
    interpreter: '/opt/homebrew/bin/node',
    cwd: '/Users/christopherbrown/4m/02-projects/agency/relay-ai-build-platform',
    restart_delay: 5000,
    max_restarts: 10,
    env: {
      UNBOUND_URL: 'http://localhost:3021',
      UNBOUND_KEY: '25a8d9a641bdd0cd3bab735dce1475a0a94ac1e6b9c2ebf07232e7cf25432e60',
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
