# CodeThium AI — Implementation Plan

## Overview

Replace the non-functional custom PyTorch model with real LLM APIs, restructure the Express monolith into modules, fix critical security/UX bugs, and containerize the full stack.

**Stack:** React 19 · Express 5 · PostgreSQL · OpenRouter/Groq LLM APIs · Docker

---

## Status Summary

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 1 — DB + Backend Restructure | ✅ DONE | Modular Express, migrations, clean env config |
| Phase 2 — Hybrid LLM Integration + Streaming | ✅ DONE | Local model + OpenRouter/Groq providers + SSE endpoint + 429 fallback |
| Phase 3 — Frontend Overhaul | ✅ DONE | AuthContext, api.js, streamChat.js, split ChatbotPage, model selector |
| Phase 4 — Docker + Security | ✅ DONE | Docker, local-model, helmet, rate limiting, .env.example |
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

**Note:** Passport packages were removed in Phase 3.

---

## Phase 2 — Hybrid LLM Integration + Streaming ✅ DONE

### Strategy

Keep the custom-trained local model (2.6M param transformer, Python code generation) as a selectable option alongside external LLM APIs (OpenRouter, Groq). All providers share the same interface. Express is the single gateway — the frontend never calls FastAPI directly.

### Step 2a — Fix Custom Model (`codethium-model/`) ✅ DONE

- [x] Fix 4 hardcoded absolute paths in `decoder_only_model.py` → use `MODEL_DIR` env var
- [x] Fix `model_components.py` → wrap IPython import in try/except (crashes outside notebooks)
- [x] Add `/health` GET endpoint to `decoder_only_model.py`
- [x] Remove `reload=True` from uvicorn call

### Step 2b — Dockerize Custom Model ✅ DONE

- [x] Create `codethium-model/requirements-inference.txt` — slim deps: torch, sentencepiece, fastapi, uvicorn, numpy, pydantic
- [x] Create `codethium-model/Dockerfile` — python:3.11-slim, copies weights, sets MODEL_DIR=/app
- [x] Add `local-model` service to `docker-compose.yml` with healthcheck (`/health` endpoint, 30s start_period)
- [x] Add `LOCAL_MODEL_URL: http://local-model:8000` to server service env in docker-compose
- [x] Add `local-model` to server's `depends_on`

### Step 2c — Provider Abstraction ✅ DONE

```
server/services/llm/
  BaseLLMProvider.js            — abstract: chat(), chatStream(), getModelName()
  OpenAICompatibleProvider.js   — shared fetch + SSE line parsing (Node native fetch)
  OpenRouterProvider.js         — extends OpenAICompatible (openrouter.ai/api/v1)
  GroqProvider.js               — extends OpenAICompatible (api.groq.com/openai/v1)
  LocalModelProvider.js         — calls FastAPI /chat, yields full response as one chunk
  index.js                      — factory: getProvider("openrouter"|"groq"|"local")
```

- [x] Create `server/services/llm/BaseLLMProvider.js`
- [x] Create `server/services/llm/OpenAICompatibleProvider.js`
- [x] Create `server/services/llm/OpenRouterProvider.js`
- [x] Create `server/services/llm/GroqProvider.js`
- [x] Create `server/services/llm/LocalModelProvider.js`
- [x] Create `server/services/llm/index.js` — provider factory
- [x] Update `server/config/index.js` — add `LOCAL_MODEL_URL`, `OPENROUTER_MODEL`, `GROQ_MODEL`

### Step 2d — SSE Streaming Endpoint ✅ DONE

- [x] Add `POST /api/chats/stream` to `server/routes/chat.js`
- [x] Update `server/routes/chat.js` to store messages in the `messages` table (not JSON blob)
- [x] Add automatic 429 fallback (OpenRouter → Groq, Groq → OpenRouter)
- [x] Add `GET /api/chats/:id/messages` endpoint for loading chat history

`POST /api/chat/stream` body: `{ chatId, content, model? }` where model is `"openrouter"` | `"groq"` | `"local"`:

```
1. authMiddleware → Zod validate {chatId, content, model?}
2. Verify chat belongs to req.userId
3. Save user message to messages table
4. Load last 20 messages from DB as LLM context array
5. Resolve provider: req.body.model || config.LLM_PROVIDER
6. Set SSE headers: Content-Type: text/event-stream, X-Accel-Buffering: no
7. Call provider.chatStream() async generator
8. For each chunk → write: event: token\ndata: {"content":"..."}\n\n
9. On complete → save assistant message (metadata: {provider, model}), write: event: done\ndata: {"messageId":N,"model":"..."}\n\n
10. On error → write: event: error\ndata: {"error":"..."}\n\n
```

**Provider behavior:**
- OpenRouter/Groq: real token-by-token streaming
- LocalModel: single POST to FastAPI, yields full response as one chunk (model doesn't natively stream)

### Verification

```bash
# Test local model directly
cd codethium-model && python decoder_only_model.py
curl -X POST http://localhost:8000/chat -H "Content-Type: application/json" \
  -d '{"message":"write a function to add two numbers"}'

# Test SSE endpoint — local model
curl -N -X POST http://localhost:4000/api/chat/stream \
  -H "Cookie: token=<jwt>" \
  -H "Content-Type: application/json" \
  -d '{"chatId":1,"content":"write a sorting function","model":"local"}'

# Test SSE endpoint — OpenRouter
curl -N -X POST http://localhost:4000/api/chat/stream \
  -H "Cookie: token=<jwt>" \
  -H "Content-Type: application/json" \
  -d '{"chatId":1,"content":"What is recursion?","model":"openrouter"}'
```

---

## Phase 3 — Frontend Overhaul ✅ DONE

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
| `src/components/chat/ChatInput.js` | Auto-resize textarea, send button, streaming spinner, **model selector dropdown** |

### Model Selector Dropdown (in ChatInput.js)

A dropdown lets users choose which LLM to use per-message. Stored in React state, sent as `model` field in the stream request.

| Display Name | Value | Notes |
|---|---|---|
| Llama 3 (OpenRouter) | `openrouter` | General purpose, best quality — default |
| Llama 3 (Groq) | `groq` | Fast inference |
| CodeThium Local | `local` | Custom-trained Python code model |

### Tasks

- [x] Create `src/context/AuthContext.js`
- [x] Create `src/services/api.js`
- [x] Create `src/services/streamChat.js`
- [x] Create `src/components/chat/ChatPage.js`
- [x] Create `src/components/chat/ChatSidebar.js`
- [x] Create `src/components/chat/MessageList.js`
- [x] Create `src/components/chat/MessageBubble.js`
- [x] Create `src/components/chat/MessageContent.js`
- [x] Create `src/components/chat/ChatInput.js`
- [x] Update `src/App.js` — use AuthContext, fix protected routes
- [x] Update `src/components/LoginPage.js` — use api.js instead of hardcoded URLs
- [x] Update `codethium-ai-web/package.json` — remove passport × 4, add `react-markdown`, `react-syntax-highlighter`, `remark-gfm`

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

## Phase 4 — Docker + Security ✅ DONE

### Docker

| File | Status |
|------|--------|
| `codethium-ai-web/server/Dockerfile` | ✅ Done |
| `codethium-ai-web/Dockerfile` | ✅ Done (multi-stage nginx) |
| `docker-compose.yml` | ✅ Done (postgres + server + frontend + local-model) |
| `codethium-model/Dockerfile` | ✅ Done |
| `codethium-model/requirements-inference.txt` | ✅ Done |
| `docker-compose.yml` — `local-model` service | ✅ Done (with healthcheck) |

### Security ✅ DONE

- [x] Create `server/middleware/rateLimit.js` using `express-rate-limit`
- [x] Add `helmet` middleware to `server/index.js` for security headers
- [x] Create `.env.example` at repo root (no secrets, committed to git)

Rate limits:

| Endpoint | Limit |
|----------|-------|
| `/api/login`, `/api/register` | 15 req/min per IP |
| `/api/chats/stream` | 60 req/min per user |
| `/api/upload/*` | 30 req/min per user |

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

### Created in Phase 2 ✅

```
codethium-model/
  Dockerfile
  requirements-inference.txt

codethium-ai-web/server/
  services/llm/BaseLLMProvider.js
  services/llm/OpenAICompatibleProvider.js
  services/llm/OpenRouterProvider.js
  services/llm/GroqProvider.js
  services/llm/LocalModelProvider.js
  services/llm/index.js
```

### Created in Phase 3 ✅

```
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
```

### Created in Phase 4 ✅

```
codethium-ai-web/server/middleware/rateLimit.js
.env.example
```

### Modified in Phase 1–4 ✅

```
codethium-ai-web/server/index.js           → slim entry point + helmet
codethium-ai-web/server/package.json       → removed passport × 4, added zod, morgan, helmet, express-rate-limit
codethium-model/decoder_only_model.py     → fixed hardcoded paths, added /health, removed reload=True
codethium-model/model_components.py       → wrapped IPython import in try/except
codethium-ai-web/server/config/index.js   → added LOCAL_MODEL_URL, OPENROUTER_MODEL, GROQ_MODEL
codethium-ai-web/server/routes/chat.js    → added POST /api/chats/stream with hybrid provider + rate limit
codethium-ai-web/server/routes/auth.js    → added authLimiter to login/register
docker-compose.yml                        → added local-model service with healthcheck
codethium-ai-web/src/App.js               → AuthContext, ProtectedRoute
codethium-ai-web/src/components/LoginPage.js → api.js instead of hardcoded URLs
codethium-ai-web/package.json             → removed passport × 4, added react-markdown, react-syntax-highlighter, remark-gfm
```

### To Create in Phase 5–7

```
codethium-ai-web/server/
  services/fileParser.js                   (Phase 5)
  services/rag.js                          (Phase 7)
  routes/upload.js                         (Phase 5)
  db/migrations/003_attachments.sql        (Phase 5)
  db/migrations/004_documents.sql          (Phase 7)
  __tests__/auth.test.js                   (Phase 7)
  __tests__/chat.test.js                   (Phase 7)
  __tests__/llm.test.js                    (Phase 7)

codethium-ai-web/src/
  components/chat/SettingsPanel.js         (Phase 6)
  components/chat/FileUploadButton.js      (Phase 5)
  components/chat/ImagePreview.js          (Phase 5)
```

### Note on Custom Model

`codethium-model/` is NOT archived — it is kept as a selectable LLM provider ("CodeThium Local") routed through Express. The FastAPI server is containerized alongside the other services. It specializes in Python code generation (trained on MBPP dataset).
