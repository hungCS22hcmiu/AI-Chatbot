# CodeThium AI — Implementation Plan

## Overview

Replace the non-functional custom PyTorch model with real LLM APIs, restructure the Express monolith into modules, fix critical security/UX bugs, and containerize the full stack.

**Stack:** React 19 · Express 5 · PostgreSQL · OpenRouter/Groq LLM APIs · Docker

---

## Status Summary

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 1 — DB + Backend Restructure | ✅ DONE | Modular Express, migrations, clean env config |
| Phase 2 — LLM Integration + Streaming | 🔲 Pending | LLM provider abstraction, SSE endpoint |
| Phase 3 — Frontend Overhaul | 🔲 Pending | AuthContext, api.js, streamChat.js, split ChatbotPage |
| Phase 4 — Docker + Security | 🔲 Partial | Docker ✅ done · rateLimit.js + helmet pending |
| Phase 5 — File & Image Upload | 🔲 Pending | multer, pdf-parse, multimodal LLM |
| Phase 6 — Chat UX Polish | 🔲 Pending | Auto-title, rename, date grouping, search |
| Phase 7 — Production Hardening | 🔲 Pending | RAG, tests, deployment |

---

## Phase 1 — Database + Backend Restructure ✅ DONE

### What Was Built

| File | Purpose |
|------|---------|
| `server/config/index.js` | Centralized env config; fail-fast if required vars missing |
| `server/db/pool.js` | pg Pool singleton |
| `server/db/migrate.js` | Sequential migration runner (idempotent) |
| `server/db/migrations/001_initial.sql` | `users` + `chats` tables |
| `server/db/migrations/002_messages_table.sql` | Normalized `messages` table (ready for Phase 2) |
| `server/middleware/auth.js` | JWT verify (httpOnly cookie + Bearer header) |
| `server/middleware/errorHandler.js` | Centralized error handler |
| `server/utils/token.js` | `signToken` helper |
| `server/routes/auth.js` | `register / login / logout / me / change-password` |
| `server/routes/chat.js` | CRUD `GET/POST/PUT/DELETE /api/chats` |
| `server/index.js` | Slim ~37-line entry point |

**Package changes applied:** Removed `passport × 4`, added `zod`, `morgan`.

**Note:** `codethium-ai-web/package.json` still has 4 passport packages — remove before Phase 3.

---

## Phase 2 — LLM Integration + Streaming 🔲

### Provider Abstraction

```
server/services/llm/
  BaseLLMProvider.js     — interface: chat() + chatStream() async generator
  OpenRouterProvider.js  — OpenAI-compatible fetch to openrouter.ai/api/v1
  GroqProvider.js        — same pattern, different base URL
  index.js               — factory: reads LLM_PROVIDER env var
```

### Tasks

- [ ] Create `server/services/llm/BaseLLMProvider.js`
- [ ] Create `server/services/llm/OpenRouterProvider.js`
- [ ] Create `server/services/llm/GroqProvider.js`
- [ ] Create `server/services/llm/index.js` — provider factory
- [ ] Add `POST /api/chat/stream` SSE endpoint to `server/routes/chat.js`
- [ ] Update `server/routes/chat.js` to store messages in the `messages` table (not JSON blob in `chats.message`)

### SSE Streaming Endpoint

`POST /api/chat/stream`:

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

### Verification

```bash
curl -N -X POST http://localhost:4000/api/chat/stream \
  -H "Cookie: token=<jwt>" \
  -H "Content-Type: application/json" \
  -d '{"chatId":1,"content":"Hello"}'
# → streams token events to terminal
```

---

## Phase 3 — Frontend Overhaul 🔲

### Auth Persistence Fix

- **`src/context/AuthContext.js`** — calls `GET /api/me` on mount to rehydrate user from httpOnly cookie; provides `login()` and `logout()` (calls `POST /api/logout` before navigating)
- **`src/App.js`** — wrap tree with `AuthContext.Provider`; replace `useState(false)` with context; use `loading` state to avoid flash-redirect on refresh

### Centralized API Layer

- **`src/services/api.js`** — Axios instance with `baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000'` and `withCredentials: true`
- **`src/services/streamChat.js`** — `fetch` + `response.body.getReader()` SSE client; parses `event: token / done / error` frames; accepts `{onToken, onDone, onError}` callbacks

### Component Split

Replace the 416-line `ChatbotPage.js` god component:

| New Component | Responsibility |
|---------------|---------------|
| `src/components/chat/ChatPage.js` | Top-level composition (~80 lines) |
| `src/components/chat/ChatSidebar.js` | History list from `GET /api/chats`, new chat, delete |
| `src/components/chat/MessageList.js` | Scrollable area, auto-scroll to bottom |
| `src/components/chat/MessageBubble.js` | Single message, user vs assistant styling |
| `src/components/chat/MessageContent.js` | Markdown + syntax highlighting (`react-markdown` + `react-syntax-highlighter` + `remark-gfm`); **replaces `dangerouslySetInnerHTML`** |
| `src/components/chat/ChatInput.js` | Auto-resize textarea, send button, streaming spinner |

### Tasks

- [ ] Create `src/context/AuthContext.js`
- [ ] Create `src/services/api.js`
- [ ] Create `src/services/streamChat.js`
- [ ] Create `src/components/chat/ChatPage.js`
- [ ] Create `src/components/chat/ChatSidebar.js`
- [ ] Create `src/components/chat/MessageList.js`
- [ ] Create `src/components/chat/MessageBubble.js`
- [ ] Create `src/components/chat/MessageContent.js`
- [ ] Create `src/components/chat/ChatInput.js`
- [ ] Update `src/App.js` — use AuthContext, fix protected routes
- [ ] Update `src/components/LoginPage.js` — use api.js instead of hardcoded URLs
- [ ] Update `codethium-ai-web/package.json` — remove passport × 4, add `react-markdown`, `react-syntax-highlighter`, `remark-gfm`

### Bugs Fixed in This Phase

| Bug | Fix |
|-----|-----|
| Auth lost on refresh (`App.js` line 7) | AuthContext calls `/api/me` on mount |
| Logout skips API (`ChatbotPage.js` line 117) | `logout()` in AuthContext calls `POST /api/logout` |
| XSS via `dangerouslySetInnerHTML` (`ChatbotPage.js` line 271) | MessageContent uses react-markdown |
| Chat history never loads from DB | ChatSidebar calls `GET /api/chats` on mount |
| Password change uses dead localStorage token | api.js uses cookie-based auth |
| Hardcoded `localhost:8000` / `localhost:4000` URLs | api.js with env-based baseURL |

**Verification:** Refresh browser → stays logged in. Chat uses real LLM with streamed responses. Sidebar loads history from DB. Code responses have syntax highlighting.

---

## Phase 4 — Docker + Security 🔲 Partial

### Docker ✅ DONE

| File | Status |
|------|--------|
| `codethium-ai-web/server/Dockerfile` | ✅ Done |
| `codethium-ai-web/Dockerfile` | ✅ Done (multi-stage nginx) |
| `docker-compose.yml` | ✅ Done |

### Security (Pending)

- [ ] Create `server/middleware/rateLimit.js` using `express-rate-limit`
- [ ] Add `helmet` middleware to `server/index.js` for security headers
- [ ] Create `.env.example` at repo root (no secrets, committed to git)

Rate limits:

| Endpoint | Limit |
|----------|-------|
| `/api/login`, `/api/register` | 5 req/min per IP |
| `/api/chat/stream` | 20 req/min per user |
| `/api/upload/*` | 10 req/min per user |

**Verification:** `docker-compose up` → DB starts, migrations run automatically, server and frontend start. Can register/login/chat from browser at `http://localhost:3000`.

---

## Phase 5 — File & Image Upload 🔲

### Tasks

- [ ] Add `multer`, `pdf-parse` to server dependencies
- [ ] Create `server/routes/upload.js` — `POST /api/upload/image` and `POST /api/upload/file`
- [ ] Create `server/services/fileParser.js` — PDF/code text extraction
- [ ] Create `server/db/migrations/003_attachments.sql` — add `attachments` JSONB to messages
- [ ] Update `server/services/llm/OpenRouterProvider.js` — multimodal message format (base64 images)
- [ ] Update `server/routes/chat.js` — handle attachments in streaming endpoint
- [ ] Create `src/components/chat/FileUploadButton.js` — paperclip button + file picker
- [ ] Create `src/components/chat/ImagePreview.js` — thumbnail previews before send

### Notes

- Images: convert to base64 for LLM multimodal format (Llama 3.2 Vision via OpenRouter)
- Files: extracted text injected as LLM context before user's question
- Store attachment references in message `metadata` JSONB column

**Verification:** Upload a PDF → LLM can answer questions about it. Upload an image → multimodal response.

---

## Phase 6 — Chat UX Polish 🔲

### Tasks

- [ ] Group chat history by time period ("Today", "Yesterday", "Previous 7 days")
- [ ] Auto-title: after first message, quick LLM call to generate chat title
- [ ] Rename chats (double-click to edit title inline)
- [ ] Chat search/filter in sidebar
- [ ] Add `src/components/chat/SettingsPanel.js` — logout, password change, model selector

**Verification:** Professional chat management UX matching ChatGPT-like experience.

---

## Phase 7 — Production Hardening 🔲

### Security & Reliability

- [ ] Input sanitization on all user-provided text
- [ ] CORS configuration from env var (not hardcoded `localhost:3000`)
- [ ] Password strength validation (12+ chars, mixed case)
- [ ] JWT refresh token pattern (short access + long refresh)

### Testing

- [ ] Create `server/__tests__/auth.test.js` (Jest + Supertest)
- [ ] Create `server/__tests__/chat.test.js`
- [ ] Create `server/__tests__/llm.test.js` (mocked provider)

### RAG — Retrieval-Augmented Generation

- [ ] Create `server/services/rag.js`
- [ ] Create `server/db/migrations/004_documents.sql` — `documents` table with `tsvector` full-text search
- [ ] When user uploads docs: chunk + store in `documents` table
- [ ] Before LLM call: search user's docs for relevant chunks, inject as context
- [ ] Uses PostgreSQL built-in FTS — no vector DB needed

### Deployment

- [ ] Deploy Express to Railway or Render
- [ ] Deploy PostgreSQL to Supabase or Railway
- [ ] Rewrite `README.md` — architecture diagram, setup instructions, screenshots, live URL
- [ ] Update `CLAUDE.md` to reflect final architecture

**Verification:** `npm test` passes. Live URL accessible. Upload a document, ask about it — RAG retrieval works.

---

## Summary — All Files

### Created in Phase 1 ✅

```
codethium-ai-web/server/
  config/index.js
  db/pool.js
  db/migrate.js
  db/migrations/001_initial.sql
  db/migrations/002_messages_table.sql
  middleware/auth.js
  middleware/errorHandler.js
  routes/auth.js
  routes/chat.js
  utils/token.js
  Dockerfile

codethium-ai-web/
  Dockerfile                   (multi-stage nginx)
  nginx.conf

docker-compose.yml             (repo root)
```

### To Create in Phase 2–7

```
codethium-ai-web/server/
  middleware/rateLimit.js                  (Phase 4)
  services/llm/BaseLLMProvider.js          (Phase 2)
  services/llm/OpenRouterProvider.js       (Phase 2)
  services/llm/GroqProvider.js             (Phase 2)
  services/llm/index.js                    (Phase 2)
  services/fileParser.js                   (Phase 5)
  services/rag.js                          (Phase 7)
  routes/upload.js                         (Phase 5)
  db/migrations/003_attachments.sql        (Phase 5)
  db/migrations/004_documents.sql          (Phase 7)
  __tests__/auth.test.js                   (Phase 7)
  __tests__/chat.test.js                   (Phase 7)
  __tests__/llm.test.js                    (Phase 7)

codethium-ai-web/src/
  context/AuthContext.js                   (Phase 3)
  services/api.js                          (Phase 3)
  services/streamChat.js                   (Phase 3)
  components/chat/ChatPage.js              (Phase 3)
  components/chat/ChatSidebar.js           (Phase 3)
  components/chat/MessageList.js           (Phase 3)
  components/chat/MessageBubble.js         (Phase 3)
  components/chat/MessageContent.js        (Phase 3)
  components/chat/ChatInput.js             (Phase 3)
  components/chat/SettingsPanel.js         (Phase 6)
  components/chat/FileUploadButton.js      (Phase 5)
  components/chat/ImagePreview.js          (Phase 5)

.env.example                               (Phase 4)
```

### Modified in Phase 1 ✅

```
codethium-ai-web/server/index.js           → slim entry point (~37 lines)
codethium-ai-web/server/package.json       → removed passport × 4, added zod + morgan
```

### To Modify in Phase 2–7

```
codethium-ai-web/server/routes/chat.js    → add POST /api/chat/stream (Phase 2)
codethium-ai-web/server/index.js          → add helmet + rateLimit (Phase 4)
codethium-ai-web/src/App.js               → add AuthContext (Phase 3)
codethium-ai-web/src/components/LoginPage.js → use api.js (Phase 3)
codethium-ai-web/package.json             → remove passport × 4, add markdown libs (Phase 3)
```

### Archived

```
codethium-model/   → archived (FastAPI + custom model no longer used)
```
