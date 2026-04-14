# Gemini CLI Project Analysis: CodeThium AI

This document provides an overview of the "CodeThium AI" project, a full-stack AI chatbot application.

## Project Overview

CodeThium AI is a full-stack AI chatbot supporting various Large Language Models (LLMs), multimodal input (images, PDFs), Retrieval-Augmented Generation (RAG) via PostgreSQL full-text search, and real-time web search. It features token streaming, robust authentication, and a modern React UI built with Tailwind CSS and Framer Motion.

**Key Technologies:**
*   **Frontend:** React 19, Tailwind CSS, Framer Motion
*   **Backend:** Node.js (Express 5)
*   **Database:** PostgreSQL 16
*   **LLM Providers:** OpenRouter, Groq, Google Gemini, Gemma, custom-trained local Python code model
*   **Web Search:** Tavily API
*   **RAG:** PostgreSQL `tsvector` for full-text search

**Architecture:**
The application follows a client-server architecture:
*   **Browser (React):** Communicates with the Express backend via HTTP cookies for authentication.
*   **Express Backend:** Handles API requests, interacts with LLM providers, manages RAG and web search services, and connects to the PostgreSQL database.
*   **LLM Providers:** External services or a local FastAPI model for AI responses.
*   **PostgreSQL:** Stores user data, chat history, messages, uploaded documents for RAG, and refresh tokens.

## Building and Running

### Quick Start (Docker - Recommended)

1.  **Copy environment template and fill in API keys:**
    ```bash
    cp .env.example .env
    ```
2.  **Build and start all services:**
    ```bash
    docker compose up --build
    ```
3.  **Access the application:**
    Open your browser to `http://localhost:3000`. Migrations run automatically on the first start.

### Local Development

#### Backend

1.  **Navigate to the backend directory:**
    ```bash
    cd codethium-ai-web/server
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the development server:**
    ```bash
    npm run dev  # nodemon at http://localhost:4000
    ```

#### Frontend

1.  **Navigate to the frontend directory:**
    ```bash
    cd codethium-ai-web
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the development server:**
    ```bash
    npm start # CRA dev server at http://localhost:3000
    ```
4.  **Create `.env` file for the frontend:**
    Create a file named `.env` in `codethium-ai-web/` with the following content:
    ```
    REACT_APP_API_URL=http://localhost:4000
    ```

## Development Conventions

### Testing

*   **Backend Tests:** Use Jest and Supertest.
    ```bash
    cd codethium-ai-web/server
    npm test # Runs 41 tests, no DB required
    ```
*   **Frontend Tests:** (Implicitly uses CRA setup, details not explicitly in README).

### Environment Variables

Environment variables are managed via a single `.env` file at the repository root. Refer to `.env.example` for the full template. Key variables include database connection details, JWT secret, CORS origin, and API keys for various LLM providers and Tavily.

### Project Structure

```
AI-Chatbot/
├── codethium-ai-web/
│   ├── server/                   # Express backend with routes, middleware, services (LLM, RAG, web search, file parsing), database setup, and tests.
│   └── src/                      # React 19 frontend with context providers (Auth, Theme), API services (Axios, SSE), and UI components.
├── codethium-model/              # FastAPI local model server (ONNX Runtime, decoder-only transformer).
├── docker-compose.yml            # Docker Compose configuration for all services.
└── .env.example                  # Template for environment variables.
```

## API Endpoints

The backend exposes several REST API endpoints for user management, chat operations, and file uploads.
*   `/api/register`: Create new user account.
*   `/api/login`: Authenticate user and set cookies.
*   `/api/refresh`: Issue new access token.
*   `/api/logout`: Clear cookies and delete refresh token.
*   `/api/me`: Get current user info.
*   `/api/change-password`: Change user password.
*   `/api/chats`: List/create user chats.
*   `/api/chats/:id`: Update/delete specific chat.
*   `/api/chats/:id/messages`: Fetch chat message history.
*   `/api/chats/stream`: Stream LLM responses (SSE).
*   `/api/upload/image`: Upload image for multimodal input.
*   `/api/upload/file`: Upload PDF/text files for RAG.

## Database Schema

The PostgreSQL database includes the following tables:
*   `users`: Stores user credentials and metadata.
*   `chats`: Stores chat session information, including titles and messages (JSONB).
*   `messages`: Stores individual messages within chats.
*   `documents`: Stores uploaded documents, their content, and a `tsvector` for full-text search (RAG).
*   `refresh_tokens`: Stores hashed refresh tokens for authentication.
