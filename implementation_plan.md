# CodeThium AI — 2-Week Implementation Plan

## Overview

Replace the non-functional custom PyTorch model with real LLM APIs, restructure the Express monolith into modules, fix critical security/UX bugs, and containerize the full stack.

**Timeline:** 2 weeks, 2 phases per week  
**Stack:** React 19 · Express 5 · PostgreSQL · OpenRouter/Groq LLM APIs · Docker

---

## Week 1

### Phase 1 — Database + Backend Restructure (Days 1–3)

#### Database

| Task | Output |
|------|--------|
| Extract pg Pool | `server/db/pool.js` |
| Document existing schema | `server/db/migrations/001_initial.sql` — `users` + `chats` tables |
| Normalized messages table | `server/db/migrations/002_messages_table.sql` — `id, chat_id, role, content, metadata JSONB, created_at` |
| Migration runner | `server/db/migrate.js` — reads SQL files in order, tracks applied migrations in `schema_migrations` table |

**New `messages` table replaces JSON blob storage in `chats.message`:**
```sql
CREATE TABLE messages (
  id          SERIAL PRIMARY KEY,
  chat_id     INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role        VARCHAR(16) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content     TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_chat_id ON messages(chat_id);
```

#### Backend Restructure

Extract the 246-line `server/index.js` monolith into modules:

| New File | Source | Purpose |
|----------|--------|---------|
| `server/config/index.js` | — | Centralized env config; fail-fast if required vars missing |
| `server/db/pool.js` | `index.js` lines 20–31 | pg Pool singleton |
| `server/middleware/auth.js` | `index.js` lines 40–58 | JWT verify middleware |
| `server/middleware/errorHandler.js` | — | Centralized error handler (replaces per-route try/catch) |
| `server/utils/token.js` | `index.js` lines 34–38 | `signToken` helper |
| `server/routes/auth.js` | `index.js` lines 62–187 | register / login / logout / me / change-password |
| `server/routes/chat.js` | `index.js` lines 190–242 | CRUD + (new) SSE streaming |
| `server/index.js` | rewrite | Slim ~30-line entry point: mount middleware + routes |

**Package changes (`server/package.json`):**
- Remove: `passport`, `passport-apple`, `passport-google-oauth20`, `passport-microsoft`
- Add: `zod`, `morgan`

**Populate `server/.env`:**
```
PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=<real_password>
DB_NAME=codethium
JWT_SECRET=<strong_random_secret>
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=<your_key>
GROQ_API_KEY=<your_key>
```

**Verification:** `npm run dev` → all existing endpoints (`/api/register`, `/api/login`, `/api/me`, `/api/chats`) work identically.

---

### Phase 2 — LLM Integration + Streaming (Days 4–5)

#### Provider Abstraction

```
server/services/llm/
  BaseLLMProvider.js     — interface: chat() + chatStream() async generator
  OpenRouterProvider.js  — OpenAI-compatible fetch to openrouter.ai/api/v1
  GroqProvider.js        — same pattern, different base URL
  index.js               — factory: reads LLM_PROVIDER env var
```

#### SSE Streaming Endpoint

Add `POST /api/chat/stream` to `server/routes/chat.js`:

```
1. authMiddleware → Zod validate {chatId, content}
2. Save user message to messages table
3. Load last 20 messages from DB as LLM context array
4. Set SSE headers: Content-Type: text/event-stream
5. Call provider.chatStream() async generator
6. For each chunk → write: event: token\ndata: {"content":"..."}\n\n
7. On complete → save assistant message, write: event: done\ndata: {"messageId":N}\n\n
8. On error → write: event: error\ndata: {"error":"..."}\n\n
```

**Verification:**
```bash
curl -N -X POST http://localhost:4000/api/chat/stream \
  -H "Cookie: token=<jwt>" \
  -H "Content-Type: application/json" \
  -d '{"chatId":1,"content":"Hello"}'
# → streams token events to terminal
```

---

## Week 2

### Phase 3 — Frontend Overhaul (Days 6–8)

#### Auth Persistence Fix

- **`src/context/AuthContext.js`** — calls `GET /api/me` on mount to rehydrate user from httpOnly cookie; provides `login()` and `logout()` (calls `POST /api/logout` before navigating)
- **`src/App.js`** — wrap tree with `AuthContext.Provider`; replace `useState(false)` with context; use `loading` state to avoid flash-redirect on refresh

#### Centralized API Layer

- **`src/services/api.js`** — Axios instance with `baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000'` and `withCredentials: true`. Exports named helpers: `authApi`, `chatApi`, etc.
- **`src/services/streamChat.js`** — fetch + `response.body.getReader()` SSE client. Parses `event: token / done / error` frames. Accepts `{onToken, onDone, onError}` callbacks.

#### Component Split

Replace the 416-line `ChatbotPage.js` god component:

| New Component | Responsibility |
|---------------|---------------|
| `src/components/chat/ChatPage.js` | Top-level composition (~80 lines) |
| `src/components/chat/ChatSidebar.js` | History list from `GET /api/chats`, new chat, delete |
| `src/components/chat/MessageList.js` | Scrollable area, auto-scroll to bottom |
| `src/components/chat/MessageBubble.js` | Single message, user vs assistant styling |
| `src/components/chat/MessageContent.js` | Markdown + syntax highlighting (react-markdown + react-syntax-highlighter + remark-gfm); **replaces `dangerouslySetInnerHTML`** |
| `src/components/chat/ChatInput.js` | Auto-resize textarea, send button, streaming spinner |

**Package changes (`codethium-ai-web/package.json`):**
- Remove: `passport`, `passport-apple`, `passport-azure-ad`, `passport-google-oauth20`
- Add: `react-markdown`, `react-syntax-highlighter`, `remark-gfm`

**Bugs fixed in this phase:**

| Bug | Fix |
|-----|-----|
| Auth lost on refresh (`App.js` line 7) | AuthContext calls `/api/me` on mount |
| Logout skips API (`ChatbotPage.js` line 117) | `logout()` in AuthContext calls `POST /api/logout` |
| XSS via `dangerouslySetInnerHTML` (line 271) | MessageContent uses react-markdown |
| Chat history never loads from DB (lines 12–14) | ChatSidebar calls `GET /api/chats` on mount |
| Password change uses dead localStorage token (line 139) | api.js uses cookie-based auth |
| Hardcoded `localhost:8000` / `localhost:4000` URLs | api.js with env-based baseURL |

**Verification:** Refresh browser → stays logged in. Chat uses real LLM with streamed responses. Sidebar loads history from DB. Code responses have syntax highlighting.

---

### Phase 4 — Docker Setup + Final Polish (Days 9–10)

#### Docker

**`codethium-ai-web/server/Dockerfile`:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 4000
CMD ["node", "index.js"]
```

**`codethium-ai-web/Dockerfile`** (React frontend):
```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 3000
```

**`docker-compose.yml`** (repo root):
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: codethium
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 5s
      retries: 5

  server:
    build: ./codethium-ai-web/server
    ports: ["4000:4000"]
    env_file: ./codethium-ai-web/server/.env
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build: ./codethium-ai-web
    ports: ["3000:80"]
    depends_on: [server]

volumes:
  postgres_data:
```

**`.env.example`** (repo root — no secrets, committed):
```
PORT=4000
DB_HOST=db
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=changeme
DB_NAME=codethium
JWT_SECRET=change_this_to_a_strong_random_string
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
GROQ_API_KEY=gsk_...
REACT_APP_API_URL=http://localhost:4000
```

#### Rate Limiting + Security Headers

**`server/middleware/rateLimit.js`** using `express-rate-limit`:

| Endpoint | Limit |
|----------|-------|
| Auth routes (`/api/login`, `/api/register`) | 5 req/min per IP |
| Chat stream (`/api/chat/stream`) | 20 req/min per user |
| File upload (`/api/upload/*`) | 10 req/min per user |

- Add `helmet` middleware for security headers
- Add `morgan` for structured request logging

**Verification:** `docker-compose up` → DB starts, migrations run automatically, server and frontend start. Can register/login/chat from browser at `http://localhost:3000`.

---

## Summary — New Files Created

```
codethium-ai-web/server/
  config/index.js
  db/pool.js
  db/migrate.js
  db/migrations/001_initial.sql
  db/migrations/002_messages_table.sql
  middleware/auth.js
  middleware/errorHandler.js
  middleware/rateLimit.js
  routes/auth.js
  routes/chat.js
  services/llm/BaseLLMProvider.js
  services/llm/OpenRouterProvider.js
  services/llm/GroqProvider.js
  services/llm/index.js
  utils/token.js
  Dockerfile

codethium-ai-web/src/
  context/AuthContext.js
  services/api.js
  services/streamChat.js
  components/chat/ChatPage.js
  components/chat/ChatSidebar.js
  components/chat/MessageList.js
  components/chat/MessageBubble.js
  components/chat/MessageContent.js
  components/chat/ChatInput.js

docker-compose.yml          (repo root)
codethium-ai-web/Dockerfile
.env.example                (repo root)
```

## Files Modified

```
codethium-ai-web/server/index.js    → slim entry point (~30 lines)
codethium-ai-web/server/package.json → remove passport×4, add zod + morgan
codethium-ai-web/server/.env        → populate all required vars
codethium-ai-web/src/App.js         → add AuthContext
codethium-ai-web/src/components/LoginPage.js → use api.js
codethium-ai-web/package.json       → remove passport×4, add markdown libs
```

## Files Removed / Archived

```
codethium-model/   → archive (FastAPI + custom model no longer used)
```
