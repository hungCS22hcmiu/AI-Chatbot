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

### Docker (recommended)
```bash
docker-compose up --build        # first run: build + migrate + start
docker-compose up                # subsequent runs
docker-compose down              # stop, keep DB data
docker-compose down -v           # stop + wipe DB volume
```

### Backend (local dev)
```bash
cd codethium-ai-web/server && npm install
npm run dev      # nodemon at http://localhost:4000
```

### Frontend (local dev)
```bash
cd codethium-ai-web && npm install
npm start        # CRA dev server at http://localhost:3000
```

### Database Migrations
Migrations run automatically on server startup. To run manually:
```bash
cd codethium-ai-web/server && node db/migrate.js
```

## Environment Setup

Single `.env` at repo root (`AI-Chatbot/.env`) — used by both docker-compose and local dev. Gitignored.

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

`config/index.js` exits with a clear error if any required backend env var is missing.

## Architecture

### Current Request Flow (Phase 1 complete)
1. User logs in via `src/components/LoginPage.js` → `POST /api/login`
2. Auth state held in `App.js` `useState` (lost on refresh — fixed in Phase 3)
3. Chat UI in `src/components/ChatbotPage.js` → currently calls dead `localhost:8000` AI endpoint
4. Chat CRUD: `POST/GET/PUT/DELETE /api/chats` — working, but frontend doesn't wire to DB yet

### Target Request Flow (Phase 2 + 3)
1. User sends message in `src/components/chat/ChatPage.js`
2. `src/services/streamChat.js` POSTs to `POST /api/chat/stream`
3. Express authenticates, loads history from DB, calls LLM provider (OpenRouter / Groq)
4. LLM response streams back as SSE (`event: token`)

### Backend Structure (`codethium-ai-web/server/`) — Phase 1 ✓
```
server/
  index.js               — slim entry point (~37 lines)
  config/index.js        — env validation, fail-fast
  db/
    pool.js              — pg Pool singleton
    migrate.js           — sequential migration runner (idempotent)
    migrations/
      001_initial.sql    — users + chats tables
      002_messages_table.sql — normalized messages (ready for Phase 2)
  middleware/
    auth.js              — JWT verify (httpOnly cookie or Bearer header)
    errorHandler.js      — centralized error handler
  routes/
    auth.js              — /api/register, /login, /logout, /me, /change-password
    chat.js              — CRUD /api/chats (GET, POST, PUT /:id, DELETE /:id)
  utils/token.js         — signToken helper
```

**Not yet built (Phase 2):**
```
server/
  middleware/rateLimit.js
  services/llm/
    BaseLLMProvider.js / OpenRouterProvider.js / GroqProvider.js / index.js
  routes/chat.js         — add POST /api/chat/stream (SSE streaming)
```

**Not yet built (Phase 3):**
```
src/
  context/AuthContext.js
  services/api.js / streamChat.js
  components/chat/
    ChatPage.js / ChatSidebar.js / MessageList.js
    MessageBubble.js / MessageContent.js / ChatInput.js
```

### Database Schema
```sql
-- users: id, username (unique), email (unique), password_hash, created_at
-- chats: id, user_id (FK), title, message JSONB, created_at, updated_at
-- messages: id, chat_id (FK), role ('user'|'assistant'|'system'), content, metadata JSONB, created_at
-- schema_migrations: filename, applied_at
```

### LLM Streaming (SSE) — Phase 2 target
```
event: token   data: {"content":"Hello"}
event: done    data: {"messageId":42,"model":"llama-3-8b"}
event: error   data: {"error":"Rate limit exceeded"}
```
Frontend reads with `fetch` + `response.body.getReader()` (not `EventSource` — POST requires fetch).

## Implementation Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 1 — DB + Backend Restructure | ✅ Done | Modular Express, migrations, clean env config |
| Phase 2 — LLM Integration + Streaming | 🔲 Pending | LLM provider abstraction, SSE endpoint, messages table wired |
| Phase 3 — Frontend Overhaul | 🔲 Pending | AuthContext, api.js, streamChat.js, split ChatbotPage, fix XSS |
| Phase 4 — Docker + Security | 🔲 Partial | ✅ Docker done · rateLimit.js + helmet pending |
| Phase 5 — File & Image Upload | 🔲 Pending | multer, pdf-parse, multimodal LLM, FileUploadButton |
| Phase 6 — Chat UX Polish | 🔲 Pending | Auto-title, rename, date grouping, search |
| Phase 7 — Production Hardening | 🔲 Pending | RAG (PostgreSQL FTS), Jest tests, deployment |

See `implementation_plan.md` for detailed task lists and file paths per phase.
