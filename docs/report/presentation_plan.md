# CodeThium — Presentation Plan
**Course:** Software Engineering | IT076IU — Group 11
**Total time:** ~18 minutes | 16 slides

---

## Timing Overview

| Part | Slides | Time |
|------|--------|------|
| 1. Introduction | 1–2 | ~2.5 min |
| 2. Requirements | 3–7 | ~5.5 min |
| 3. System Design | 8–14 | ~8 min |
| 4. Demo & Closing | 15–16 | ~3.75 min |

---

## Speaker Assignments

| Member | Name | Slides |
|--------|------|--------|
| 1 | Lê Hưng | 9, 10, 11, 15, 16 |
| 2 | Đặng Danh Hương | 12, 13, 14 |
| 3 | Nguyễn Minh Tuấn | 7, 8 |
| 4 | Lê Nhật Anh | 5, 6 |
| 5 | Cao Ngọc Anh Tuấn | 3, 4 |
| 6 | Đỗ Hoàng Minh | 1, 2 |

---

## PART 1 — INTRODUCTION (~2.5 min)

---

### Slide 1 — Introduction
**Speaker:** Member 6 — Đỗ Hoàng Minh
**Visual:** Project name "CodeThium", tagline, group member table (name + ID + role), highlighted feature icons in a 2×3 grid.
**Time:** ~1.5 min

**Script:**
> "Good [morning/afternoon], everyone. We are Group 11, and today we present CodeThium — a full-stack AI chatbot system built for Software Engineering IT076IU.
>
> Our team has six members: Lê Hưng is our project leader. Our members are Đặng Danh Hương, Nguyễn Minh Tuấn, Lê Nhật Anh, Cao Ngọc Anh Tuấn, and I am Đỗ Hoàng Minh.
>
> CodeThium is a multi-provider AI assistant that brings together six capabilities in one platform: real-time streaming chat, support for five AI backends, file and image upload with analysis, retrieval-augmented generation from your own documents, live web search for time-sensitive queries, and an on-premise Python code generation model that runs entirely inside Docker. Over the next 18 minutes we will walk through the requirements, system design, and a live demo."

---

### Slide 2 — System Overview & Technology Stack
**Speaker:** Member 6 — Đỗ Hoàng Minh
**Visual:** Left column — 4 Docker service boxes (frontend, server, postpres, local-model) with ports. Right column — tech badge grid (React, Tailwind, Framer Motion, Node.js, Express, PostgreSQL, FastAPI, Docker, Groq, OpenRouter, Gemini, Gemma).
**Time:** ~1 min

**Script:**
> "CodeThium is composed of four services running under Docker Compose. The React frontend is served by nginx on port 3000. The Express backend runs on port 4000 — it is the system's brain, handling authentication, chat, file processing, LLM orchestration, and SSE streaming. PostgreSQL runs on port 5433, storing all user data and providing the full-text search index powering our RAG pipeline. And the local model is a FastAPI service on port 8000 that serves an ONNX Runtime model for Python code generation.
>
> On the frontend we use React, Tailwind CSS, and Framer Motion for a smooth animated UI with dark and light theme support. The backend uses Node.js and Express. The database is PostgreSQL 16. The AI integrations cover Groq, OpenRouter, Google Gemini, Gemma 4, and our own local model."

---

## PART 2 — REQUIREMENTS (~5.5 min)

---

### Slide 3 — Use Case Diagram
**Speaker:** Member 5 — Cao Ngọc Anh Tuấn
**Visual:** Use Case Diagram image (`img/Usecase Diagram.png`).
**Time:** ~1 min

**Script:**
> "This is the use case diagram for CodeThium. We have one primary actor — the Customer, the end user who interacts through the browser — and two external system actors: the LLM Providers, which are the cloud AI services, and the Search Service, which is the Tavily real-time web search API.
>
> The Customer can perform ten use cases. Authentication is at the boundary — register, login, and logout guard access to everything else. Inside the system, the Customer manages chat sessions, sends messages and receives streamed AI responses, uploads files and images, chooses the AI backend, and the system automatically performs web search on their behalf for time-sensitive queries. All ten use cases together define the complete scope of what CodeThium does."

---

### Slide 4 — Functional Requirements: 10 Use Cases
**Speaker:** Member 5 — Cao Ngọc Anh Tuấn
**Visual:** Two-column card layout — UC-1 through UC-10 with one-line descriptions each.
**Time:** ~1.5 min

**Script:**
> "Let me walk through the ten functional requirements. They fall into three groups.
>
> Authentication — UC-1 Register Account, UC-2 User Login, UC-10 Logout. These form the security perimeter: every user's chats and documents are strictly private.
>
> Core chat management — UC-3 Create New Chat Session, UC-4 Send Message and Stream AI Response, and UC-7 Manage Chat History for renaming and deleting sessions. UC-4 is the most important use case in the entire system — it is the central flow that all other advanced capabilities either extend or depend upon.
>
> Advanced capabilities — UC-5 Upload and Analyze Images, UC-6 Upload and Query PDF Documents, UC-8 Select AI Provider and Model, and UC-9 Perform Web Search for Real-time Info. These are what differentiate CodeThium from a plain chat interface. Together, these ten use cases cover the full user lifecycle from registration to a grounded, document-aware AI conversation."

---

### Slide 5 — Activity Diagram: UC-4
**Speaker:** Member 4 — Lê Nhật Anh
**Visual:** Activity diagram image (`Use-case/UC-4/Ac-UC4.png`) — swimlanes for User, Frontend, Database, Server, LLM Provider.
**Time:** ~1 min

**Script:**
> "This activity diagram shows the complete flow for UC-4 — Send Message and Stream AI Response — across five swimlanes: User, Frontend, Database, Server, and LLM Provider.
>
> The user types a message and presses Send. The frontend POSTs to the stream endpoint and the database immediately saves the user message. The server then runs auth verification and calls searchDocuments — the RAG retrieval against the documents store. If snippets are found, they are prepended as a system message. The server checks for time-sensitive keywords and optionally calls searchWeb for live results. It then calls getProvider and chatStream to begin the LLM request. The LLM streams back token chunks, the server forwards them as SSE events, and the frontend renders each token live. When the stream ends, the server inserts the completed assistant message and emits a done event. The user sees the full response."

---

### Slide 6 — Sequence Diagram: UC-4
**Speaker:** Member 4 — Lê Nhật Anh
**Visual:** Sequence diagram image (`Use-case/UC-4/Se-UC4.png`) — six lifelines: User, Frontend, Server, RAGService, LLMProvider, DB.
**Time:** ~1 min

**Script:**
> "The sequence diagram shows the same flow from a message-passing perspective across six lifelines: User, Frontend, Server, RAGService, LLMProvider, and DB.
>
> The user triggers the Frontend which POSTs to the Server. The Server immediately saves the user message to the DB, then calls RAGService with the userId and message. RAGService runs a plainto_tsquery FTS query against the DB and returns matching snippets. The Server prepends these as a context system message, then calls chatStream on the LLMProvider. The sequence enters a loop — the LLMProvider streams token chunks back to the Server, which forwards each as an SSE event:token to the Frontend. The Frontend renders each token live. When the stream ends, the Server inserts the assistant message into the DB, receives the messageId back, and sends an event:done to the Frontend. The user sees the final response."

---

### Slide 7 — Non-Functional Requirements
**Speaker:** Member 3 — Nguyễn Minh Tuấn
**Visual:** 4-quadrant layout with icons — Security, Performance, Scalability, Usability.
**Time:** ~1 min

**Script:**
> "Our non-functional requirements cover four areas.
>
> Security: passwords are bcrypt-hashed with 12 rounds. The minimum password length is 12 characters, enforced at the API layer by Zod validation. JWT access tokens expire after 15 minutes, paired with a 7-day httpOnly refresh token for seamless re-authentication — tokens are never stored in localStorage. Rate limiting is enforced: 15 requests per minute on auth routes, 60 on streaming, 30 on upload.
>
> Performance: Server-Sent Events streaming means the user sees the first token within milliseconds — not waiting for the full response.
>
> Scalability: four isolated Docker services that communicate over an internal Docker network and can each be scaled or replaced independently.
>
> Usability: responsive dark and light themed UI, smooth animations, one-click model switching, and a session-expired modal that handles token expiry gracefully without losing the user's context."

---

## PART 3 — SYSTEM DESIGN (~8 min)

---

### Slide 8 — System Architecture Overview
**Speaker:** Member 3 — Nguyễn Minh Tuấn
**Visual:** Architecture diagram (`img/architecture.png`) — Docker Compose services on the left, external cloud APIs on the right.
**Time:** ~1.5 min

**Script:**
> "Here is the system architecture. Four services run inside Docker Compose and communicate over an internal Docker network. The React frontend talks only to the Express backend via REST and SSE — it never contacts any LLM directly. The backend is the single orchestrator: it validates JWT tokens, manages chat CRUD, runs RAG, calls web search, selects the LLM provider, and manages the SSE stream.
>
> Outside Docker, four external APIs integrate with the backend. Groq API provides hosted Llama 3 inference and is the default provider for its low latency. OpenRouter is a fallback — when Groq returns a 429 rate limit error, the backend automatically retries on OpenRouter. Google AI Studio serves two models: Gemini 2.5 Flash for multimodal tasks involving images and PDFs, and Gemma 4 31B for extended reasoning. The Tavily Search API provides live web results and is silently disabled when the API key is absent.
>
> This design means the frontend is stateless and simple. All intelligence — routing, context injection, fallback — lives in the backend layer."

---

### Slide 9 — Request Flow: The Chat Pipeline
**Speaker:** Member 1 — Lê Hưng
**Visual:** Numbered step-by-step flow diagram — arrows from User through Frontend → Server → RAG → Web Search → LLM → back to User.
**Time:** ~1.5 min

**Script:**
> "This is the complete request flow when a user sends a message. Step one: the user submits a message — the frontend POSTs to POST /api/chats/stream with the message, model choice, and any attachments. Step two: the auth middleware verifies the JWT from the httpOnly cookie; if expired, the client silently calls the refresh endpoint and retries. Step three: the server saves the user message to the messages table and loads the last 20 messages as LLM conversation history. Step four: if there are no attachments and the message is not small-talk, the RAG pipeline runs — a plainto_tsquery full-text search returns up to four relevant document snippets. Step five: if the query contains time-sensitive keywords and a Tavily key is configured, a live web search runs. Step six: RAG snippets and web results are prepended as ephemeral system messages — they are never persisted to the database. Step seven: the enriched history goes to the selected LLM provider and the response streams back as SSE event:token events. Step eight: on stream completion, the full assistant message is saved and event:done is sent."

---

### Slide 10 — Data Flow Diagram — Level 0
**Speaker:** Member 1 — Lê Hưng
**Visual:** DFD Level 0 image (`img/DFD-L0.png`) — CodeThium as single process, all external entities around it.
**Time:** ~0.75 min

**Script:**
> "The Level 0 context diagram treats the entire CodeThium system as a single black box. It shows every external entity that sends data to or receives data from the system. The User sends credentials, messages, and files; the system returns auth tokens and streamed AI responses. Groq and OpenRouter receive chat messages and return LLM response streams. Google AI Studio receives chat messages with optional image or PDF payloads. Tavily receives search queries and returns live results. The Local Model receives prompts and returns generated Python code. This diagram confirms the full boundary of the system."

---

### Slide 11 — Data Flow Diagram — Level 1
**Speaker:** Member 1 — Lê Hưng
**Visual:** DFD Level 1 image (`img/DFD-L1.png`) — five processes P1–P5 and three data stores D1–D3.
**Time:** ~0.75 min

**Script:**
> "The Level 1 diagram decomposes the system into five processes. P1 Authentication reads and writes the users and refresh tokens in data store D1 and returns JWT cookies. P2 Chat Management handles all CRUD for chats and messages in D2 and coordinates P4 and P5. P3 File Upload and Parsing extracts text from uploaded files, stores the full content in D3 the documents store, and returns inline context or a base64 URL to P2. P4 RAG Retrieval and Web Search reads from D3 and injects context snippets into P5. P5 LLM Orchestration and SSE Streaming calls the LLM providers, streams the response back to the user, and writes the completed message back to D2. This decomposition shows that no process has a circular dependency — data flows cleanly in one direction."

---

### Slide 12 — Class Diagram
**Speaker:** Member 2 — Đặng Danh Hương
**Visual:** Class diagram image (`img/class diagram.png`) — six provider classes in inheritance hierarchy with swimlane namespaces.
**Time:** ~1.25 min

**Script:**
> "The class diagram models the LLM provider hierarchy. We defined an abstract BaseLLMProvider with three methods: chat, chatStream, and getModelName. This contract must be implemented by every provider.
>
> Cloud providers share an intermediate OpenAICompatibleProvider class — it handles the OpenAI-format HTTP request and the SSE stream parser. This works because Groq, OpenRouter, and Gemini all expose an OpenAI-compatible API. GroqProvider and OpenRouterProvider are thin wrappers — their only job is to supply the correct base URL, API key, and model name. This design gives us the Groq-to-OpenRouter 429 fallback almost for free.
>
> GeminiProvider extends the shared class and adds chatStreamMultimodal for image and PDF payloads. GemmaProvider extends GeminiProvider and adds a private _filterThoughts method that strips the reasoning blocks Gemma 4 31B emits before sending output to the client.
>
> LocalModelProvider is the outlier — it extends BaseLLMProvider directly and calls our internal FastAPI endpoint rather than any cloud API.
>
> The key benefit: adding a new LLM provider in the future requires only a minimal subclass — the streaming infrastructure is inherited."

---

### Slide 13 — Schema Diagram
**Speaker:** Member 2 — Đặng Danh Hương
**Visual:** Schema diagram image (`img/Schema.png`) — five tables with relationships.
**Time:** ~0.75 min

**Script:**
> "The PostgreSQL schema has five core tables. users stores accounts — username and email are unique, password is bcrypt-hashed. chats groups sessions per user. messages stores normalised per-message rows with a role column for user, assistant, or system, and a JSONB metadata column that holds only the file type and name of any attachment — the actual binary payload is never written to the database. The documents table is the RAG backbone: it stores full extracted text with a tsvector generated column and a GIN index for fast full-text search. refresh_tokens stores SHA-256-hashed refresh tokens with a 7-day expiry, one record per active session per user. All tables share a users parent through foreign keys — user data is fully isolated."

---

### Slide 14 — RAG Pipeline
**Speaker:** Member 2 — Đặng Danh Hương
**Visual:** RAG flowchart — two lanes: Upload path (top) and Query path (bottom), connecting at the documents table.
**Time:** ~1.5 min

**Script:**
> "The RAG pipeline has two halves — ingestion at upload time and retrieval at query time.
>
> At upload time: the user uploads a file to POST /api/upload/file. The file parser runs two extractions in parallel. extractText produces a truncated 8-kilobyte version — this is returned to the client as inline context for the current message. extractFullText produces the complete untruncated text — this is passed to storeDocument which writes it to the documents table. PostgreSQL automatically builds a tsvector GIN index on the content, so no separate indexing step is needed. For PDFs, the full text goes into the documents table AND the raw bytes are also encoded as a base64 URL for Gemini's native PDF understanding. Images are not indexed — they go directly to Gemini at inference time.
>
> At query time: when the user sends a message, the system first checks isConversational — short greetings and acknowledgements skip RAG entirely. If the query has real intent, normalizeQuery strips filler phrases like 'can you help me understand' to expose core keywords. The FTS query runs using plainto_tsquery scoped to the current user's documents. ts_rank orders results and ts_headline generates readable snippets. Up to four snippets are returned. If the normalised query returns nothing, the system retries with the raw original query. Results are de-duplicated, then prepended as an ephemeral system message — the LLM gets grounded context without the user needing to re-upload or re-reference any document."

---

## PART 4 — DEMO & CLOSING (~3.75 min)

---

### Slide 15 — Live Demo
**Speaker:** Member 1 — Lê Hưng
**Visual:** Screenshot of the CodeThium UI — dark theme, sidebar visible, chat open.
**Time:** ~3 min (live)

**Script:**
> "Now let's see CodeThium in action."

**Demo steps:**

1. **Login** *(~20 sec)*
   > "I'll log in with an existing account. Authentication uses httpOnly cookies — no tokens are ever stored in localStorage."

2. **Text message + streaming** *(~25 sec)*
   > "I'll send a question to the Groq provider. Watch the response stream token-by-token — each token is a separate SSE event. The model selector lets me switch providers in one click."

3. **PDF upload + RAG query** *(~40 sec)*
   > "I'll upload a PDF. The full text is stored in the documents table for RAG. I'll ask a specific question about its content. The system runs a full-text search, injects the matching passage as context, and the AI answers precisely from the document — without me quoting it."

4. **Image upload** *(~25 sec)*
   > "Now an image. The system auto-routes this to Gemini's multimodal API. I'll ask it to describe what it sees."

5. **Web search** *(~20 sec)*
   > "A time-sensitive query — 'What is the latest AI news today?' — triggers the Tavily web search. You can see the info banner confirming live data was fetched."

6. **Local model** *(~20 sec)*
   > "Finally, I switch to CodeThium Local and ask for a Python function. This runs entirely in Docker via ONNX Runtime — zero external API calls."

---

### Slide 16 — Conclusion
**Speaker:** Member 1 — Lê Hưng
**Visual:** 5 key takeaways on the left. "Thank you — Questions?" on the right with all member names.
**Time:** ~0.75 min

**Script:**
> "To conclude: CodeThium delivers five things we are proud of. Hybrid LLM orchestration with automatic rate-limit fallback across five providers. Privacy by design — sensitive code stays on-premise and binary payloads never touch the database. Production-grade security through bcrypt, JWT rotation, rate limiting, and CORS restriction. Retrieval-augmented generation with PostgreSQL full-text search so the AI always has your document context. And live web search so answers stay current beyond any model's training cutoff. The system is designed to be extensible — adding a new LLM provider requires one subclass, and the RAG pipeline accepts any text, PDF, or code file. Thank you. We are happy to take questions."

---

## Potential Q&A Questions

---

**Q1: Why did you choose PostgreSQL for full-text search instead of a dedicated vector database like Pinecone or Weaviate?**

> PostgreSQL's built-in `tsvector` and GIN indexing give us keyword-based full-text search with zero extra infrastructure — no additional service to deploy, configure, or pay for. Since our documents are user-uploaded text files with well-defined keywords rather than semantic embeddings, `plainto_tsquery` is accurate enough for this use case. Adding a vector database would introduce embedding API costs, an extra Docker service, and synchronisation complexity. If we were to scale to semantic similarity search across millions of documents, a vector database would be the natural next step.

---

**Q2: Why use Server-Sent Events (SSE) instead of WebSockets for streaming?**

> SSE is a better fit here because streaming is strictly one-directional: the server pushes tokens to the client, the client never needs to push data back during the stream. SSE works over a standard HTTP/1.1 connection, requires no handshake upgrade, and is handled natively by `fetch` with `response.body.getReader()`. WebSockets are better suited to bidirectional real-time communication such as collaborative editing or multiplayer games. Using SSE keeps the backend simpler — the Express route is just a regular POST handler that sets `Content-Type: text/event-stream`.

---

**Q3: How does your system handle security for uploaded files? Could a user upload a malicious file?**

> Three layers of protection are in place. First, multer enforces a 5MB file size cap and stores files in memory — they are never written to disk as executable files. Second, the file parser only extracts text from known safe MIME types such as PDF, plain text, and common code files — any other type returns a 415 error without processing. Third, extracted text is stored as a plain text string in the database and only ever rendered as markdown, never executed. Base64 payloads sent to Gemini are handled by Google's API which runs its own content safety checks.

---

**Q4: What happens if the user's JWT expires while they are in the middle of a streaming response?**

> The stream endpoint verifies the JWT at the start of the request, before the SSE connection is opened. If the token is valid at that point, the stream runs to completion — there is no mid-stream re-verification. On the frontend, if a 401 is returned before the stream opens, the client automatically calls POST /api/refresh with the httpOnly refresh token cookie, and retries the original request transparently. If the refresh token is also expired or revoked, the `forceLogout()` function is called which shows a session-expired modal — the user is prompted to log in again without losing their chat history.

---

**Q5: How is the local model different from the cloud providers? Why run a model locally at all?**

> The local model is a quantised ONNX Runtime model specialised for Python code generation — it is not a general-purpose chat model. Its purpose is to handle code generation requests without sending potentially sensitive source code or logic to an external API. The `LocalModelProvider` uses a hybrid pipeline: Groq classifies the user's intent, the ONNX model generates the Python code, and Groq then verifies the output. We converted it from PyTorch to ONNX, which reduced the Docker image from 995 megabytes to 408 megabytes. The trade-off is that it is limited to Python code generation and is slower than cloud providers, but it provides a privacy guarantee for on-premise use cases.

---

**Q6: How do you ensure that one user cannot access another user's documents or chat history?**

> Every database query is scoped to the authenticated user's ID, which is extracted from the verified JWT by the auth middleware and attached to `req.userId`. The chat ownership check `WHERE id = $1 AND user_id = $2` is applied to every chat operation. The RAG FTS query includes `WHERE user_id = $2`, so documents are never mixed across users. There is no endpoint that lists all users' data — each query is parameterised with the caller's userId. If a user passes a chatId that belongs to another user, the server returns a 404, leaking no information about whether that chat exists.

---

**Q7: What were the biggest technical challenges you faced during development?**

> Three stand out. First, the PDF dual-path handling — we needed to send the native PDF bytes to Gemini for layout-aware understanding while also extracting plain text for the RAG index, and these two operations had to run concurrently without blocking the upload response. Second, the RAG query normalisation — naive keyword extraction produced poor results for conversational queries, so we built a filler-phrase stripping layer with a raw-query fallback to handle over-stripped edge cases. Third, the Gemini rate-limit fallback for PDF-only requests — unlike images, PDFs can fall back to a text provider by extracting the text client-side, so we implemented a separate fallback path that re-extracts text from the base64 payload and retries with the text-only provider rather than showing an error.
