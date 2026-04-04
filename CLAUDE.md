# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CodeThium is a full-stack AI coding assistant with three independently running services:

- **React frontend** (`codethium-ai-web/`) — port 3000
- **Express backend** (`codethium-ai-web/server/`) — port 4000
- **FastAPI AI model** (`codethium-model/`) — port 8000

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
npm start        # start with nodemon (auto-reload)
```

### AI Model (Python/FastAPI)
```bash
pip install -r requirements.txt
cd codethium-model
python decoder_only_model.py   # FastAPI server at http://localhost:8000
```

## Environment Setup

Create `codethium-ai-web/server/.env`:
```
PORT=4000
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=codethium
JWT_SECRET=your_jwt_secret
```

PostgreSQL must be running with a database named `codethium`. The schema (users and chats tables) is auto-created on first server start via the Express backend.

## Architecture

### Request flow
1. User sends a message in `ChatbotPage.js`
2. For AI replies: axios POSTs directly to FastAPI `POST /chat` (port 8000) — **bypasses Express**
3. For auth/chat persistence: axios calls Express at port 4000 (`/api/*`)

### Authentication
- JWT tokens with 7-day expiry, stored in HttpOnly cookies
- Express middleware validates JWT on protected routes
- The frontend also checks `localStorage` for token state

### AI Model (`codethium-model/`)
- Decoder-only Transformer (4 layers, 4 heads, 256 d_model, 512 max_seq_len)
- `model_components.py` — Transformer architecture, Vocab class, SentencePiece tokenization
- `decoder_only_model.py` — FastAPI wrapper, loads `tiny_transformer.pth` + `fullspm.model` + `vocab.pth` at startup
- `train_model.py` — standalone training script (not needed to run the app)
- Model files (`*.pth`, `fullspm.model`) must exist in `codethium-model/` for the server to start

### Known Gaps
- Social login (Google, Apple, Microsoft) is UI-only — not implemented in backend
- Chat history sidebar is local React state; loading from DB on page refresh is incomplete
- The FastAPI `/chat` endpoint has no authentication — it's open to any caller
