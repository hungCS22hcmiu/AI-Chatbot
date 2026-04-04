# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodeThium is a full-stack AI chatbot powered by real LLM APIs (OpenRouter / Groq) with SSE streaming, markdown rendering, and syntax highlighting.

**Services:**
- **React frontend** (`codethium-ai-web/`) — port 3000
- **Express backend** (`codethium-ai-web/server/`) — port 4000
- ~~FastAPI AI model~~ — removed; LLM calls are routed through Express

## Commands

### Frontend
```bash
cd codethium-ai-web
npm install
npm start        # dev server at http://localhost:3000
npm run build    # production build
npm test         # run tests
```

### Backend
```bash
cd codethium-ai-web/server
npm install
npm run dev      # start with nodemon (auto-reload)
npm start        # production start
```

### Database Migrations
```bash
cd codethium-ai-web/server
node db/migrate.js   # runs all pending SQL migrations in order
```

### Docker (full stack)
```bash
docker-compose up --build   # starts db + server + frontend
docker-compose down         # stop and remove containers
```

## Environment Setup

Copy `.env.example` to `codethium-ai-web/server/.env` and fill in values:

```
PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_db_password
DB_NAME=codethium
JWT_SECRET=strong_random_secret_min_32_chars
LLM_PROVIDER=openrouter          # or: groq
OPENROUTER_API_KEY=sk-or-...
GROQ_API_KEY=gsk_...
```

Frontend env (`codethium-ai-web/.env`):
```
REACT_APP_API_URL=http://localhost:4000
```

PostgreSQL must be running with a database named `codethium`. Migrations run automatically via `server/db/migrate.js` on startup.

## Architecture

### Request Flow
1. User sends a message in `src/components/chat/ChatPage.js`
2. `src/services/streamChat.js` POSTs to Express `POST /api/chat/stream`
3. Express authenticates, loads conversation history from DB, calls LLM provider
4. LLM response streams back as SSE (`event: token`) — no FastAPI, no port 8000
5. Auth/chat CRUD: `src/services/api.js` → Express `/api/*`

### Backend Structure (`codethium-ai-web/server/`)
```
server/
  index.js               — slim entry point: mounts middleware + routes
  config/index.js        — env validation, fail-fast if required vars missing
  db/
    pool.js              — pg Pool singleton
    migrate.js           — sequential migration runner
    migrations/
      001_initial.sql    — users + chats tables
      002_messages_table.sql — normalized messages (replaces JSON blob)
  middleware/
    auth.js              — JWT verify (reads httpOnly cookie or Bearer header)
    errorHandler.js      — centralized error handler
    rateLimit.js         — express-rate-limit per endpoint
  routes/
    auth.js              — POST /api/register, /api/login, /api/logout, GET /api/me, POST /api/change-password
    chat.js              — CRUD /api/chats + POST /api/chat/stream (SSE)
  services/llm/
    BaseLLMProvider.js   — interface: chat() + chatStream() async generator
    OpenRouterProvider.js — primary provider (free models: Llama 3, Mistral)
    GroqProvider.js      — fallback provider (fast inference)
    index.js             — factory: selects provider from LLM_PROVIDER env var
  utils/token.js         — signToken helper
```

### Frontend Structure (`codethium-ai-web/src/`)
```
src/
  context/AuthContext.js      — auth state; calls GET /api/me on mount to persist across refresh
  services/
    api.js                    — Axios instance (baseURL from env, withCredentials: true)
    streamChat.js             — fetch + ReadableStream SSE client
  components/
    chat/
      ChatPage.js             — top-level composition
      ChatSidebar.js          — history from DB, new chat, delete
      MessageList.js          — scrollable area, auto-scroll
      MessageBubble.js        — single message (user / assistant)
      MessageContent.js       — react-markdown + syntax highlighting (replaces dangerouslySetInnerHTML)
      ChatInput.js            — auto-resize textarea, send, streaming indicator
    LoginPage.js              — register / login UI (uses api.js)
```

### Database Schema
```sql
-- users
id, username (unique), email (unique), password_hash, created_at

-- chats
id, user_id (FK), title, created_at, updated_at

-- messages (normalized — replaces chats.message JSON blob)
id, chat_id (FK), role ('user'|'assistant'|'system'), content, metadata JSONB, created_at
```

### Authentication
- JWT with 7-day expiry stored in httpOnly cookie
- `AuthContext` calls `GET /api/me` on mount — auth survives page refresh
- Logout calls `POST /api/logout` to clear cookie before navigating

### LLM Streaming (SSE)
`POST /api/chat/stream` sends Server-Sent Events:
```
event: token
data: {"content":"Hello"}

event: done
data: {"messageId":42,"model":"llama-3-8b"}

event: error
data: {"error":"Rate limit exceeded"}
```
Frontend reads with `fetch` + `response.body.getReader()` (not `EventSource` — POST requires fetch).

### Rate Limits
| Endpoint | Limit |
|----------|-------|
| `/api/login`, `/api/register` | 5 req/min per IP |
| `/api/chat/stream` | 20 req/min per user |

## Known Gaps / Future Work
- File/image upload (Phase 2 in `implementation_plan.md`)
- Chat auto-titling and rename
- RAG with PostgreSQL full-text search
- Tool calling (function calling)
- TypeScript migration (planned)
