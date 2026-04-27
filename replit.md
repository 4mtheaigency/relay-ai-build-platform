# Relay AI Build Platform — Web Frontend

A web interface that serves as the second entry point into an existing three-AI relay system.
The relay itself (n8n + OpenAI/Chat Strategic → Claude/Claud Creation → Gemini/Gem Bot) runs
in separate Replit projects and is completely untouched by this app.

## How It Connects

This app writes to and reads from the shared Google Sheet that drives the relay:

```
User submits prompt
    ↓
POST /api/builds  →  writes one row to "Three-Ai Relay" / Sheet1
                     (same format as the Discord Commander trigger)
                     returns cross_ref_id
    ↓
Existing n8n relay picks up the row and runs the full chain (unchanged)
OpenAI (Chat Strategic) → Claude (Claud Creation) → Gemini (Gem Bot)
    ↓
GET /api/builds/:id  →  reads all Sheet rows matching cross_ref_id
                        returns stages + artifact Drive links
    ↓
Frontend polls every 5s and displays live pipeline progress + artifact links
```

## Google Sheet Format

- **Spreadsheet**: Three-Ai Relay
- **Sheet ID**: `1B08-0NhdeydCci3El4vWiq6KewfItDGp04Jm254NkHU`
- **Tab**: Sheet1
- **Headers**: `timestamp | channel | author | message | message_type | cross_ref_id`

### Initial trigger row written by this app:
- `channel`: `three-ai-relay`
- `author`: logged-in username
- `message`: user's prompt
- `message_type`: value of `RELAY_TRIGGER_TYPE` env var (default: `new_build_request`)
- `cross_ref_id`: generated 12-char hex ID

**Important**: Set `RELAY_TRIGGER_TYPE` to match the message_type your n8n workflow watches
for to kick off Stage 1 (Chat Strategic/OpenAI). Confirm this with the relay owner.

## Architecture

- **Backend**: Node.js + Express (server.js, port 5000)
- **Database**: SQLite via better-sqlite3 (relay.db) — stores users and project references only
- **Auth**: JWT tokens + bcryptjs
- **Google Sheets**: Replit-managed OAuth via googleapis (no service account needed)
- **Frontend**: Vanilla HTML/CSS/JS from /public

## Key Files

- `server.js` — Express server
- `models/db.js` — SQLite schema (users, projects with cross_ref_id)
- `middleware/auth.js` — JWT auth
- `routes/auth.js` — Register, login, logout
- `routes/builds.js` — Submit to Sheet, poll Sheet for status
- `services/sheetsClient.js` — Google Sheets OAuth client (Replit integration)
- `services/sheetRelay.js` — Sheet read/write logic, status derivation
- `public/login.html` — Auth page
- `public/dashboard.html` — Project list + new build prompt
- `public/build.html` — Live relay pipeline view + artifact Drive links

## Environment Variables

- `RELAY_TRIGGER_TYPE` — message_type to write for new builds (confirm with relay owner)
- `JWT_SECRET` — optional, has default

## Relay Bot Detection (build.html)

Bot authors are identified by name pattern matching:
- Chat Strategic / OpenAI: `/chat\s?strategic|openai|gpt/i`
- Claud Creation / Claude: `/claud|claude/i`
- Gem Bot / Gemini: `/gem\s?bot|gemini/i`
