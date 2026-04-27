/**
 * Pre-deploy code fixup for Railway compatibility.
 * Ensures PORT env var, correct listen binding, valid start script, and railway.json.
 */
function fixRailwayCompatibility(files) {
  const fixed = files.map(file => {
    let { path, content } = file;

    // ── package.json ──────────────────────────────────────────────
    if (path === 'package.json') {
      try {
        const pkg = JSON.parse(content);
        if (!pkg.scripts) pkg.scripts = {};

        // Ensure there's a start script
        if (!pkg.scripts.start) {
          const mainFile = files.find(f =>
            ['server.js', 'app.js', 'index.js', 'main.js'].includes(f.path)
          );
          pkg.scripts.start = `node ${mainFile ? mainFile.path : 'server.js'}`;
        }

        // Ensure node engine is declared (Railway uses this to pick node version)
        if (!pkg.engines) pkg.engines = { node: '>=18.0.0' };

        content = JSON.stringify(pkg, null, 2);
      } catch (_) {}
      return { path, content };
    }

    // ── JS/TS server entry files ───────────────────────────────────
    const basename = path.split('/').pop();
    const isServerFile = /^(server|app|index|main)\.(js|ts|mjs|cjs)$/i.test(basename);
    if (isServerFile) {
      // Replace bare const/let/var PORT = <number> with env-aware version
      content = content
        .replace(/\bconst\s+PORT\s*=\s*(\d+)/g,  'const PORT = process.env.PORT || $1')
        .replace(/\blet\s+PORT\s*=\s*(\d+)/g,    'let PORT = process.env.PORT || $1')
        .replace(/\bvar\s+PORT\s*=\s*(\d+)/g,    'var PORT = process.env.PORT || $1');

      // If no process.env.PORT anywhere, fix hardcoded listen() calls
      if (!content.includes('process.env.PORT')) {
        content = content.replace(
          /\.listen\(\s*(\d+)\s*([,)])/g,
          (_, port, after) => `.listen(process.env.PORT || ${port}${after}`
        );
      }

      // Ensure listen binds to 0.0.0.0 (required by Railway / containers)
      // Handle: .listen(PORT) → .listen(PORT, '0.0.0.0')
      content = content.replace(
        /\.listen\(\s*(process\.env\.PORT[^,)'"`\n]*)\s*\)/g,
        ".listen($1, '0.0.0.0')"
      );
    }

    return { path, content };
  });

  // ── Inject railway.json ────────────────────────────────────────
  if (!fixed.some(f => f.path === 'railway.json')) {
    let startCmd = 'npm start';
    const pkgFile = fixed.find(f => f.path === 'package.json');
    if (pkgFile) {
      try {
        const p = JSON.parse(pkgFile.content);
        if (!p.scripts?.start) startCmd = 'node server.js';
      } catch (_) {}
    }

    fixed.push({
      path: 'railway.json',
      content: JSON.stringify({
        $schema: 'https://railway.app/railway.schema.json',
        build: { builder: 'NIXPACKS' },
        deploy: {
          startCommand: startCmd,
          restartPolicyType: 'ON_FAILURE',
          restartPolicyMaxRetries: 10,
        },
      }, null, 2),
    });
  }

  // ── Inject .env.example (so Railway knows what vars to set) ───
  const hasEnvExample = fixed.some(f => f.path === '.env.example' || f.path === '.env');
  if (!hasEnvExample) {
    fixed.push({
      path: '.env.example',
      content: '# Environment variables for Railway\nPORT=3000\nNODE_ENV=production\n',
    });
  }

  return fixed;
}

module.exports = { fixRailwayCompatibility };
