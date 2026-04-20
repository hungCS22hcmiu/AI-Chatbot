# CodeThium AI — Full Restructure Plan

## Context

CodeThium is a full-stack AI chatbot with 3 disconnected services: React frontend (port 3000), Express backend (port 4000), and a custom FastAPI+PyTorch model (port 8000). The custom model is a toy (4M params, ~1000 training examples, hardcoded paths to another machine). The goal is to transform this into a modern ChatGPT-like assistant powered by real LLM APIs (free/cheap), with streaming, file/image upload, syntax highlighting, and production-ready architecture.

---

## 1. System Audit — Current Weaknesses

### AI Layer
- Custom 4-layer decoder-only Transformer (~4M params) trained on ~1000 code examples
- Can only generate basic Python code completions, cannot answer general questions
- Hardcoded absolute paths to `/Users/dangnguyengroup/` — won't run on current machine
- No authentication on FastAPI `/chat` endpoint, CORS allows all origins

### Backend Design
- Single-file monolith: `server/index.js` (246 lines) contains all routes, middleware, DB config
- Hardcoded DB password fallback: `"230292Huong"` (line 24)
- Hardcoded JWT secret fallback: `"dev_secret"` (lines 36, 52)
- Empty `.env` file — all fallback values active
- Passport packages installed but completely unused (4 packages)
- No input validation, no rate limiting, no request logging
- Express and FastAPI are completely disconnected — no server-to-server communication
- Chat messages stored as JSON blob (entire conversation in one column)

### Frontend UX
- Auth state lost on page refresh (`useState(false)` in App.js line 7)
- ChatbotPage.js is a 416-line god component
- XSS vulnerability: `dangerouslySetInnerHTML` on AI responses (line 271)
- Chat history is local state only — never loads from DB despite CRUD endpoints existing
- Logout navigates without calling the logout API (cookie never cleared)
- Mixed HTTP clients: axios for AI chat, fetch for auth/password
- Hardcoded URLs: `localhost:8000` and `localhost:4000` throughout
- Passport packages installed in frontend package.json (server-side library, does nothing)

### Scalability & Maintainability
- No database migrations — schema is undocumented
- No tests
- No error handling strategy (each route has its own try/catch)
- No separation of concerns (routes, services, middleware all in one file)

---

## 2. Architecture Redesign

### Key Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Remove FastAPI? | **Yes, completely** | Custom model is a toy. Route LLM calls through Express to centralize backend and showcase Node.js skills |
| Keep Express? | **Yes** | Auth, chat CRUD already work. Restructure into modules, don't rewrite from scratch |
| Frontend framework | **Keep React + CRA** | CSS is excellent (1,232 lines of polished glassmorphism). Refactor components, don't rebuild |
| State management | **Context API** | Sufficient for auth + chat state. Redux/Zustand is overkill here |
| Streaming approach | **SSE (Server-Sent Events)** | Unidirectional server-to-client. Simpler than WebSocket, native browser support, works through proxies |
| LLM provider | **OpenRouter (primary), Groq (fallback)** | OpenRouter gives access to many models via single API key with free tier. Groq has fast inference with free tier |
| Database | **Keep PostgreSQL** | Add proper migrations. Add normalized `messages` table |
| ORM | **None — keep raw pg** | Parameterized queries already used correctly. Raw SQL is more impressive for backend interviews than hiding behind an ORM |

### Target Architecture

```
+--------------------------------------------------+
|              BROWSER (React 19)                   |
|                                                   |
|  AuthContext -- api.js -- Components (split up)   |
|  (persisted)   (env URL)  (chat/, auth/)          |
|                    |                              |
+--------------------+------------------------------+
                     |  ALL requests -> Express
                     v
+--------------------------------------------------+
|            EXPRESS SERVER (Node.js)                |
|                                                   |
|  server/                                          |
|  +-- index.js           (entry: mount & listen)   |
|  +-- config/index.js    (env validation)          |
|  +-- db/                                          |
|  |   +-- pool.js        (pg Pool singleton)       |
|  |   +-- migrate.js     (migration runner)        |
|  |   +-- migrations/    (SQL files)               |
|  +-- middleware/                                   |
|  |   +-- auth.js        (JWT verify)              |
|  |   +-- validate.js    (zod schemas)             |
|  |   +-- rateLimit.js   (express-rate-limit)      |
|  |   +-- errorHandler.js                          |
|  +-- routes/                                      |
|  |   +-- auth.js        (register/login/logout)   |
|  |   +-- chat.js        (CRUD + SSE streaming)    |
|  |   +-- upload.js      (file/image upload)       |
|  +-- services/                                    |
|  |   +-- llm/                                     |
|  |   |   +-- BaseLLMProvider.js  (interface)      |
|  |   |   +-- OpenRouterProvider.js                |
|  |   |   +-- GroqProvider.js                      |
|  |   |   +-- index.js   (factory by env config)   |
|  |   +-- fileParser.js  (PDF/code extraction)     |
|  +-- utils/                                       |
|       +-- token.js      (JWT sign/verify)         |
|                                                   |
|  Key flow: POST /api/chat/stream                  |
|  1. Auth middleware -> 2. Validate input ->        |
|  3. Save user msg to DB -> 4. Load history ->     |
|  5. Call LLM provider (streaming) ->              |
|  6. Write SSE chunks to response ->               |
|  7. Save assistant msg to DB -> 8. Send 'done'   |
+----------+---------------------+------------------+
           |                     |
           v                     v
+------------------+  +------------------------+
|   PostgreSQL     |  |  LLM API (external)    |
|                  |  |                        |
|  users           |  |  OpenRouter (primary)  |
|  chats           |  |  Groq (fallback)       |
|  messages (new)  |  |                        |
|  migrations      |  |  OpenAI-compatible     |
+------------------+  |  format for both       |
                      +------------------------+
```

---

## 3. LLM Integration Strategy

### Free/Cheap Providers

| Provider | Free Tier | Best For | API Format |
|----------|-----------|----------|------------|
| **OpenRouter** | Free models (Llama 3, Mistral, Gemma) | Primary — wide model selection | OpenAI-compatible |
| **Groq** | Free tier (rate-limited) | Fallback — very fast inference | OpenAI-compatible |
| **Together.ai** | $1 free credit | Alternative | OpenAI-compatible |

All three use the OpenAI-compatible chat completions format, so the provider abstraction is straightforward — change base URL + API key.

### Provider Abstraction (`server/services/llm/`)

```javascript
// BaseLLMProvider.js — interface
class BaseLLMProvider {
  async chat(messages, options) { throw new Error('Not implemented'); }
  async *chatStream(messages, options) { throw new Error('Not implemented'); }
}

// OpenRouterProvider.js — example implementation
class OpenRouterProvider extends BaseLLMProvider {
  async *chatStream(messages, { model, temperature, maxTokens }) {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, temperature, max_tokens: maxTokens })
    });
    // Parse SSE: data: {"choices":[{"delta":{"content":"..."}}]}
    // Yield each content chunk from async generator
  }
}

// index.js — factory
function createLLMProvider() {
  switch (config.LLM_PROVIDER) {
    case 'openrouter': return new OpenRouterProvider(config.OPENROUTER_API_KEY);
    case 'groq': return new GroqProvider(config.GROQ_API_KEY);
    default: return new OpenRouterProvider(config.OPENROUTER_API_KEY);
  }
}
```

### Streaming Endpoint Design

`POST /api/chat/stream` — SSE response:

```
event: token
data: {"content":"Hello"}

event: token
data: {"content":" world"}

event: done
data: {"messageId":42,"model":"llama-3-8b"}

event: error
data: {"error":"Rate limit exceeded"}
```

Frontend reads with `fetch` + `response.body.getReader()` (not `EventSource`, which only supports GET).

### Rate Limiting Strategy
- Auth endpoints: 5 req/min per IP
- Chat streaming: 20 req/min per user
- File upload: 10 req/min per user

---

## 4. Feature Implementation Plan

### 4.1 Authentication (improve existing)
- **Keep**: JWT + bcrypt + httpOnly cookies (already working)
- **Fix**: Auth persistence on refresh (call `GET /api/me` on mount)
- **Fix**: Logout must call `POST /api/logout` before navigating
- **Fix**: Remove hardcoded secrets (require env vars, fail if missing)
- **Remove**: Passport packages from both frontend and server package.json

### 4.2 Chat System (LLM-based, replace custom model)
- New `POST /api/chat/stream` endpoint with SSE
- New `messages` table (normalized, one row per message)
- Provider abstraction for LLM switching
- Conversation history loaded from DB as LLM context
- Context window management (sliding window of last N messages)

### 4.3 Image Upload + Multimodal
- `POST /api/upload/image` — multer, store to `server/uploads/images/`
- Convert to base64 for LLM multimodal format
- OpenRouter supports vision models (Llama 3.2 Vision, etc.)
- Store attachment references in message `metadata` JSONB column

### 4.4 File Upload + Parsing
- `POST /api/upload/file` — accept PDF, txt, code files
- `pdf-parse` for PDF text extraction
- Code files read as UTF-8
- Extracted text injected as LLM context before user's question

### 4.5 Syntax Highlighting
- `react-markdown` + `react-syntax-highlighter` + `remark-gfm`
- Custom renderer for code blocks with copy button
- Replaces the XSS-vulnerable `dangerouslySetInnerHTML`

### 4.6 Chat History Improvements
- Load from DB on mount (wire existing `GET /api/chats`)
- Group by time period ("Today", "Yesterday", "Previous 7 days")
- Auto-title: after first message, quick LLM call to generate title
- Rename chats (double-click to edit)
- Search chats

---

## 5. Tech Stack Decision

| Layer | Current | New | Rationale |
|-------|---------|-----|-----------|
| Frontend | React 19 + CRA | **Keep React 19 + CRA** | CSS is excellent, just refactor components |
| Backend | Express 5.1 (monolith) | **Express 5.1 (modular)** | Restructure, don't rewrite |
| AI | FastAPI + custom PyTorch | **Remove entirely** -> LLM APIs via Express | Custom model is non-functional |
| Database | PostgreSQL | **Keep PostgreSQL** + add migrations | Already works, add structure |
| Realtime | None | **SSE** | Simpler than WebSocket for streaming |
| Validation | None | **Zod** | TypeScript-adjacent thinking, good for portfolio |
| File upload | None | **Multer** | Standard Express file handling |

---

## 6. Step-by-Step Roadmap

### Phase 1: MVP with LLM API (Weeks 1-3)

**Goal:** Replace custom model with real LLM, add streaming, restructure backend. User can log in, chat with a real LLM, see streamed responses.

#### Week 1: Backend Restructure
- [ ] Create `server/config/index.js` — centralized env config, validate required vars
- [ ] Create `server/db/pool.js` — extract pg Pool from index.js
- [ ] Create `server/db/migrations/001_initial.sql` — document existing schema
- [ ] Create `server/db/migrations/002_messages_table.sql` — normalized messages
- [ ] Create `server/db/migrate.js` — simple migration runner
- [ ] Create `server/middleware/auth.js` — extract from index.js lines 40-58
- [ ] Create `server/middleware/validate.js` — zod-based validation
- [ ] Create `server/middleware/errorHandler.js` — centralized error handling
- [ ] Create `server/routes/auth.js` — extract from index.js lines 62-187
- [ ] Create `server/routes/chat.js` — extract from index.js lines 190-242
- [ ] Create `server/utils/token.js` — extract signToken helper
- [ ] Rewrite `server/index.js` — slim entry point (~30 lines)
- [ ] Update `server/package.json` — remove passport (4 pkgs), add zod, morgan
- [ ] Create `server/.gitignore` — ensure .env is not tracked
- [ ] Populate `server/.env` with required vars
- **Outcome:** Same functionality, clean modular structure. Verify all existing endpoints still work.

#### Week 2: LLM Integration + Streaming
- [ ] Create `server/services/llm/BaseLLMProvider.js`
- [ ] Create `server/services/llm/OpenRouterProvider.js`
- [ ] Create `server/services/llm/GroqProvider.js`
- [ ] Create `server/services/llm/index.js` — provider factory
- [ ] Add `POST /api/chat/stream` SSE endpoint in `server/routes/chat.js`
- [ ] Test streaming with curl before touching frontend
- **Outcome:** Backend can stream LLM responses. Testable via curl/Postman.

#### Week 3: Frontend Minimum Fixes
- [ ] Create `src/context/AuthContext.js` — persist auth via `GET /api/me` on mount
- [ ] Create `src/services/api.js` — centralized API client, env-based URL
- [ ] Create `src/services/streamChat.js` — SSE client using fetch + ReadableStream
- [ ] Update `src/App.js` — use AuthContext, fix protected routes
- [ ] Update `src/components/ChatbotPage.js` — use api.js, streamChat.js, wire chat history to DB, fix XSS (replace dangerouslySetInnerHTML with plain text), fix logout
- [ ] Update `src/components/LoginPage.js` — use api.js instead of hardcoded URLs
- [ ] Update `codethium-ai-web/package.json` — remove passport packages, remove axios
- **Outcome:** Full working MVP. Login persists. Chat uses real LLM with streaming. History saved to DB.

**Difficulty:** Medium — mostly extraction/wiring, one genuinely new feature (SSE streaming).

---

### Phase 2: Feature Expansion (Weeks 4-6)

**Goal:** File/image upload, markdown rendering, component decomposition. After this, the app is a credible ChatGPT-like experience.

#### Week 4: Markdown Rendering + Component Split
- [ ] Add `react-markdown`, `react-syntax-highlighter`, `remark-gfm` to frontend
- [ ] Create `src/components/chat/MessageContent.js` — markdown + syntax highlighting + copy button
- [ ] Create `src/components/chat/ChatSidebar.js` — sidebar with history, new chat, settings
- [ ] Create `src/components/chat/ChatInput.js` — textarea, send button, auto-resize
- [ ] Create `src/components/chat/MessageList.js` — scrollable message area
- [ ] Create `src/components/chat/MessageBubble.js` — individual message
- [ ] Create `src/components/chat/SettingsPanel.js` — logout, password change
- [ ] Create `src/components/chat/ChatPage.js` — compose all above, replace ChatbotPage.js
- [ ] Update `src/App.js` routing to use new ChatPage
- **Outcome:** Clean component architecture. Code responses have syntax highlighting.

#### Week 5: File & Image Upload
- [ ] Add `multer`, `pdf-parse` to server dependencies
- [ ] Create `server/routes/upload.js` — image + file upload endpoints
- [ ] Create `server/services/fileParser.js` — PDF/code text extraction
- [ ] Create `server/db/migrations/003_attachments.sql` — add attachments JSONB to messages
- [ ] Update `server/services/llm/OpenRouterProvider.js` — multimodal message format
- [ ] Update `server/routes/chat.js` — handle attachments in streaming endpoint
- [ ] Create `src/components/chat/FileUploadButton.js` — paperclip button + file picker
- [ ] Create `src/components/chat/ImagePreview.js` — thumbnail previews
- **Outcome:** Users can upload images and files. LLM can see images and read file content.

#### Week 6: Chat UX Polish
- [ ] Chat history grouped by date ("Today", "Yesterday", etc.)
- [ ] Auto-title generation (quick LLM call after first message)
- [ ] Rename chats (inline edit)
- [ ] Chat search/filter
- **Outcome:** Professional chat management UX.

**Difficulty:** Medium-High — multimodal LLM integration requires careful message formatting.

---

### Phase 3: Scaling + Polish (Week 7+, incremental)

**Goal:** Security hardening, testing, deployment, and portfolio-differentiating features.

#### Security & Production Hardening
- [ ] Create `server/middleware/rateLimit.js` — express-rate-limit per endpoint
- [ ] Add `helmet` to server (security headers)
- [ ] Input sanitization on all user-provided text
- [ ] CORS configuration from env var for production
- [ ] Password strength validation (12+ chars, mixed case)
- [ ] JWT refresh token pattern (short access + long refresh)

#### Testing
- [ ] Create `server/__tests__/auth.test.js` (Jest + Supertest)
- [ ] Create `server/__tests__/chat.test.js`
- [ ] Create `server/__tests__/llm.test.js` (mocked provider)
- **Outcome:** Test suite that proves the backend works.

#### Portfolio-Differentiating Features

**Basic RAG (Retrieval-Augmented Generation):**
- Create `server/services/rag.js`
- Migration: `documents` table with PostgreSQL `tsvector` full-text search
- When user uploads docs, chunk and store. Before LLM call, search user's docs for relevant chunks and inject as context
- Uses PostgreSQL built-in FTS — no vector DB needed. Simple but genuine RAG.

**Tool Calling (Function Calling):**
- Create `server/services/tools/` — weather, calculator, web search tools
- When LLM requests a tool call, execute it server-side, feed result back
- Demonstrates understanding of agentic AI patterns

**Conversation Export:**
- `GET /api/chats/:id/export` — export as markdown or JSON

#### Deployment
- [ ] Create `Dockerfile` for Express server
- [ ] Create `docker-compose.yml` (Express + PostgreSQL)
- [ ] Create `.env.example` with all required vars documented
- [ ] Rewrite `README.md` with architecture diagram, setup instructions, screenshots

**Difficulty:** Variable — security is straightforward, RAG is impressive but achievable, tool calling is stretch.

---

## 7. Bonus — Internship Portfolio Impact

### Features That Stand Out
1. **Provider abstraction layer** — shows design pattern knowledge (Strategy pattern)
2. **SSE streaming** — shows understanding of real-time protocols
3. **Database migrations** — shows production mindset
4. **RAG with PostgreSQL FTS** — shows AI engineering knowledge without overengineering
5. **Tool calling** — shows awareness of modern AI agent patterns
6. **Zod validation** — shows TypeScript-adjacent thinking even in JS

### CV Presentation
- "Built a ChatGPT-like AI assistant with LLM provider abstraction, SSE streaming, and RAG"
- Highlight: backend architecture (modular Express, provider pattern, migrations)
- Highlight: system design (why SSE over WebSocket, why no ORM, why PostgreSQL FTS over vector DB)
- Deploy to a live URL (Railway/Render for Express + Supabase for PostgreSQL)

---

## 8. What NOT To Do

- **Don't add TypeScript now** — doubles migration effort. Mention "planned" in README.
- **Don't add Redux/Zustand** — Context API is sufficient for this app size.
- **Don't add an ORM** — raw pg with parameterized queries is more impressive in interviews.
- **Don't keep FastAPI** — having two backend servers communicates confusion, not sophistication.
- **Don't implement social auth** — passport packages are unused, remove them. Social auth is scope creep.
- **Don't add a monorepo tool** — two packages don't need Nx/Turborepo.

---

## 9. Critical Files Reference

| File | Lines | Role | Action |
|------|-------|------|--------|
| `server/index.js` | 246 | Backend monolith | Decompose into modules (Phase 1) |
| `src/components/ChatbotPage.js` | 416 | Frontend god component | Patch in Phase 1, replace in Phase 2 |
| `src/App.js` | 22 | Routing + auth state | Fix auth persistence (Phase 1) |
| `src/components/LoginPage.js` | 209 | Auth UI | Fix hardcoded URLs (Phase 1) |
| `server/package.json` | 30 | Backend deps | Clean up + add new deps (Phase 1) |
| `codethium-ai-web/package.json` | 45 | Frontend deps | Remove passport, add markdown libs (Phase 1-2) |
| `codethium-model/decoder_only_model.py` | ~80 | FastAPI server (retiring) | Reference for API contract, then archive |

---

## 10. Verification Plan

After each phase, verify end-to-end:

**Phase 1:**
1. `cd server && npm run dev` — server starts without errors
2. Register a new user via `POST /api/register`
3. Login via `POST /api/login` — verify cookie set
4. `curl -X POST /api/chat/stream` — verify SSE tokens stream back
5. Refresh browser — verify auth persists (no redirect to login)
6. Check chat appears in sidebar from DB

**Phase 2:**
1. Send a message with code — verify syntax highlighting renders
2. Upload a PDF — verify text extracted and used as LLM context
3. Upload an image — verify multimodal response
4. Check component structure — no file over 150 lines

**Phase 3:**
1. Run `npm test` — all tests pass
2. `docker-compose up` — full stack starts
3. Hit rate limits — verify 429 responses
4. Upload a document, ask about it — verify RAG retrieval works

---

## 11. Bugs Found During Audit

1. **XSS vulnerability:** `ChatbotPage.js` line 271 — `dangerouslySetInnerHTML={{ __html: msg.text }}`
2. **Auth state lost on refresh:** `App.js` line 7 — `useState(false)`, no token revalidation
3. **Logout does not call API:** `ChatbotPage.js` line 117 — navigates without clearing cookie
4. **Chat history is local-only:** `ChatbotPage.js` lines 12-14 — backend CRUD exists but frontend never calls it
5. **Hardcoded DB password:** `server/index.js` line 24 — `"230292Huong"` committed to git
6. **Hardcoded JWT secret:** `server/index.js` lines 36, 52 — defaults to `"dev_secret"`
7. **Mixed HTTP clients:** LoginPage uses `fetch`, ChatbotPage uses `axios` + `fetch`
8. **Hardcoded model paths:** `decoder_only_model.py` — paths to `/Users/dangnguyengroup/`
9. **Empty .env file:** `server/.env` exists but is 0 lines
10. **Passport in frontend:** `codethium-ai-web/package.json` includes passport (server-side library)
11. **Dead CSS:** `src/index.css` sets light background, overridden by ChatbotPage dark theme
