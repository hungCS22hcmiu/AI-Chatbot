# VIETNAM NATIONAL UNIVERSITY — HOCHIMINH CITY
# INTERNATIONAL UNIVERSITY
## SCHOOL OF COMPUTER SCIENCE AND ENGINEERING
### SOFTWARE ENGINEERING | IT076IU

---

# AI ASSISTANT SYSTEM
## System Design Report

**By Group 11 — Members List**

| No. | Name | Student ID | Role |
|-----|------|------------|------|
| 1 | Lê Hưng | ITCSIU22271 | Leader |
| 2 | Đặng Danh Hương | ITCSIU22053 | Member |
| 3 | Nguyễn Minh Tuấn | ITCSIU22298 | Member |
| 4 | Lê Nhật Anh | ITCSIU22254 | Member |
| 5 | Cao Ngọc Anh Tuấn | ITCSIU21244 | Member |
| 6 | Đỗ Hoàng Minh | ITITWE22142 | Member |

---

## Table of Contents

1. [System Architecture](#i-system-architecture)
2. [Use Case Diagram](#ii-use-case-diagram)
3. [Schema Diagram](#iii-schema-diagram)
4. [Class Diagram](#iv-class-diagram)
5. [Data Flow Diagram](#v-data-flow-diagram)
6. [Activity and Sequence Diagrams](#vi-activity-and-sequence-diagrams)
   - [UC-1: Register Account](#uc-1-register-account)
   - [UC-2: User Login](#uc-2-user-login)
   - [UC-3: Create New Chat Session](#uc-3-create-new-chat-session)
   - [UC-4: Send Message and Stream AI Response](#uc-4-send-message-and-stream-ai-response)
   - [UC-5: Upload and Analyze Images](#uc-5-upload-and-analyze-images)
   - [UC-6: Upload and Query PDF Documents](#uc-6-upload-and-query-pdf-documents)
   - [UC-7: Manage Chat History](#uc-7-manage-chat-history)
   - [UC-8: Select AI Provider and Model](#uc-8-select-ai-provider-and-model)
   - [UC-9: Perform Web Search for Real-time Info](#uc-9-perform-web-search-for-real-time-info)
   - [UC-10: User Logout](#uc-10-user-logout)

---

## I. System Architecture

![System Architecture](img/architecture.png)

CodeThium is a containerised, full-stack AI chatbot with hybrid LLM support. All four services run under Docker Compose and communicate over an internal Docker network.

### Services

| Service | Technology | Port | Responsibility |
|---------|-----------|------|----------------|
| **frontend** | React SPA served by nginx | 3000 | UI layer; communicates with backend via REST and SSE |
| **server** | Node.js / Express API | 4000 | Authentication, chat CRUD, file uploads, RAG retrieval, LLM orchestration, SSE streaming |
| **postpres** | PostgreSQL 16 | 5433 | Persistent storage: users, chats, messages, documents (FTS), refresh tokens |
| **local-model** | FastAPI + ONNX Runtime | 8000 | On-premise Python code generation using a quantised CodeThium model |

### External Dependencies

- **Groq API** — hosted Llama 3 inference; default provider with low latency.
- **OpenRouter API** — hosted Llama 3 via openrouter.ai; automatic 429 fallback target from Groq.
- **Google AI Studio (Gemini / Gemma)** — Gemini 2.5 Flash for multimodal tasks (images + PDFs) and Gemma 4 31B for extended reasoning with `<thought>` block filtering.
- **Tavily Search API** — real-time web search injected as a system message when the query contains time-sensitive keywords. Silently disabled when `TAVILY_API_KEY` is absent.

### Request Flow

1. User authenticates → `POST /api/login` → httpOnly cookies (`token` 15 min, `refresh_token` 7 days).
2. User sends a message → frontend POSTs to `POST /api/chats/stream`.
3. Server middleware verifies JWT; on 401 the client retries after `POST /api/refresh`.
4. Server performs RAG: PostgreSQL FTS query (`plainto_tsquery`) over the user's stored documents.
5. Server optionally performs web search (Tavily) for time-sensitive queries.
6. RAG + web-search snippets are prepended as ephemeral system messages.
7. Request is routed to the selected LLM provider; response streams back as SSE (`event: token`).
8. On stream completion the assistant message is persisted to the `messages` table.

### Authentication & Security

- Passwords hashed with bcrypt (12 rounds); minimum 12 characters enforced via Zod.
- JWTs: 15-minute access token + 7-day refresh token (SHA-256 hashed before DB storage).
- Tokens delivered exclusively as httpOnly cookies (no `localStorage`).
- Rate limiting: 15 req/min on auth routes, 60 req/min on stream, 30 req/min on upload.
- CORS origin restricted to `CORS_ORIGIN` env var.

---

## II. Use Case Diagram

![Use Case Diagram](img/Usecase%20Diagram.png)

The use case diagram illustrates the interactions between the **Customer** (end user) and the system, as well as integrations with two external actors: **LLM Providers** and **Search Service**. The customer can perform all core chatbot operations — authentication, session management, messaging, and file handling. The `Send Message and Stream AI Response` use case is the central interaction, extended by web search, image analysis, and PDF querying capabilities.

---

## III. Schema Diagram

![Schema Diagram](img/Schema.png)

### Data Dictionary

The PostgreSQL database consists of five core tables and one migration-tracking table:

#### `users`
Stores registered accounts.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | int | PK | Auto-incremented primary key |
| `username` | varchar | UNIQUE, NOT NULL | Unique display name |
| `email` | varchar | UNIQUE, NOT NULL | Unique email address |
| `password_hash` | text | NOT NULL | bcrypt-hashed password (12 rounds) |
| `created_at` | timestamptz | DEFAULT now() | Account creation timestamp |

#### `chats`
Each chat session belongs to one user.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | int | PK | Auto-incremented primary key |
| `user_id` | int | FK → users.id | Owning user |
| `title` | varchar | | Human-readable chat title |
| `message` | jsonb | | Legacy JSONB message column (preserved) |
| `created_at` | timestamptz | | Creation timestamp |
| `updated_at` | timestamptz | | Last update timestamp |

#### `messages`
Normalised message rows linked to a chat.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | int | PK | Auto-incremented primary key |
| `chat_id` | int | FK → chats.id | Parent chat session |
| `role` | varchar | | `'user'`, `'assistant'`, or `'system'` |
| `content` | text | | Message text content |
| `metadata` | jsonb | GIN index | Attachment info `{type, name}` |
| `created_at` | timestamptz | | Creation timestamp |

#### `documents`
Full text of uploaded files stored for RAG.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | int | PK | Auto-incremented primary key |
| `user_id` | int | FK → users.id | Uploading user |
| `chat_id` | int | FK → chats.id (nullable) | Associated chat session |
| `filename` | varchar | | Original file name |
| `content` | text | | Full extracted text |
| `content_fts` | tsvector | Generated, GIN index | Full-text search vector for RAG queries |
| `created_at` | timestamptz | | Upload timestamp |

#### `refresh_tokens`
SHA-256-hashed JWT refresh tokens per user.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | int | PK | Auto-incremented primary key |
| `user_id` | int | FK → users.id | Owning user |
| `token_hash` | text | UNIQUE | SHA-256 hash of the refresh token |
| `expires_at` | timestamptz | | Token expiry (7 days from issuance) |
| `created_at` | timestamptz | | Issuance timestamp |

#### `schema_migrations`
Tracks which SQL migration files have been applied.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `filename` | varchar | PK | Migration file name |
| `applied_at` | timestamptz | | Timestamp when migration was run |

### Relationships

- `users` **1 → many** `chats` (a user owns many chat sessions)
- `users` **1 → many** `documents` (a user uploads many documents)
- `users` **1 → many** `refresh_tokens` (a user may have multiple active refresh tokens)
- `chats` **1 → many** `messages` (a chat contains many messages)
- `chats` **1 → many** `documents` (a chat may be associated with many documents)

---

## IV. Class Diagram

![Class Diagram](img/class%20diagram.png)

The class diagram models the backend LLM provider hierarchy. Classes are grouped into four responsibility layers (swimlanes):

### Class Responsibilities

| Swimlane | Class | Description |
|----------|-------|-------------|
| **Base** | `BaseLLMProvider` | Abstract base class — defines the `chat` / `chatStream` / `getModelName` contract that all providers must implement |
| **OpenAI Compatible** | `OpenAICompatibleProvider` | Shared OpenAI-format HTTP fetch and SSE stream parser; inherited by all cloud-hosted providers |
| **Cloud Providers** | `GroqProvider` | Thin wrapper for `api.groq.com` — default provider with low latency |
| | `OpenRouterProvider` | Thin wrapper for `openrouter.ai` — automatic 429 fallback target when Groq is rate-limited |
| | `GeminiProvider` | Extends `OpenAICompatibleProvider` with `chatStreamMultimodal()` for image and PDF payloads via Google AI Studio |
| | `GemmaProvider` | Extends `GeminiProvider`; filters `<thought>` reasoning blocks from Gemma 4 31B output via `_filterThoughts()` |
| **Local** | `LocalModelProvider` | Hybrid pipeline: Groq classifies the intent → ONNX Runtime model generates Python code → Groq verifies the output |

### Inheritance Hierarchy

- `BaseLLMProvider` ← `OpenAICompatibleProvider` ← `GroqProvider`
- `BaseLLMProvider` ← `OpenAICompatibleProvider` ← `OpenRouterProvider`
- `BaseLLMProvider` ← `OpenAICompatibleProvider` ← `GeminiProvider` ← `GemmaProvider`
- `BaseLLMProvider` ← `LocalModelProvider`

---

## V. Data Flow Diagram

### Level 0 — Context Diagram

![DFD Level 0](img/DFD-L0.png)

The Level 0 context diagram treats the entire CodeThium system as a single process. It identifies all external entities that exchange data with the system:

- **User** — sends credentials, messages, and files; receives authentication tokens and streamed AI responses.
- **Groq API / OpenRouter API** — receive chat messages and return LLM response streams.
- **Google AI Studio** — receives chat messages with optional image/PDF payloads and returns multimodal response streams.
- **Tavily Search API** — receives search queries and returns live web results.
- **Local Model (FastAPI)** — receives code-generation prompts and returns generated Python code.

### Level 1 — Process Decomposition

![DFD Level 1](img/DFD-L1.png)

The Level 1 diagram decomposes the system into five core processes and four data stores:

| Process | Inputs | Outputs | Data Stores Touched |
|---------|--------|---------|---------------------|
| **P1 Authentication** | credentials (register / login / refresh / logout) | JWT cookies, user profile | D1 Users & Refresh Tokens |
| **P2 Chat Management** | user message, model choice, attachments | chat list, message history; triggers P4 + P5 | D2 Chats & Messages |
| **P3 File Upload & Parsing** | raw file (image / PDF / text) | base64 URL or inline text to P2; full text to D3 | D3 Documents |
| **P4 RAG Retrieval & Web Search** | user query, userId | context snippets injected as system messages into P5 | D3 Documents (read) |
| **P5 LLM Orchestration & SSE Streaming** | message history + context + model | SSE token stream to user; completed message saved | D2 Messages (write) |

| Data Store | Tables | Purpose |
|------------|--------|---------|
| **D1** | `users`, `refresh_tokens` | Account credentials and hashed JWT refresh tokens |
| **D2** | `chats`, `messages` | All chat sessions and their normalised message rows |
| **D3** | `documents` | Full extracted text of uploaded files with FTS index for RAG |

---

## VI. Activity and Sequence Diagrams

---

### UC-1: Register Account

Users can create a new account by providing a username, email, and a secure password.

**Activity Diagram**

![UC-1 Activity Diagram](Use-case/UC-1/Ac-UC1.png)

**Sequence Diagram**

![UC-1 Sequence Diagram](Use-case/UC-1/Se-UC1.png)

---

### UC-2: User Login

Existing users can authenticate themselves using their credentials to access their private chat history and settings.

**Activity Diagram**

![UC-2 Activity Diagram](Use-case/UC-2/Ac-UC2.png)

**Sequence Diagram**

![UC-2 Sequence Diagram](Use-case/UC-2/Se-UC2.png)

---

### UC-3: Create New Chat Session

Users can start a fresh conversation thread, which is saved and organized separately from other sessions.

**Activity Diagram**

![UC-3 Activity Diagram](Use-case/UC-3/Ac-UC3.png)

**Sequence Diagram**

![UC-3 Sequence Diagram](Use-case/UC-3/Se-UC3.png)

---

### UC-4: Send Message and Stream AI Response

Users can send text prompts to the AI and receive responses in real-time through a streaming interface.

**Activity Diagram**

![UC-4 Activity Diagram](Use-case/UC-4/Ac-UC4.png)

**Sequence Diagram**

![UC-4 Sequence Diagram](Use-case/UC-4/Se-UC4.png)

---

### UC-5: Upload and Analyze Images

Users can upload image files for the AI to process, allowing for visual question answering and image description.

**Activity Diagram**

![UC-5 Activity Diagram](Use-case/UC-5/Ac-UC5.png)

**Sequence Diagram**

![UC-5 Sequence Diagram](Use-case/UC-5/Se-UC5.png)

---

### UC-6: Upload and Query PDF Documents

Users can upload PDF files which are parsed and used as context for the AI to answer specific document-related questions.

**Activity Diagram**

![UC-6 Activity Diagram](Use-case/UC-6/Ac-UC6.png)

**Sequence Diagram**

![UC-6 Sequence Diagram](Use-case/UC-6/Se-UC6.png)

---

### UC-7: Manage Chat History

Users can organize their workspace by renaming chat sessions for clarity or deleting old conversations.

**Activity Diagram**

![UC-7 Activity Diagram](Use-case/UC-7/Ac-UC7.png)

**Sequence Diagram**

![UC-7 Sequence Diagram](Use-case/UC-7/Se-UC7.png)

---

### UC-8: Select AI Provider and Model

Users can choose between different AI backends (e.g., Gemini, Groq, local models) based on their specific needs for speed or capability.

**Activity Diagram**

![UC-8 Activity Diagram](Use-case/UC-8/Ac-UC8.png)

**Sequence Diagram**

![UC-8 Sequence Diagram](Use-case/UC-8/Se-UC8.png)

---

### UC-9: Perform Web Search for Real-time Info

The system can automatically search the internet to provide the AI with up-to-date information for time-sensitive queries.

**Activity Diagram**

![UC-9 Activity Diagram](Use-case/UC-9/Ac-UC9.png)

**Sequence Diagram**

![UC-9 Sequence Diagram](Use-case/UC-9/Se-UC9.png)

---

### UC-10: User Logout

Users can securely end their session, clearing authentication tokens and protecting their account from unauthorized access.

**Activity Diagram**

![UC-10 Activity Diagram](Use-case/UC-10/Ac-UC10.png)

**Sequence Diagram**

![UC-10 Sequence Diagram](Use-case/UC-10/Se-UC10.png)
