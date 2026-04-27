const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'relay.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    cross_ref_id TEXT,
    prompt TEXT NOT NULL,
    status TEXT DEFAULT 'building',
    missing_requirements TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    file_id TEXT NOT NULL,
    author TEXT,
    message_type TEXT,
    name TEXT,
    mime_type TEXT,
    content TEXT,
    fetched_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );
`);

// Migrate: add columns to existing DBs
try { db.exec(`ALTER TABLE projects ADD COLUMN cross_ref_id TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE projects ADD COLUMN parent_id TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE projects ADD COLUMN github_url TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE projects ADD COLUMN deploy_url TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE projects ADD COLUMN railway_url TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE projects ADD COLUMN railway_project_id TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE projects ADD COLUMN railway_service_id TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE deployments ADD COLUMN railway_url TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE deployments ADD COLUMN railway_project_url TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE artifacts ADD COLUMN file_id TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE artifacts ADD COLUMN author TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE artifacts ADD COLUMN message_type TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE artifacts ADD COLUMN name TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE artifacts ADD COLUMN mime_type TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE artifacts ADD COLUMN fetched_at TEXT`); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS deployments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    github_repo_url TEXT,
    deployment_url TEXT,
    deploy_type TEXT DEFAULT 'code',
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );
`);

module.exports = db;
