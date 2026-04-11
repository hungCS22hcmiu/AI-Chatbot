# Refactor Plan — Gemini Multimodal + Frontend UI Overhaul

## Context

Phase 5 shipped image/file upload wired to OpenRouter's Llama 3.2 Vision, but the actual OpenRouter and Groq models the user runs day-to-day (`google/gemma-3-27b-it:free`, `llama-3.3-70b-versatile`) are text-only, so attachments are effectively broken. Google Gemini (via its OpenAI-compatible endpoint) natively ingests images **and** PDFs, so adding it as a first-class provider fixes multimodal with minimal disruption to the existing provider abstraction.

Separately, the current UI is a mix of inline styles and a legacy 663-line `ChatbotPage.css` with a flat cyan-on-black theme. The user wants a more colorful, dynamic, attractive experience once multimodal is verified working.

This plan covers both refactors as **Phase 7 (Gemini Multimodal)** and **Phase 8 (Frontend UI Overhaul)**. The previous Phase 7 (Production Hardening) is renumbered to **Phase 9**.

---

## Phase 7 — Gemini Multimodal Provider

### Goal
Replace the broken vision path with Google Gemini as the default multimodal provider. Keep OpenRouter/Groq for text chat, remove the Llama 3.2 Vision branch.

### Why Gemini
- OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`) → fits existing `OpenAICompatibleProvider` pattern with zero new HTTP machinery.
- Free tier exists (`gemini-2.0-flash-exp` or `gemini-1.5-flash`) with image + PDF + text support.
- Native PDF ingestion means we can send real PDF bytes (data URL) instead of `pdf-parse`'d text, preserving layout and tables for better answers.

### Backend Changes

| File | Change |
|------|--------|
| `codethium-ai-web/server/services/llm/GeminiProvider.js` **(new)** | Extends `OpenAICompatibleProvider`. `baseURL = https://generativelanguage.googleapis.com/v1beta/openai`, `apiKey = config.GEMINI_API_KEY`, `model = config.GEMINI_MODEL` (default `gemini-2.0-flash-exp`). Implements `chatStreamMultimodal(history, attachments, userText)` — builds a `content` array with `{type:'text'}` + `{type:'image_url', image_url:{url: dataUrl}}` parts (Gemini accepts base64 data URLs for both images and PDFs via OpenAI-compat schema). |
| `codethium-ai-web/server/services/llm/index.js` | Add `case 'gemini': return new GeminiProvider();` to factory. |
| `codethium-ai-web/server/config/index.js` | Add `GEMINI_API_KEY`, `GEMINI_MODEL` (default `gemini-2.0-flash-exp`). Mark `GEMINI_API_KEY` required only if `LLM_PROVIDER==='gemini'` or attachments enabled — keep fail-fast behavior consistent with existing OpenRouter/Groq pattern. |
| `codethium-ai-web/server/routes/chat.js` | 1) Zod schema (~line 20): expand `model` enum to `['openrouter','groq','local','gemini']`. 2) Vision branch (~line 85): route any request with image attachments to Gemini automatically (override `requested` to `'gemini'`), instead of requiring `requested==='openrouter'`. 3) For PDF attachments, prefer sending the raw data URL to Gemini instead of `fileParser` extraction; keep `fileParser` fallback for `.txt`/code files and for non-Gemini providers. |
| `codethium-ai-web/server/routes/upload.js` | `POST /api/upload/file` — when mimetype is `application/pdf`, return `{type:'pdf', payload: <dataUrl>, name}` (new branch) in addition to the existing extracted-text branch. Keep text extraction for code/txt. |
| `codethium-ai-web/server/services/llm/OpenRouterProvider.js` | Delete `chatStreamMultimodal()` and `VISION_MODEL` constant — dead code once Gemini owns vision. |
| `.env.example` + `CLAUDE.md` env block | Add `GEMINI_API_KEY=` and `GEMINI_MODEL=gemini-2.0-flash-exp`. |

### Frontend Changes

| File | Change |
|------|--------|
| `codethium-ai-web/src/components/chat/ChatInput.js` | `MODELS` array: add `{value:'gemini', label:'Gemini 2.0 Flash (multimodal)'}`. Auto-switch selected model to `'gemini'` when user attaches an image or PDF (and visually lock the selector while attachments are present, with a hint tooltip). |
| `codethium-ai-web/src/components/chat/FileUploadButton.js` | Ensure file input `accept` includes `application/pdf` alongside text/code types. |

### Verification
1. Set `GEMINI_API_KEY` in `.env`, `docker-compose up --build`.
2. Text-only chat with `gemini` selected → streams tokens.
3. Upload a PNG + prompt "describe this image" → model selector flips to Gemini, response describes the image.
4. Upload a multi-page PDF + prompt "summarize page 2" → Gemini receives raw PDF, answers with page-specific content (proves native PDF, not text extraction).
5. OpenRouter + Groq still work for text-only chats (regression check).
6. DB `messages.metadata` still stores only `{type, name}` — no payloads.

---

## Phase 8 — Frontend UI Overhaul

### Goal
Transform the current flat cyan-on-black chat into a colorful, dynamic interface with smooth animations, better visual hierarchy, and consistent styling — all without rewriting business logic.

### Approach: Tailwind CSS + Framer Motion

**Why Tailwind:** The current codebase mixes inline-style objects and one giant legacy CSS file. Tailwind is the fastest way to unify both without component rewrites — utilities replace inline style props line-for-line, and CSS modules stay as-is during migration.

**Why Framer Motion:** User explicitly asked for "dynamic" UI. Framer Motion gives message entry animations, sidebar slide-ins, and button micro-interactions with a minimal API. React 19 compatible.

### Install (codethium-ai-web/)
```
npm install -D tailwindcss@3 postcss autoprefixer
npm install framer-motion lucide-react
npx tailwindcss init -p
```
(Tailwind v3, not v4 — CRA 5 has known v4 PostCSS issues.) `lucide-react` replaces emoji icons with crisp SVG icons.

### Design System

Define a Tailwind theme in `tailwind.config.js` with an expanded palette — not just cyan. Proposed tokens:

| Token | Color | Use |
|---|---|---|
| `brand.primary` | `#7c3aed` (violet-600) | Primary actions, send button |
| `brand.accent` | `#06b6d4` (cyan-500) | Links, highlights |
| `brand.gradient-from` | `#7c3aed` | Gradient start (violet) |
| `brand.gradient-via` | `#ec4899` | Gradient mid (pink) |
| `brand.gradient-to` | `#f59e0b` | Gradient end (amber) |
| `surface.0/1/2` | `#0b0b14` / `#13131f` / `#1c1c2e` | Layered backgrounds |
| `text.primary/muted` | `#f4f4f5` / `#a1a1aa` | Text hierarchy |
| `success` / `warning` / `error` | `#22c55e` / `#f59e0b` / `#ef4444` | Status |

Global `index.css` keeps the Inter font + adds `@tailwind base/components/utilities`.

### Component-by-Component Refactor

| Component | Visual Changes |
|---|---|
| `ChatPage.js` | Replace inline container styles with Tailwind grid (`grid-cols-[280px_1fr]`). Animated gradient background (slow-pulsing `bg-gradient-to-br from-violet-900/20 via-surface-0 to-cyan-900/20`). |
| `ChatSidebar.js` | Glass card with `backdrop-blur-xl`, subtle gradient border. Chat items get hover-lift + Framer Motion `layout` animation on delete. Active chat has gradient left-border accent. |
| `MessageList.js` | Framer Motion `AnimatePresence` wraps message array; each new message animates in (fade + slide-up). Auto-scroll preserved. |
| `MessageBubble.js` | User bubble: gradient `from-violet-600 to-pink-600` with soft shadow. Assistant bubble: glass with gradient border. Avatar circles (Lucide `User` / `Bot`). Timestamp on hover. |
| `MessageContent.js` | No structural change — just restyle `react-syntax-highlighter` theme to match (use `oneDark` with custom background). Inline code gets a gradient-border chip. |
| `ChatInput.js` | Pill-shaped textarea container with animated gradient ring on focus. Send button is a circular gradient with a rotating loader when streaming. Model dropdown becomes a styled popover. |
| `FileUploadButton.js` | Lucide icons instead of emojis. Hover tooltip. |
| `ImagePreview.js` | Thumbnails with spring entrance animation, remove button fades in on hover. |
| `SettingsPanel.js` | Modal with backdrop blur + scale/fade entrance. Tabs for Account / Appearance / Model. |
| `LoginPage.js` | Keep the module.css, but restyle to match new palette: split-screen with animated gradient blob background on one side, form on the other. |

### Shared Primitives (new, small)
- `src/components/ui/Button.js` — variants: `primary` (gradient), `ghost`, `icon`.
- `src/components/ui/GlassCard.js` — wrapper applying glass + gradient border classes.
- `src/components/ui/Spinner.js` — Framer Motion rotating ring.

These keep Tailwind classes out of every consumer and make future theming easy.

### Cleanup
- Delete `src/components/ChatbotPage.js` and `ChatbotPage.css` (legacy, unused).
- Remove `App.css` (unused).
- Trim inline style objects from `ChatPage.js`, `ChatInput.js`, `FileUploadButton.js` as each is migrated.

### Verification
1. `npm start` in `codethium-ai-web/` — Tailwind compiles, no CRA errors.
2. Visual pass in browser:
   - Login page: animated gradient blob visible, form readable.
   - Sidebar: glass effect, hover lift, delete animates.
   - New messages slide in smoothly.
   - Send button rotates while streaming.
   - Modal (settings) fades in with backdrop blur.
3. Responsive at 1280px and 768px widths (sidebar collapses).
4. Dark theme only — no light-mode support in this phase.
5. No regressions: send message, upload image, change model, logout — all still work.

---

## Critical Files (cross-reference)

**Phase 7:**
- `codethium-ai-web/server/services/llm/GeminiProvider.js` (new)
- `codethium-ai-web/server/services/llm/index.js` (factory)
- `codethium-ai-web/server/services/llm/OpenRouterProvider.js` (strip vision code)
- `codethium-ai-web/server/services/llm/OpenAICompatibleProvider.js` (reused `_readSSEStream`)
- `codethium-ai-web/server/routes/chat.js` (schema + vision branch)
- `codethium-ai-web/server/routes/upload.js` (PDF passthrough)
- `codethium-ai-web/server/config/index.js` (env block)
- `codethium-ai-web/src/components/chat/ChatInput.js` (MODELS array)
- `.env.example`, `CLAUDE.md`

**Phase 8:**
- `codethium-ai-web/tailwind.config.js` (new)
- `codethium-ai-web/postcss.config.js` (new)
- `codethium-ai-web/src/index.css` (Tailwind directives)
- `codethium-ai-web/src/components/chat/*.js` (all)
- `codethium-ai-web/src/components/ui/*.js` (new primitives)
- `codethium-ai-web/src/components/LoginPage.module.css`
- `codethium-ai-web/package.json` (new deps)
- Delete: `src/components/ChatbotPage.js`, `ChatbotPage.css`, `App.css`

---

## Execution Order

1. **Phase 7 first**, verify multimodal works end-to-end with Gemini.
2. **Then Phase 8** — purely visual, won't touch provider code.
3. Each phase → separate commit(s) → update `implementation_plan.md` status table.
