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
CORS_ORIGIN=http://localhost:3000
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
GEMMA_MODEL=gemma-4-31b-it
TAVILY_API_KEY=tvly-...       # optional: enables real-time web search
```

See `.env.example` at repo root for a complete template.

For local frontend dev, create `codethium-ai-web/.env`:
```
REACT_APP_API_URL=http://localhost:4000
```

`config/index.js` exits with a clear error if any required backend env var is missing.

## Architecture

### Request Flow
1. User logs in via `src/components/LoginPage.js` → `POST /api/login` → sets `token` (15 min) + `refresh_token` (7 day) httpOnly cookies
2. Auth state managed by `src/context/AuthContext.js` (rehydrates via `GET /api/me` on refresh; 401 interceptor auto-calls `POST /api/refresh`)
3. User sends message in `src/components/chat/ChatPage.js`
4. `src/services/streamChat.js` POSTs to `POST /api/chats/stream`
5. Express: RAG search → web search (if time-sensitive query + TAVILY_API_KEY set) → prepend context as system messages → call LLM provider
6. LLM response streams back as SSE (`event: token`), saved to `messages` table on completion

### Backend Structure (`codethium-ai-web/server/`)
```
server/
  app.js                 — Express app setup (no listen — importable for tests)
  index.js               — entry point: runMigrations() + app.listen()
  config/index.js        — env validation, fail-fast; includes CORS_ORIGIN
  db/
    pool.js              — pg Pool singleton
    migrate.js           — sequential migration runner (idempotent)
    migrations/
      001_initial.sql    — users + chats tables
      002_messages_table.sql — normalized messages table
      003_attachments.sql   — GIN index on messages.metadata JSONB
      004_documents.sql     — documents table (RAG): content_fts tsvector + GIN index
      005_refresh_tokens.sql — refresh_tokens table for JWT refresh pattern
  middleware/
    auth.js              — JWT verify (httpOnly cookie or Bearer header)
    errorHandler.js      — centralized error handler
    rateLimit.js         — express-rate-limit (auth: 15/min, stream: 60/min, upload: 30/min)
  routes/
    auth.js              — /api/register (Zod, 12-char password), /login, /refresh, /logout, /me, /change-password
    chat.js              — CRUD /api/chats + POST /api/chats/stream (SSE + RAG injection) + GET /:id/messages
    upload.js            — POST /api/upload/image (→ base64 data URL), /api/upload/file (→ text + RAG store)
  services/
    fileParser.js        — extractText() (8K truncated, for inline LLM context) + extractFullText() (for RAG)
    formatLocalResponse.js — heuristic Python formatter for local model output
    rag.js               — storeDocument() + searchDocuments() (PostgreSQL FTS via plainto_tsquery)
    webSearch.js         — needsWebSearch() keyword heuristic + searchWeb() Tavily API call; disabled when TAVILY_API_KEY unset
    llm/
      BaseLLMProvider.js   — abstract base class
      OpenAICompatibleProvider.js — shared OpenAI-format fetch + SSE parsing; _readSSEStream()
      OpenRouterProvider.js — openrouter.ai/api/v1 (text only)
      GroqProvider.js      — api.groq.com/openai/v1 (default: llama-3.3-70b-versatile)
      LocalModelProvider.js — FastAPI /chat endpoint; applies formatLocalResponse() on reply
      GeminiProvider.js    — generativelanguage.googleapis.com OpenAI-compat; chatStreamMultimodal() for images + PDFs
      GemmaProvider.js     — extends GeminiProvider; uses GEMMA_MODEL; filters <thought> blocks via _filterThoughts()
      index.js             — factory: getProvider("openrouter"|"groq"|"local"|"gemini"|"gemma")
  utils/token.js         — signAccessToken() (15 min JWT), signRefreshToken() (random hex), hashToken() (SHA-256)
  __tests__/
    auth.test.js         — register/login/refresh/logout/change-password (mocks pool + bcrypt)
    chat.test.js         — chat CRUD + SSE stream (mocks pool + rag + llm)
    llm.test.js          — provider factory + _readSSEStream parsing (mocks fetch)
  jest.config.js         — test environment, setupFiles, testTimeout
  jest.setup.js          — sets required env vars before module load
```

### Frontend Structure (`codethium-ai-web/src/`)
```
src/
  context/
    AuthContext.js           — user state, login/logout, cookie rehydration
    ThemeContext.js          — light/dark theme state; persists to localStorage; sets data-theme on <html>
  services/
    api.js                   — Axios instance (baseURL from env, withCredentials)
    streamChat.js            — fetch + ReadableStream SSE client
  components/
    ui/
      Button.js              — shared button (primary/ghost/icon/danger variants)
      GlassCard.js           — glass card wrapper (.glass .gradient-border)
      Spinner.js             — Lucide Loader2 spinner
    chat/
      ChatPage.js            — top-level composition
      ChatSidebar.js         — chat history list, new/delete, Sun/Moon theme toggle
      MessageList.js         — scrollable area, auto-scroll, AnimatePresence
      MessageBubble.js       — gradient user bubble, glass assistant bubble, Lucide avatars
      MessageContent.js      — react-markdown + syntax highlighting (prose prose-invert)
      ChatInput.js           — textarea, model selector, send button, file upload
      FileUploadButton.js    — Lucide ImageIcon/Paperclip upload buttons
      ImagePreview.js        — attachment thumbnail strip with AnimatePresence
      SettingsPanel.js       — logout, password change, Framer Motion entrance
```

### Design System (Phase 8)

- **Brand gradient:** `#7c3aed` (violet) → `#ec4899` (pink) → `#f59e0b` (amber)
- **Tailwind config:** `surface.{0-3}` and `muted` reference CSS variables (`var(--surface-N)`)
- **Dark theme (default):** surfaces `#0b0b14`/`#13131f`/`#1c1c2e`/`#252538`
- **Light theme:** surfaces `#f4f4f8`/`#eaeaf2`/`#e0e0ec`/`#d5d5e4`; toggled via `html[data-theme="light"]`
- **Glass utility:** `.glass` = `bg-white/5 backdrop-blur-xl border border-white/10`; overridden to `rgba(0,0,0,0.03)` in light mode
- **Theme toggle:** Sun/Moon button in sidebar bottom bar; preference saved to `localStorage`

### Database Schema
```sql
-- users: id, username (unique), email (unique), password_hash, created_at
-- chats: id, user_id (FK), title, message JSONB, created_at, updated_at
-- messages: id, chat_id (FK), role ('user'|'assistant'|'system'), content, metadata JSONB, created_at
-- documents: id, user_id (FK), chat_id (FK nullable), filename, content TEXT, content_fts tsvector (generated), created_at
-- refresh_tokens: id, user_id (FK), token_hash TEXT (unique), expires_at, created_at
-- schema_migrations: filename, applied_at
```

### File & Image Upload + RAG (Phases 5 + 9)

Two-step flow: files uploaded first via `POST /api/upload/*`, payload returned to client, then included in the stream request body.

- **Images** → base64 data URL → auto-routed to `GeminiProvider.chatStreamMultimodal()` (overrides selected model)
- **PDFs** → base64 data URL (native PDF) → auto-routed to Gemini; full text also stored in `documents` table for RAG
- **Text/code files** → extracted text (8K truncated) returned to client for inline LLM context; full text stored in `documents` table for RAG
- Only `{type, name}` written to `messages.metadata` — the base64 payload is never stored in the DB
- `express.json()` body limit is `10mb` to accommodate base64 payloads
- multer: `memoryStorage`, 5MB file size cap, scoped error handler in `upload.js`

**RAG flow:** On `POST /api/chats/stream` with no attachments, `searchDocuments(userId, content, 4)` runs a PostgreSQL FTS query (`plainto_tsquery`) against the user's stored documents. Any matching snippets are prepended as an ephemeral system message (not persisted to DB).

**Web search flow:** After RAG, `needsWebSearch(content)` checks for time-sensitive keywords (today, weather, news, price, etc.). If matched and `TAVILY_API_KEY` is set, `searchWeb(content, 5)` calls the Tavily API and prepends live results as a second system message. A `event: info` SSE event is sent to notify the frontend. Feature is silently disabled when the key is absent.

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
| Phase 8 — Frontend UI Overhaul | ✅ Done | Tailwind + Framer Motion, light/dark theme, local model formatting |
| Phase 9 — Production Hardening | ✅ Done | CORS from env, password strength (12+ chars), JWT refresh tokens, RAG (PostgreSQL FTS), Jest tests (41 tests) |
| Phase 10 — Gemma + Web Search | ✅ Done | Gemma 4 31B provider, thought-block filtering, Tavily web search with keyword heuristic |

See `implementation_plan.md` for detailed task lists and file paths per phase.
