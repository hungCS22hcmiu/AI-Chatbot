# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodeThium is a full-stack AI chatbot with hybrid LLM support (OpenRouter, Groq, custom local model). The backend is a modular Express server backed by PostgreSQL with SSE streaming. The frontend is a React app served via nginx in Docker.

**Services:**
- **React frontend** (`codethium-ai-web/`) — port 3000
- **Express backend** (`codethium-ai-web/server/`) — port 4000
- **PostgreSQL** — port 5433 (Docker service name: `postpres`)
- **Local Model** (`codethium-model/`) — FastAPI on port 8000, Python code generation (Docker service: `local-model`)

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
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=google/gemma-3-27b-it:free
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
LOCAL_MODEL_URL=http://local-model:8000
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
```

See `.env.example` at repo root for a complete template.

For local frontend dev, create `codethium-ai-web/.env`:
```
REACT_APP_API_URL=http://localhost:4000
```

`config/index.js` exits with a clear error if any required backend env var is missing.

## Architecture

### Request Flow
1. User logs in via `src/components/LoginPage.js` → `POST /api/login` (httpOnly cookie)
2. Auth state managed by `src/context/AuthContext.js` (rehydrates via `GET /api/me` on refresh)
3. User sends message in `src/components/chat/ChatPage.js`
4. `src/services/streamChat.js` POSTs to `POST /api/chats/stream`
5. Express authenticates, loads history from DB, calls LLM provider (OpenRouter / Groq / Local)
6. LLM response streams back as SSE (`event: token`), saved to `messages` table on completion

### Backend Structure (`codethium-ai-web/server/`)
```
server/
  index.js               — entry point with helmet, CORS, morgan
  config/index.js        — env validation, fail-fast
  db/
    pool.js              — pg Pool singleton
    migrate.js           — sequential migration runner (idempotent)
    migrations/
      001_initial.sql    — users + chats tables
      002_messages_table.sql — normalized messages table
  middleware/
    auth.js              — JWT verify (httpOnly cookie or Bearer header)
    errorHandler.js      — centralized error handler
    rateLimit.js         — express-rate-limit (auth: 15/min, stream: 60/min, upload: 30/min)
  routes/
    auth.js              — /api/register, /login, /logout, /me, /change-password
    chat.js              — CRUD /api/chats + POST /api/chats/stream (SSE) + GET /:id/messages
    upload.js            — POST /api/upload/image (→ base64 data URL), /api/upload/file (→ extracted text)
  services/
    fileParser.js        — PDF text extraction (pdf-parse) + UTF-8 text files, 8000 char limit
    llm/
      BaseLLMProvider.js   — abstract base class
      OpenAICompatibleProvider.js — shared OpenAI-format fetch + SSE parsing; _readSSEStream()
      OpenRouterProvider.js — openrouter.ai/api/v1 (text only)
      GroqProvider.js      — api.groq.com/openai/v1 (default: llama-3.3-70b-versatile)
      LocalModelProvider.js — FastAPI /chat endpoint
      GeminiProvider.js    — generativelanguage.googleapis.com OpenAI-compat; chatStreamMultimodal() for images + PDFs
      index.js             — factory: getProvider("openrouter"|"groq"|"local"|"gemini")
  utils/token.js         — signToken helper
```

### Frontend Structure (`codethium-ai-web/src/`)
```
src/
  context/AuthContext.js           — user state, login/logout, cookie rehydration
  services/api.js                  — Axios instance (baseURL from env, withCredentials)
  services/streamChat.js           — fetch + ReadableStream SSE client
  components/chat/
    ChatPage.js                    — top-level composition
    ChatSidebar.js                 — chat history list, new/delete
    MessageList.js                 — scrollable area, auto-scroll
    MessageBubble.js               — user vs assistant styling; renders attachment thumbnails
    MessageContent.js              — react-markdown + syntax highlighting
    ChatInput.js                   — textarea, model selector, send button, file upload
    FileUploadButton.js            — image (🖼) and file (📄) upload buttons; native fetch + FormData
    ImagePreview.js                — attachment thumbnail strip with remove buttons
```

### Database Schema
```sql
-- users: id, username (unique), email (unique), password_hash, created_at
-- chats: id, user_id (FK), title, message JSONB, created_at, updated_at
-- messages: id, chat_id (FK), role ('user'|'assistant'|'system'), content, metadata JSONB, created_at
-- schema_migrations: filename, applied_at
```

### File & Image Upload (Phase 5)

Two-step flow: files uploaded first via `POST /api/upload/*`, payload returned to client, then included in the stream request body.

- **Images** → base64 data URL → auto-routed to `GeminiProvider.chatStreamMultimodal()` (overrides selected model)
- **PDFs** → base64 data URL (native PDF) → auto-routed to Gemini for native PDF understanding
- **Text/code files** → extracted text (UTF-8) → injected as context prefix before the user's question in `POST /api/chats/stream`
- Only `{type, name}` written to `messages.metadata` — the base64 payload is never stored in the DB
- `express.json()` body limit is `10mb` to accommodate base64 payloads
- multer: `memoryStorage`, 5MB file size cap, scoped error handler in `upload.js`

### LLM Streaming (SSE)
```
event: token   data: {"content":"Hello"}
event: info    data: {"message":"openrouter rate-limited, using groq"}
event: done    data: {"messageId":42,"model":"gemma-3-27b-it"}
event: error   data: {"error":"Streaming failed"}
```
Frontend reads with `fetch` + `response.body.getReader()` (not `EventSource` — POST requires fetch).

Automatic 429 fallback: OpenRouter ↔ Groq.

## Implementation Roadmap

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 1 — DB + Backend Restructure | ✅ Done | Modular Express, migrations, clean env config |
| Phase 2 — Hybrid LLM Integration + Streaming | ✅ Done | Local model + OpenRouter/Groq providers + SSE endpoint + 429 fallback |
| Phase 3 — Frontend Overhaul | ✅ Done | AuthContext, api.js, streamChat.js, split ChatbotPage, model selector |
| Phase 4 — Docker + Security | ✅ Done | Docker, local-model, helmet, rate limiting, .env.example |
| Phase 5 — File & Image Upload | ✅ Done | multer, pdf-parse, multimodal LLM, FileUploadButton |
| Phase 6 — Chat UX Polish | ✅ Done | Auto-title, rename, date grouping, search |
| Phase 7 — Gemini Multimodal Provider | ✅ Done | GeminiProvider, image+PDF upload, auto-route to Gemini |
| Phase 8 — Frontend UI Overhaul | 🔲 Pending | Tailwind + Framer Motion, colorful/dynamic redesign |
| Phase 9 — Production Hardening | 🔲 Pending | RAG (PostgreSQL FTS), Jest tests, deployment |

See `implementation_plan.md` for detailed task lists and file paths per phase.
