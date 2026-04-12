[![React](https://img.shields.io/badge/React-19-%2320232a.svg?style=flat-square&logo=react&logoColor=%2361DAFB)]()
[![Node.js](https://img.shields.io/badge/Node.js-%23339933.svg?style=flat-square&logo=node.js&logoColor=white)]()
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-%23336791.svg?style=flat-square&logo=postgresql&logoColor=white)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

# CodeThium AI

A full-stack AI chatbot with hybrid LLM support, file/image uploads, RAG via PostgreSQL full-text search, and a polished Tailwind + Framer Motion UI.

---

## Features

- **Multi-provider LLM** — OpenRouter, Groq, Google Gemini, and a custom-trained local Python code model
- **Token streaming** — Server-Sent Events (SSE) with automatic 429 fallback between OpenRouter and Groq
- **File & image uploads** — Images and PDFs routed to Gemini for native multimodal understanding; text/code files extracted as context
- **RAG** — Uploaded documents stored with PostgreSQL `tsvector` full-text search; relevant excerpts automatically injected as LLM context
- **Auth** — JWT access tokens (15 min) + opaque refresh tokens (7 days, hashed in DB)
- **Light/dark theme** — persisted to localStorage, toggleable from sidebar
- **Chat UX** — auto-title, rename, date grouping, sidebar search

---

## Architecture

```
Browser (React 19 + Tailwind + Framer Motion)
    │  httpOnly cookie (JWT)
    ▼
Express 5 (port 4000)
    ├─ POST /api/chats/stream ──► LLM Provider (SSE)
    │                               ├─ OpenRouter  (google/gemma-3-27b-it:free)
    │                               ├─ Groq        (llama-3.3-70b-versatile)
    │                               ├─ Gemini      (gemini-2.5-flash) — images + PDFs
    │                               └─ Local Model (FastAPI, port 8000)
    ├─ POST /api/upload/*  ──► fileParser.js ──► RAG: documents table
    └─ DB layer (pg Pool) ──► PostgreSQL 16 (port 5433)
```

**Request flow:**
1. User sends message → `POST /api/chats/stream`
2. Express checks RAG: searches `documents` table for relevant chunks via `plainto_tsquery`
3. Relevant snippets prepended as a system message
4. LLM streams response back as SSE tokens
5. Completed response saved to `messages` table

---

## Quick Start (Docker — recommended)

```bash
# 1. Copy env template and fill in your API keys
cp .env.example .env

# 2. Build and start all services
docker-compose up --build

# 3. Open browser
open http://localhost:3000
```

Migrations run automatically on first start.

---

## Local Development

### Backend

```bash
cd codethium-ai-web/server
npm install
npm run dev          # nodemon at http://localhost:4000
```

### Frontend

```bash
cd codethium-ai-web
npm install
npm start            # CRA dev server at http://localhost:3000
```

Create `codethium-ai-web/.env`:
```
REACT_APP_API_URL=http://localhost:4000
```

### Run Tests

```bash
cd codethium-ai-web/server
npm test             # jest --coverage (41 tests, no DB required)
```

---

## Environment Variables

Single `.env` at repo root. See `.env.example` for the full template.

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_HOST` | Yes | Postgres host (`postpres` in Docker, `localhost` locally) |
| `DB_PORT` | Yes | Postgres port (`5433` in Docker, `5432` locally) |
| `DB_USER` | Yes | Postgres user |
| `DB_PASSWORD` | Yes | Postgres password |
| `DB_NAME` | Yes | Database name (`codethium`) |
| `JWT_SECRET` | Yes | Min 32 chars random string |
| `CORS_ORIGIN` | No | Allowed origin (default `http://localhost:3000`; comma-separate for multiple) |
| `LLM_PROVIDER` | No | Default provider: `openrouter`, `groq`, `local`, or `gemini` |
| `OPENROUTER_API_KEY` | No | [openrouter.ai](https://openrouter.ai) API key |
| `OPENROUTER_MODEL` | No | Default: `google/gemma-3-27b-it:free` |
| `GROQ_API_KEY` | No | [groq.com](https://console.groq.com) API key |
| `GROQ_MODEL` | No | Default: `llama-3.3-70b-versatile` |
| `GEMINI_API_KEY` | No | [Google AI Studio](https://aistudio.google.com) API key — required for image/PDF uploads |
| `GEMINI_MODEL` | No | Default: `gemini-2.5-flash` |
| `LOCAL_MODEL_URL` | No | FastAPI endpoint (default `http://local-model:8000`) |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/register` | — | Create account (12+ char password required) |
| POST | `/api/login` | — | Login → sets `token` + `refresh_token` cookies |
| POST | `/api/refresh` | — | Issue new access token from refresh cookie |
| POST | `/api/logout` | Yes | Clear cookies + delete refresh token from DB |
| GET | `/api/me` | Yes | Current user info |
| POST | `/api/change-password` | Yes | Change password (12+ char strength validation) |
| GET | `/api/chats` | Yes | List user's chats |
| POST | `/api/chats` | Yes | Create chat |
| PUT | `/api/chats/:id` | Yes | Update chat title/messages |
| DELETE | `/api/chats/:id` | Yes | Delete chat |
| GET | `/api/chats/:id/messages` | Yes | Fetch message history |
| POST | `/api/chats/stream` | Yes | Stream LLM response (SSE) |
| POST | `/api/upload/image` | Yes | Upload image → base64 data URL |
| POST | `/api/upload/file` | Yes | Upload PDF/text → extracted text (also stored for RAG) |

---

## Database Schema

```sql
users       — id, username, email, password_hash, created_at
chats       — id, user_id, title, message JSONB, created_at, updated_at
messages    — id, chat_id, role, content, metadata JSONB, created_at
documents   — id, user_id, chat_id, filename, content, content_fts (tsvector), created_at
refresh_tokens — id, user_id, token_hash, expires_at, created_at
```

---

## Project Structure

```
AI-Chatbot/
├── codethium-ai-web/
│   ├── server/                    Express backend
│   │   ├── app.js                 Express app (no listen — importable for tests)
│   │   ├── index.js               Entry point: runs migrations + starts server
│   │   ├── config/index.js        Env validation, fail-fast
│   │   ├── db/                    Pool, migrations (001–005)
│   │   ├── middleware/            auth, errorHandler, rateLimit
│   │   ├── routes/                auth, chat, upload
│   │   ├── services/
│   │   │   ├── llm/               OpenRouter, Groq, Gemini, Local providers
│   │   │   ├── rag.js             PostgreSQL FTS document storage + search
│   │   │   └── fileParser.js      PDF + text extraction
│   │   └── __tests__/             Jest + Supertest (41 tests)
│   └── src/                       React 19 frontend
│       ├── context/               AuthContext (+ refresh interceptor), ThemeContext
│       ├── services/              api.js (Axios), streamChat.js (SSE)
│       └── components/chat/       ChatPage, Sidebar, MessageList, ChatInput, ...
├── codethium-model/               FastAPI local model (Python decoder-only transformer)
├── docker-compose.yml
└── .env.example
```

---

## License

MIT
