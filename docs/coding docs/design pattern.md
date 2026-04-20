# Design Patterns in CodeThium AI Chatbot — Backend & Database

> Scope: `codethium-ai-web/server/` (Express backend) and PostgreSQL database layer only.

---

## Table of Contents

| # | Pattern | Category | Location |
|---|---------|----------|----------|
| 1 | [Template Method](#1-template-method-pattern) | Behavioral | `services/llm/BaseLLMProvider.js` |
| 2 | [Strategy](#2-strategy-pattern) | Behavioral | `services/llm/*.js` |
| 3 | [Factory Method](#3-factory-method-pattern) | Creational | `services/llm/index.js` |
| 4 | [Singleton](#4-singleton-pattern) | Creational | `db/pool.js`, `config/index.js` |
| 5 | [Facade](#5-facade-pattern) | Structural | `services/fileParser.js` |
| 6 | [Decorator / Middleware Chain](#6-decorator--middleware-chain-pattern) | Structural | `app.js`, `middleware/*.js` |
| 7 | [Data Access Object (DAO)](#7-data-access-object-dao-pattern) | Structural | `services/rag.js`, `routes/*.js` |
| 8 | [Chain of Responsibility](#8-chain-of-responsibility-pattern) | Behavioral | `routes/chat.js` |
| 9 | [Observer / Server-Sent Events](#9-observer--server-sent-events-pattern) | Behavioral | `routes/chat.js` |
| 10 | [Adapter](#10-adapter-pattern) | Structural | `utils/token.js` |

---

## Overall Backend Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP Request                              │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              EXPRESS MIDDLEWARE PIPELINE  (app.js)              │
│  helmet ──► morgan ──► json ──► cookieParser ──► cors           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
     /api/auth      /api/chats      /api/upload
     (auth.js)      (chat.js)      (upload.js)
          │               │               │
          │    authMiddleware + rateLimiter│
          │               │               │
          ▼               ▼               ▼
    ┌──────────┐   ┌─────────────┐  ┌────────────┐
    │  Users   │   │ Chain of    │  │ fileParser │
    │  Auth    │   │Responsibility│  │  (Facade)  │
    │  (DAO)   │   │  Pipeline   │  │            │
    └────┬─────┘   └──────┬──────┘  └─────┬──────┘
         │                │               │
         ▼                ▼               ▼
    ┌──────────┐   ┌─────────────┐  ┌────────────┐
    │   Pool   │   │ LLM Factory │  │   Pool     │
    │(Singleton│   │+ Strategy   │  │(Singleton) │
    └────┬─────┘   └──────┬──────┘  └─────┬──────┘
         │                │               │
         ▼                ▼               ▼
    ┌─────────────────────────────────────────────┐
    │              PostgreSQL Database             │
    │  users │ chats │ messages │ documents │ ...  │
    └─────────────────────────────────────────────┘
```

---

## 1. Template Method Pattern

**Category:** Behavioral
**Files:** `services/llm/BaseLLMProvider.js`, all provider files

### How It Works

`BaseLLMProvider` defines the **skeleton** (interface contract) that every LLM provider must honour. The three abstract methods—`chat()`, `chatStream()`, and `getModelName()`—throw `Error('Not implemented')` unless overridden. Subclasses fill in the concrete steps while the caller always works through the base class interface.

```
BaseLLMProvider            (abstract — defines interface)
       │
       ├── chat(messages)          ← must implement
       ├── chatStream(messages)    ← must implement (async generator)
       └── getModelName()          ← must implement
```

### Code Snippet

```javascript
// services/llm/BaseLLMProvider.js
class BaseLLMProvider {
  async chat(messages) {
    throw new Error('Not implemented');          // template slot
  }
  async *chatStream(messages) {
    throw new Error('Not implemented');          // template slot
  }
  getModelName() {
    throw new Error('Not implemented');          // template slot
  }
}
```

### Workflow

```
routes/chat.js
     │
     │  provider.chatStream(messages)   ← calls through base interface
     ▼
BaseLLMProvider.chatStream()            ← dispatched to concrete class
     │
     ▼
OpenAICompatibleProvider.chatStream()   ← real implementation
  (or GeminiProvider / LocalModel …)
```

---

## 2. Strategy Pattern

**Category:** Behavioral
**Files:** `services/llm/` (all provider files)

### How It Works

The LLM provider hierarchy is a textbook Strategy. Each concrete class is an interchangeable algorithm (strategy) for calling a different LLM API. The caller (`routes/chat.js`) holds a reference to a `provider` variable and calls `provider.chatStream()` without caring which vendor is behind it. Swapping the strategy at runtime is done through the Factory (see §3).

### Inheritance Hierarchy

```
BaseLLMProvider
│  (abstract: chat, chatStream, getModelName)
│
├── OpenAICompatibleProvider           [OpenAI-format REST + SSE]
│       │  (adds: _headers(), _readSSEStream(), concrete chat/chatStream)
│       │
│       ├── OpenRouterProvider         [openrouter.ai endpoint]
│       │
│       ├── GroqProvider               [api.groq.com endpoint]
│       │
│       └── GeminiProvider             [Google Gemini endpoint]
│               │  (adds: chatStreamMultimodal for images/PDFs)
│               │
│               └── GemmaProvider      [Gemma model via Gemini]
│                       (adds: _filterThoughts() to strip <thought> blocks)
│
└── LocalModelProvider                 [FastAPI /chat on port 8000]
        (adds: formatLocalResponse() call for Python code output)
```

### Code Snippet

```javascript
// GemmaProvider overrides the chatStream strategy to add thought-filtering
class GemmaProvider extends GeminiProvider {
  async *chatStream(messages) {
    yield* this._filterThoughts(super.chatStream(messages));  // delegate + filter
  }
  async *_filterThoughts(stream) { /* strips <thought>...</thought> blocks */ }
}
```

### Workflow — Runtime Strategy Selection

```
POST /api/chats/stream
        │
        ├── has image/PDF attachment?
        │       YES → force provider = gemini (or gemma)
        │       NO  → use model field from request body
        │
        ▼
  getProvider("openrouter"|"groq"|"local"|"gemini"|"gemma")
        │
        ▼
  provider.chatStream(messagesForLLM)    ← strategy called uniformly
        │
        ├── 429 error?  → swap strategy: openrouter ↔ groq fallback
        │
        ▼
  stream tokens to client via SSE
```

---

## 3. Factory Method Pattern

**Category:** Creational
**File:** `services/llm/index.js`

### How It Works

`getProvider(name)` is a factory function that centralises the creation of LLM provider instances. Callers never call `new OpenRouterProvider()` directly—they ask the factory, which decides which concrete class to instantiate based on a name string (usually from `config.LLM_PROVIDER` or the request body).

This decouples the caller from the concrete classes and makes adding a new provider a single-file change (`switch` case + import).

### Code Snippet

```javascript
// services/llm/index.js
function getProvider(name) {
  switch (name || config.LLM_PROVIDER) {
    case 'openrouter': return new OpenRouterProvider();
    case 'groq':       return new GroqProvider();
    case 'local':      return new LocalModelProvider();
    case 'gemini':     return new GeminiProvider();
    case 'gemma':      return new GemmaProvider();
    default: throw new Error(`Unknown LLM provider: "${name}"`);
  }
}
```

### Workflow

```
config.LLM_PROVIDER  ─────────────────────────────────┐
                                                       │
request body { model: "gemini" } ──────────────────────┤
                                                       ▼
                                              getProvider(name)
                                                       │
                                     ┌─────────────────┼──────────────────┐
                                     ▼                 ▼                  ▼
                              OpenRouterProvider  GeminiProvider  LocalModelProvider
                                     │                 │                  │
                                     └─────────────────┴──────────────────┘
                                                       │
                                            BaseLLMProvider interface
                                          (chat / chatStream / getModelName)
```

---

## 4. Singleton Pattern

**Category:** Creational
**Files:** `db/pool.js`, `config/index.js`

### How It Works

Node.js module caching acts as the Singleton mechanism. The first `require()` call executes the module and caches the exported value. Every subsequent `require()` returns the same cached object without re-running the file. This guarantees exactly one `Pool` instance and one `config` object across the entire application lifetime.

### Database Pool Singleton (`db/pool.js`)

```javascript
// db/pool.js — created ONCE, shared everywhere
const pool = new Pool({
  host: config.DB_HOST,  port: config.DB_PORT,
  user: config.DB_USER,  password: config.DB_PASSWORD,
  database: config.DB_NAME,
});
module.exports = pool;   // same object returned on every require()
```

### Config Singleton (`config/index.js`)

```javascript
// config/index.js — validates env vars and exports a frozen config object
const config = { PORT, DB_HOST, JWT_SECRET, LLM_PROVIDER, … };
module.exports = config;
```

### Workflow

```
Node.js module cache
        │
        │  first require('db/pool')
        ▼
  new Pool(…)  ◄── runs ONCE
  pool object ──────────────────────────────────┐
        │                                        │
  module cache stores pool                       │
        │                                        │
  routes/auth.js  ──► require('../db/pool') ─────┤
  routes/chat.js  ──► require('../db/pool') ─────┤  same object
  services/rag.js ──► require('../db/pool') ─────┤
  db/migrate.js   ──► require('./pool')     ─────┘
```

---

## 5. Facade Pattern

**Category:** Structural
**File:** `services/fileParser.js`

### How It Works

`fileParser.js` provides a **simplified interface** to what would otherwise be branchy, MIME-aware parsing logic scattered across the codebase. Callers only need to pass `(buffer, mimetype)`—the facade internally decides whether to call `pdfParse()`, `buffer.toString()`, or throw an error.

```
Without Facade                           With Facade
──────────────                           ───────────
if pdf  → pdfParse(buf)                  extractText(buf, mime)
if txt  → buf.toString()                 ↓
if code → buf.toString()       ──────►   internally: pdf/txt/code
else    → throw error                    routing is hidden
```

### Code Snippet

```javascript
// services/fileParser.js
async function extractText(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const data = await pdfParse(buffer);
    return data.text.slice(0, MAX_CHARS);             // ← complexity hidden
  }
  if (mimetype.startsWith('text/') || TEXT_MIMETYPES.has(mimetype)) {
    return buffer.toString('utf8').slice(0, MAX_CHARS);
  }
  throw Object.assign(new Error('Unsupported file type'), { status: 400 });
}

async function extractFullText(buffer, mimetype) { /* same but no truncation */ }
```

### Workflow

```
routes/upload.js             routes/chat.js (PDF fallback)
       │                              │
       │  extractText(buf, mime)      │  extractText(buf, 'application/pdf')
       ▼                              ▼
  fileParser.js  ◄─── Facade ───► fileParser.js
       │
       ├── pdf  ──► pdfParse()  ──► text.slice(0, 8000)
       ├── txt  ──► buf.toString()
       └── code ──► buf.toString()
```

---

## 6. Decorator / Middleware Chain Pattern

**Category:** Structural
**Files:** `app.js`, `middleware/auth.js`, `middleware/errorHandler.js`, `middleware/rateLimit.js`

### How It Works

Express's `app.use()` composes middleware as a **chain of decorators**. Each function wraps the request/response pair, adds behaviour, and calls `next()` to pass control to the next decorator. The order is significant: security first, then logging, body parsing, routing, and finally error catching.

This is both a Decorator (each middleware augments `req`/`res`) and a Chain of Responsibility (each middleware decides whether to pass to the next).

### Code Snippet — Global Pipeline

```javascript
// app.js
app.use(helmet());                          // 1. Security headers
app.use(morgan('dev'));                      // 2. HTTP logging
app.use(express.json({ limit: '10mb' }));   // 3. Parse JSON body
app.use(cookieParser());                    // 4. Parse cookies
app.use(cors({ origin: …, credentials: true })); // 5. CORS

app.use('/api',        authRoutes);         // 6. Route handlers
app.use('/api/chats',  chatRoutes);
app.use('/api/upload', uploadRoutes);

app.use(errorHandler);                      // 7. Catch-all error handler
```

### Code Snippet — Per-Route Middleware

```javascript
// routes/chat.js — three decorators stacked on one route
router.post('/stream',
  authMiddleware,    // verify JWT, attach req.userId
  streamLimiter,     // 60 req/min per user
  async (req, res) => { /* handler */ }
);
```

### Middleware Architecture

```
HTTP Request
     │
     ▼
┌─────────────────────────────────────┐
│  1. helmet()      [add sec headers] │
└──────────────────────┬──────────────┘
                       │ next()
┌──────────────────────▼──────────────┐
│  2. morgan()      [log to stdout]   │
└──────────────────────┬──────────────┘
                       │ next()
┌──────────────────────▼──────────────┐
│  3. express.json  [parse body]      │
└──────────────────────┬──────────────┘
                       │ next()
┌──────────────────────▼──────────────┐
│  4. cookieParser  [parse cookies]   │
└──────────────────────┬──────────────┘
                       │ next()
┌──────────────────────▼──────────────┐
│  5. cors()        [CORS headers]    │
└──────────────────────┬──────────────┘
                       │ next()
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
    authRoutes    chatRoutes    uploadRoutes
         │             │
         │    ┌─────────────────┐
         │    │ authMiddleware  │  ← attaches req.userId
         │    │ streamLimiter   │  ← enforces rate limit
         │    │ handler fn      │  ← business logic
         │    └─────────────────┘
         │
         └── (error thrown anywhere)
                       │
┌──────────────────────▼──────────────┐
│  7. errorHandler  [format + send]   │
└─────────────────────────────────────┘
```

---

## 7. Data Access Object (DAO) Pattern

**Category:** Structural
**Files:** `services/rag.js`, `routes/auth.js`, `routes/chat.js`

### How It Works

The DAO pattern encapsulates all database access behind a function interface, so the business logic layer never writes raw SQL. `services/rag.js` is the clearest example: it exposes `storeDocument()` and `searchDocuments()` — callers have no knowledge of the table schema or the FTS query syntax.

The route files also follow an inline DAO style: all SQL is concentrated inside the route handler, never leaking into services or controllers.

### Code Snippet — `rag.js` DAO

```javascript
// services/rag.js — two DAO operations for the `documents` table
async function storeDocument(userId, chatId, filename, content) {
  const result = await pool.query(
    `INSERT INTO documents (user_id, chat_id, filename, content)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, chatId || null, filename, content]
  );
  return result.rows[0].id;
}

async function searchDocuments(userId, query, limit = 4) {
  const result = await pool.query(
    `SELECT filename,
            ts_headline('english', content, plainto_tsquery('english',$1), …) AS snippet
     FROM documents, plainto_tsquery('english', $1) q
     WHERE user_id = $2 AND content_fts @@ q
     ORDER BY ts_rank(content_fts, q) DESC LIMIT $3`,
    [query, userId, limit]
  );
  return result.rows;
}
```

### Database Schema Referenced by DAO

```
documents table
┌────────┬──────────┬────────┬──────────┬─────────┬──────────────────────────┐
│  id    │ user_id  │chat_id │ filename │ content │ content_fts (tsvector)   │
│ serial │ int FK   │int FK? │ text     │ text    │ GENERATED ALWAYS AS …    │
└────────┴──────────┴────────┴──────────┴─────────┴──────────────────────────┘
                                                        ▲
                                                   GIN index
                                              (fast FTS lookup)
```

### Workflow

```
routes/chat.js (POST /stream)
       │
       │  searchDocuments(userId, content, 4)     ← DAO call
       ▼
  rag.js: pool.query(FTS SQL)                     ← hidden SQL
       │
       ▼
  PostgreSQL: ts_rank + plainto_tsquery
       │
       ▼
  [{filename, snippet}, …]                        ← clean result
       │
       ▼
  injected as system message into LLM context
```

---

## 8. Chain of Responsibility Pattern

**Category:** Behavioral
**File:** `routes/chat.js` (lines 61–112)

### How It Works

Before a message reaches the LLM, it passes through an **augmentation pipeline**. Each handler in the chain can enrich `messagesForLLM` with additional context, but only if its condition is met. Handlers are independent and run sequentially; each one may add a `system` message at the front of the array.

```
Step 1 — File text injection   (always, if file attachments present)
Step 2 — RAG injection         (if no attachments AND FTS finds matches)
Step 3 — Web search injection  (if no attachments AND keyword heuristic passes)
```

### Code Snippet

```javascript
// routes/chat.js — three-handler chain

// Handler 1: file text context
if (fileAttachments.length > 0) {
  userContentForLLM = `[File: …]\n${payload}\n\nUser question: ${content}`;
}

// Handler 2: RAG — only fires when no attachments
if (!attachments?.length) {
  const ragChunks = await searchDocuments(req.userId, content, 4);
  if (ragChunks.length > 0) {
    messagesForLLM.unshift({ role: 'system', content: `Relevant context…` });
  }
}

// Handler 3: web search — only fires when no attachments + time-sensitive keyword
if (!attachments?.length && needsWebSearch(content)) {
  const webResults = await searchWeb(content, 5);
  if (webResults.length > 0) {
    messagesForLLM.unshift({ role: 'system', content: `Web results…` });
    webSearchUsed = true;
  }
}
```

### Workflow

```
User message: "What is the weather today?"
        │
        ▼
┌────────────────────────────┐
│ Handler 1: File Injector   │  attachments? ──NO──► pass through unchanged
└────────────────┬───────────┘
                 │ next
                 ▼
┌────────────────────────────┐
│ Handler 2: RAG Injector    │  searchDocuments() ──► prepend system message
└────────────────┬───────────┘   (if results found)
                 │ next
                 ▼
┌────────────────────────────┐
│ Handler 3: Web Injector    │  needsWebSearch("today") = TRUE
└────────────────┬───────────┘  searchWeb() ──► prepend system message
                 │ next
                 ▼
        messagesForLLM
        ┌────────────────────────────────────────┐
        │ system: "Web search results: …"        │  ← Handler 3 injected
        │ system: "Relevant document context…"   │  ← Handler 2 injected
        │ user:   "What is the weather today?"   │
        └────────────────────────────────────────┘
                 │
                 ▼
        LLM Provider.chatStream(messagesForLLM)
```

---

## 9. Observer / Server-Sent Events Pattern

**Category:** Behavioral
**File:** `routes/chat.js` (lines 114–225)

### How It Works

The SSE endpoint implements a publisher/subscriber (Observer) relationship over HTTP. The server is the **Subject** (publisher); the client is the **Observer** (subscriber). The client opens a persistent HTTP connection and the server pushes discrete **events** as they occur. Events are categorised by type so the client can react selectively.

Event types emitted:

| Event | Trigger | Payload |
|-------|---------|---------|
| `info` | Web search started / rate-limit fallback | `{ message: string }` |
| `token` | Each LLM output chunk arrives | `{ content: string }` |
| `done` | LLM finishes, message saved to DB | `{ messageId, model }` |
| `error` | Unrecoverable error during streaming | `{ error: string }` |

### Code Snippet

```javascript
// routes/chat.js — SSE setup + event emission
res.setHeader('Content-Type', 'text/event-stream');
res.setHeader('Cache-Control', 'no-cache');
res.setHeader('X-Accel-Buffering', 'no');
res.flushHeaders();                                  // open persistent connection

// Event: info (optional)
res.write(`event: info\ndata: ${JSON.stringify({ message: '…' })}\n\n`);

// Event: token (per chunk)
for await (const chunk of provider.chatStream(messagesForLLM)) {
  res.write(`event: token\ndata: ${JSON.stringify({ content: chunk })}\n\n`);
}

// Event: done
res.write(`event: done\ndata: ${JSON.stringify({ messageId, model })}\n\n`);

// Event: error (on failure)
res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
```

### Workflow

```
Client (browser)                      Server (routes/chat.js)
     │                                         │
     │  POST /api/chats/stream ────────────────►│
     │                                         │  res.flushHeaders()
     │◄──── HTTP 200 (connection kept open) ───│
     │                                         │
     │                                         │  [optional] LLM provider fallback
     │◄──── event: info ───────────────────────│    { message: "searching web…" }
     │                                         │
     │                                         │  LLM starts streaming
     │◄──── event: token ──────────────────────│    { content: "Hello" }
     │◄──── event: token ──────────────────────│    { content: " world" }
     │◄──── event: token ──────────────────────│    { content: "!" }
     │         …                               │         …
     │                                         │  LLM finishes → save to DB
     │◄──── event: done ───────────────────────│    { messageId: 42, model: "…" }
     │                                         │  res.end()
     │  (connection closed)                    │
```

---

## 10. Adapter Pattern

**Category:** Structural
**File:** `utils/token.js`

### How It Works

`utils/token.js` wraps two incompatible interfaces—`jsonwebtoken` (signed JWTs) and `crypto` (opaque random hex tokens)—and exposes a **uniform token vocabulary** to the rest of the application. The adapter hides vendor-specific APIs so that `routes/auth.js` can call `signAccessToken()` or `hashToken()` without knowing the underlying library calls.

```
Existing interface            Adapter              Target interface
──────────────────            ───────              ────────────────
jwt.sign(payload, secret)  ──►signAccessToken(id) ──► JWT string (15 min)
crypto.randomBytes(64)     ──►signRefreshToken()  ──► hex string
crypto.createHash('sha256')──►hashToken(token)    ──► SHA-256 hex digest
```

### Code Snippet

```javascript
// utils/token.js
function signAccessToken(userId) {
  return jwt.sign({ userId }, config.JWT_SECRET, { expiresIn: '15m' });
}
function signRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

### Workflow

```
routes/auth.js (login)
       │
       ├── signAccessToken(userId)   ──► JWT  ──► httpOnly cookie "token"
       ├── signRefreshToken()        ──► hex  ──► sent to client as cookie
       └── hashToken(refreshToken)   ──► hash ──► stored in refresh_tokens table

routes/auth.js (refresh)
       │
       ├── hashToken(req.cookies.refresh_token)  ──► compare with DB hash
       └── signAccessToken(userId)               ──► new JWT cookie
```

---

## Summary Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                           BACKEND ARCHITECTURE                             │
│                                                                             │
│  ┌─── CREATIONAL ──────────────────────────────────────────────────────┐  │
│  │                                                                      │  │
│  │  Singleton: config ──────────────► all modules                      │  │
│  │  Singleton: pool   ──────────────► routes/*.js, services/rag.js     │  │
│  │                                                                      │  │
│  │  Factory: getProvider(name)                                          │  │
│  │     "openrouter" → new OpenRouterProvider()                         │  │
│  │     "groq"       → new GroqProvider()                               │  │
│  │     "local"      → new LocalModelProvider()                         │  │
│  │     "gemini"     → new GeminiProvider()                             │  │
│  │     "gemma"      → new GemmaProvider()                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── STRUCTURAL ──────────────────────────────────────────────────────┐  │
│  │                                                                      │  │
│  │  Decorator/Chain:  helmet → morgan → json → cookie → cors           │  │
│  │                    → authMiddleware → rateLimiter → handler          │  │
│  │                    → errorHandler                                    │  │
│  │                                                                      │  │
│  │  Facade:           extractText(buf, mime) hides pdf-parse / fs      │  │
│  │                                                                      │  │
│  │  DAO:              storeDocument(), searchDocuments() hide SQL       │  │
│  │                    pool.query(…) always through pool singleton       │  │
│  │                                                                      │  │
│  │  Adapter:          signAccessToken / signRefreshToken / hashToken    │  │
│  │                    wrap jsonwebtoken + crypto APIs                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── BEHAVIORAL ──────────────────────────────────────────────────────┐  │
│  │                                                                      │  │
│  │  Template Method:  BaseLLMProvider defines chat/chatStream slots     │  │
│  │                                                                      │  │
│  │  Strategy:         Provider subclasses = interchangeable algorithms  │  │
│  │    BaseLLMProvider                                                   │  │
│  │      ├─ OpenAICompatibleProvider                                     │  │
│  │      │     ├─ OpenRouterProvider                                     │  │
│  │      │     ├─ GroqProvider                                           │  │
│  │      │     └─ GeminiProvider                                         │  │
│  │      │           └─ GemmaProvider (_filterThoughts decorator)        │  │
│  │      └─ LocalModelProvider                                           │  │
│  │                                                                      │  │
│  │  Chain of Responsibility:  message augmentation pipeline             │  │
│  │    [file inject] → [RAG inject] → [web inject] → LLM                │  │
│  │                                                                      │  │
│  │  Observer/SSE:  server emits events; client subscribes              │  │
│  │    event:info  → event:token (×N) → event:done | event:error        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─── DATABASE LAYER ──────────────────────────────────────────────────┐  │
│  │                                                                      │  │
│  │  Pool Singleton ──► parameterised queries ($1..$N, never concat)    │  │
│  │                                                                      │  │
│  │  Tables:                                                             │  │
│  │    users           ← auth DAO (routes/auth.js)                      │  │
│  │    chats           ← chat DAO (routes/chat.js)                      │  │
│  │    messages        ← chat DAO (routes/chat.js)                      │  │
│  │    documents       ← RAG DAO  (services/rag.js)                     │  │
│  │    refresh_tokens  ← token DAO (routes/auth.js)                     │  │
│  │    schema_migrations ← migrate.js (sequential idempotent runner)    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```
