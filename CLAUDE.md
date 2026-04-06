# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodeThium is a full-stack AI chatbot. The backend is a modular Express server backed by PostgreSQL. The frontend is a React app served via nginx in Docker. LLM integration (OpenRouter / Groq) and SSE streaming are planned for Phase 2.

**Services:**
- **React frontend** (`codethium-ai-web/`) — port 3000
- **Express backend** (`codethium-ai-web/server/`) — port 4000
- **PostgreSQL** — port 5433 (Docker service name: `postpres`)
- ~~FastAPI AI model~~ — removed; LLM calls will be routed through Express (Phase 2)

## Commands

### Docker (recommended — runs all 3 services)
```bash
docker-compose up --build        # first run: build + migrate + start
docker-compose up                # subsequent runs
docker-compose down              # stop, keep DB data
docker-compose down -v           # stop + wipe DB volume
docker-compose up --build server    # rebuild backend only
docker-compose up --build frontend  # rebuild frontend only
```

### Backend (local dev)
```bash
cd codethium-ai-web/server
npm install
npm run dev      # nodemon auto-reload at http://localhost:4000
npm start        # production start
```

### Frontend (local dev)
```bash
cd codethium-ai-web
npm install
npm start        # CRA dev server at http://localhost:3000
npm run build    # production build
```

### Database Migrations
Migrations run automatically on server startup. To run manually:
```bash
cd codethium-ai-web/server
node db/migrate.js
```

## Environment Setup

Single `.env` file at the **repo root** (`AI-Chatbot/.env`) — used by both docker-compose and local dev. This file is gitignored.

```
PORT=4000
DB_HOST=postpres       # Docker service name; use "localhost" for local dev
DB_PORT=5433           # use 5432 for default local Postgres
DB_USER=SE
DB_PASSWORD=your_db_password
DB_NAME=codethium
JWT_SECRET=strong_random_secret_min_32_chars
LLM_PROVIDER=openrouter          # or: groq  (Phase 2)
OPENROUTER_API_KEY=sk-or-...     # Phase 2
GROQ_API_KEY=gsk_...             # Phase 2
```

For local frontend dev, create `codethium-ai-web/.env`:
```
REACT_APP_API_URL=http://localhost:4000
```

Note: `REACT_APP_API_URL` is baked in at build time (CRA). In Docker it defaults to `http://localhost:4000` via a build arg in docker-compose.

`config/index.js` exits with a clear error if any required backend env var is missing.

## Architecture

### Current Request Flow (Phase 1 complete)
1. User logs in via `src/components/LoginPage.js` → `POST /api/login`
2. Auth state held in `App.js` `useState` (lost on refresh — fixed in Phase 3)
3. Chat UI in `src/components/ChatbotPage.js` → currently calls dead `localhost:8000` AI endpoint
4. Chat CRUD: `POST/GET/PUT/DELETE /api/chats` — working, but frontend doesn't wire to DB yet

### Target Request Flow (Phase 2 + 3)
1. User sends a message in `src/components/chat/ChatPage.js`
2. `src/services/streamChat.js` POSTs to `POST /api/chat/stream`
3. Express authenticates, loads history from DB, calls LLM provider (OpenRouter / Groq)
4. LLM response streams back as SSE (`event: token`)
5. Auth/chat CRUD: `src/services/api.js` → Express `/api/*`

### Docker Layout — Phase 1 ✓
```
AI-Chatbot/
  .env                            — root secrets file (gitignored)
  docker-compose.yml              — postpres + server + frontend
  codethium-ai-web/
    Dockerfile                    — stage 1: node build; stage 2: nginx serve
    nginx.conf                    — SPA routing (try_files → index.html)
    .dockerignore
    server/
      Dockerfile                  — node:20-alpine, npm ci --production
      .dockerignore
```

### Backend Structure (`codethium-ai-web/server/`) — Phase 1 ✓
```
server/
  index.js               — slim entry point (~37 lines): mounts middleware + routes
  config/index.js        — env validation, fail-fast if required vars missing
  db/
    pool.js              — pg Pool singleton
    migrate.js           — sequential migration runner (idempotent)
    migrations/
      001_initial.sql    — users + chats tables
      002_messages_table.sql — normalized messages table (ready for Phase 2)
  middleware/
    auth.js              — JWT verify (reads httpOnly cookie or Bearer header)
    errorHandler.js      — centralized error handler
  routes/
    auth.js              — POST /api/register, /api/login, /api/logout, GET /api/me, POST /api/change-password
    chat.js              — CRUD /api/chats (GET, POST, PUT /:id, DELETE /:id)
  utils/token.js         — signToken helper
```

**Not yet built (Phase 2):**
```
server/
  middleware/rateLimit.js
  services/llm/
    BaseLLMProvider.js             — interface: chat() + chatStream() async generator
    OpenRouterProvider.js          — primary (free models: Llama 3, Mistral)
    GroqProvider.js                — fallback (fast inference)
    index.js                       — factory: selects provider from LLM_PROVIDER env var
  routes/chat.js                   — add POST /api/chat/stream (SSE streaming)
```

### Frontend Structure (`codethium-ai-web/src/`) — pre-Phase 3
```
src/
  App.js                      — routing + auth state (useState, loses on refresh)
  components/
    LoginPage.js              — register / login UI (hardcoded localhost:4000 URLs)
    ChatbotPage.js            — 416-line god component (hardcoded localhost:8000 AI URL)
```

**Not yet built (Phase 3):**
```
src/
  context/AuthContext.js      — auth state; calls GET /api/me on mount to persist across refresh
  services/
    api.js                    — Axios instance (baseURL from env, withCredentials: true)
    streamChat.js             — fetch + ReadableStream SSE client
  components/
    chat/
      ChatPage.js             — top-level composition (replaces ChatbotPage.js)
      ChatSidebar.js          — history from DB, new chat, delete
      MessageList.js          — scrollable area, auto-scroll
      MessageBubble.js        — single message (user / assistant)
      MessageContent.js       — react-markdown + syntax highlighting
      ChatInput.js            — auto-resize textarea, send, streaming indicator
```

### Database Schema
```sql
-- users
id, username (unique), email (unique), password_hash, created_at

-- chats
id, user_id (FK), title, message JSONB, created_at, updated_at

-- messages (normalized — for Phase 2 LLM streaming)
id, chat_id (FK), role ('user'|'assistant'|'system'), content, metadata JSONB, created_at

-- schema_migrations (internal — tracks applied SQL files)
filename, applied_at
```

### Authentication
- JWT with 7-day expiry stored in httpOnly cookie
- `config/index.js` validates `JWT_SECRET` is present at startup (no hardcoded fallback)
- Phase 3: `AuthContext` will call `GET /api/me` on mount so auth survives page refresh

### LLM Streaming (SSE) — Phase 2 target
`POST /api/chat/stream` will send Server-Sent Events:
```
event: token
data: {"content":"Hello"}

event: done
data: {"messageId":42,"model":"llama-3-8b"}

event: error
data: {"error":"Rate limit exceeded"}
```
Frontend reads with `fetch` + `response.body.getReader()` (not `EventSource` — POST requires fetch).

### Planned Rate Limits (Phase 2)
| Endpoint | Limit |
|----------|-------|
| `/api/login`, `/api/register` | 5 req/min per IP |
| `/api/chat/stream` | 20 req/min per user |

## Implementation Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 1 — DB + Backend Restructure | **Done** | Modular Express, migrations, clean env config |
| Phase 2 — LLM Integration + Streaming | Pending | LLM provider abstraction, SSE endpoint, messages table wired |
| Phase 3 — Frontend Overhaul | Pending | AuthContext, api.js, streamChat.js, split ChatbotPage, fix XSS |
| Phase 4 — Docker + Rate Limiting | **Docker done** | ~~Dockerfiles, docker-compose~~ · rateLimit.js + helmet still pending |

See `implementation_plan.md` for detailed task lists per phase.
See `run.txt` for full command reference, API curl examples, and verification steps.
