# CodeThium AI Chatbot

A full-stack AI chatbot with hybrid LLM support, multimodal file/image input, RAG (Retrieval-Augmented Generation), and real-time web search.

---

## Features

- **Multiple LLM providers** — Llama 3 via Groq, Llama 3 via OpenRouter, Gemini 2.5 Flash (multimodal), Gemma 4 31B, and a self-hosted local model
- **Multimodal input** — attach images and PDFs; auto-routes to a vision-capable model
- **File upload + RAG** — upload text/code files; content is stored and retrieved via PostgreSQL full-text search to augment answers
- **Real-time web search** — automatically searches the web (via Tavily) when queries contain time-sensitive keywords (weather, news, prices, etc.)
- **Streaming responses** — SSE-based token-by-token streaming with graceful 429 fallback between providers
- **Auth** — register/login with JWT access tokens (15 min) + refresh tokens (7 day httpOnly cookies)
- **Light/dark theme** — toggleable, persisted to localStorage
- **Thought-block filtering** — strips `<thought>…</thought>` reasoning from Gemma responses

---

## Quick Start (Docker)

```bash
# 1. Copy and fill in environment variables
cp .env.example .env
# Edit .env — set DB_PASSWORD, JWT_SECRET, API keys

# 2. Build and start all services
docker compose up --build

# 3. Open the app
open http://localhost:3000
```

To stop: `docker compose down` (keeps DB data) or `docker compose down -v` (wipes DB).

---

## Environment Variables

Create a `.env` file at the repo root (`AI-Chatbot/.env`):

| Variable | Required | Description |
|---|---|---|
| `DB_PASSWORD` | Yes | PostgreSQL password |
| `JWT_SECRET` | Yes | Random string, min 32 chars |
| `OPENROUTER_API_KEY` | For OpenRouter | `sk-or-…` |
| `GROQ_API_KEY` | For Groq | `gsk_…` |
| `GEMINI_API_KEY` | For Gemini/Gemma | Google AI Studio key |
| `GEMINI_MODEL` | No | Default: `gemini-2.5-flash` |
| `GEMMA_MODEL` | No | Default: `gemma-4-31b-it` |
| `TAVILY_API_KEY` | No | Enables real-time web search (`tvly-…`) |
| `LOCAL_MODEL_URL` | No | FastAPI local model URL |

See `.env.example` for all defaults.

---

## Architecture

```
Browser → React (port 3000) → Express API (port 4000) → PostgreSQL (port 5433)
                                      ↓
                          LLM Providers (external APIs)
                          Web Search (Tavily API, optional)
                          Local Model (FastAPI, port 8000)
```

### Request flow

1. User sends a message in `ChatPage`
2. `streamChat.js` POSTs to `POST /api/chats/stream`
3. Server runs RAG search → injects matching document snippets as a system message
4. If query contains time-sensitive keywords and `TAVILY_API_KEY` is set → fetches live web results and prepends them as a system message
5. Streams LLM response back as SSE tokens; saves completed message to DB

### Services

| Service | File | Purpose |
|---|---|---|
| RAG | `server/services/rag.js` | PostgreSQL FTS over user-uploaded documents |
| Web search | `server/services/webSearch.js` | Tavily API — live web results for real-time queries |
| LLM providers | `server/services/llm/` | OpenRouter, Groq, Gemini, Gemma, Local |
| File parser | `server/services/fileParser.js` | PDF + text extraction |

---

## Development

### Backend only
```bash
cd codethium-ai-web/server
npm install
npm run dev   # nodemon on port 4000
```

### Frontend only
```bash
cd codethium-ai-web
npm install
# create codethium-ai-web/.env with: REACT_APP_API_URL=http://localhost:4000
npm start     # CRA dev server on port 3000
```

### Tests
```bash
cd codethium-ai-web/server
npx jest       # 41 tests
```

### Database migrations
Run automatically on server start. To run manually:
```bash
cd codethium-ai-web/server && node db/migrate.js
```
