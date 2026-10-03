# Tab Bankruptcy Backend (Step 7: AI Tab Summaries + Smart Local Search)

A local FastAPI backend service that manages tab sessions, persists them in an SQLite database, automatically categorizes tabs, and generates concise AI summaries using a locally running **Ollama** instance powered by **Qwen2.5**.

> **Note**: This is Step 7. It includes local AI tab categorization, AI 1-sentence summaries, SQLite persistence, and smart local search. It does NOT include vector embeddings or external cloud APIs.

---

## Prerequisites

- Python 3.10+ installed
- [Ollama](https://ollama.com) installed and running locally
- Open-weight model: `qwen2.5-coder:7b`

---

## AI Architecture

```text
React Dashboard ──> FastAPI Backend ──> Local Ollama Service ──> Qwen2.5 Model
(Port 5173)         (Port 8000)         (Port 11434)              (Local weights)
```

- **Local Inference**: 100% private and offline. No data is sent to OpenAI, Gemini, Claude, or any external cloud provider.
- **Configurable**: Model name and base URL can be customized via environment variables:
  ```text
  OLLAMA_BASE_URL=http://127.0.0.1:11434
  OLLAMA_MODEL=qwen2.5-coder:7b
  ```

---

## Database Architecture

The backend automatically creates and initializes the SQLite database at:

```text
backend/tab_bankruptcy.db
```

### Schema

#### 1. `sessions` Table
| Column | Type | Description |
|---|---|---|
| `id` | TEXT PRIMARY KEY | Unique session identifier (from extension) |
| `name` | TEXT NOT NULL | Human-readable session name with timestamp |
| `created_at` | TEXT NOT NULL | ISO-8601 creation timestamp |
| `window_count` | INTEGER NOT NULL | Number of Chrome windows captured |
| `tab_count` | INTEGER NOT NULL | Number of tabs captured |

#### 2. `tabs` Table
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Unique row ID |
| `session_id` | TEXT NOT NULL (FK) | References `sessions.id` (ON DELETE CASCADE) |
| `tab_id` | INTEGER | Original Chrome tab ID |
| `window_id` | INTEGER NOT NULL | Chrome window ID |
| `window_index` | INTEGER NOT NULL | Zero-indexed window order |
| `tab_index` | INTEGER NOT NULL | Zero-indexed tab order inside window |
| `title` | TEXT NOT NULL | Tab page title |
| `url` | TEXT NOT NULL | Tab URL |
| `favicon_url` | TEXT | Favicon URL (if available) |
| `pinned` | BOOLEAN NOT NULL | Whether the tab was pinned |
| `category` | TEXT | AI-assigned category (NULL until categorized) |
| `summary` | TEXT | AI-generated 1-sentence summary (NULL until summarized) |

---

## Setup & Running

### 1. Ensure Ollama is Running & Model is Downloaded

Verify Ollama is installed:
```bash
ollama --version
```

Start the Ollama daemon (if not already running as a background service):
```bash
ollama serve
```

Download the local Qwen2.5 model:
```bash
ollama pull qwen2.5:3b
```

Verify the model is listed:
```bash
ollama list
```

### 2. Set Up Virtual Environment

From the project root:

```bash
cd backend
python -m venv .venv
```

**Activate Virtual Environment:**
- **Windows (PowerShell):** `.venv\Scripts\Activate.ps1`
- **Windows (Command Prompt):** `.venv\Scripts\activate.bat`
- **macOS / Linux:** `source .venv/bin/activate`

**Install Dependencies:**
```bash
pip install -r requirements.txt
```

### 3. Start the Backend Server

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API will now be running on:
- API Base: `http://127.0.0.1:8000`
- Interactive API Docs: `http://127.0.0.1:8000/docs`
- AI Test: `POST http://127.0.0.1:8000/api/ai/test`

---

## API Endpoints

### 1. `POST /api/ai/test`
Sends a test prompt to the local open-weight model via Ollama.

**Request Body:**
```json
{
  "text": "GitHub is a platform for hosting and collaborating on software projects."
}
```

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "response": "GitHub is a web-based platform primarily used for version control and software development collaboration...",
  "model": "qwen2.5-coder:7b"
}
```

**Error Response (Ollama Offline - HTTP 503):**
```json
{
  "detail": "Ollama is not running. Start Ollama and try again."
}
```

### 2. `POST /api/sessions`
Accepts, validates, and permanently stores a complete `TabSession` payload in SQLite.

### 3. `GET /api/sessions`
Returns summary list of all saved sessions from SQLite (newest first).

### 4. `GET /api/sessions/{session_id}`
Returns full details of an individual session along with all of its stored tabs (including `category` and `summary` if available).

### 5. `POST /api/sessions/{session_id}/categorize`
Analyzes tabs in the session in local batches of 10 using the local Ollama Qwen model and assigns each tab one of the 10 fixed categories:
- `Development`, `Study`, `Research`, `Work`, `Shopping`, `News`, `Entertainment`, `Social`, `Finance`, `Other`.

**Query Parameters:**
- `force` (bool, default `false`): If `false`, tabs that already have an assigned category are skipped to save computation time. If `true`, all tabs are re-classified.

### 6. `POST /api/sessions/{session_id}/summarize`
Generates a concise 1-sentence AI summary (approximately 10–25 words) for each tab in local batches of 10 using local Qwen.

**Query Parameters:**
- `force` (bool, default `false`): If `false`, tabs that already have an AI summary are skipped. If `true`, all tab summaries are re-generated.

**Success Response (HTTP 200):**
```json
{
  "success": true,
  "sessionId": "session_1791027855465_zjivl55",
  "summarizedCount": 14,
  "tabs": [
    {
      "id": 1,
      "title": "GitHub",
      "url": "https://github.com/",
      "summary": "Version control platform for collaboration."
    },
    {
      "id": 2,
      "title": "YouTube",
      "url": "https://youtube.com/",
      "summary": "Online video sharing and social networking site."
    }
  ]
}
```

