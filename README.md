# Tab Bankruptcy — Local AI-Powered Tab Manager

A privacy-first, 100% local productivity tool designed to cure browser tab overload. Tab Bankruptcy lets you stash open tabs across multiple Chrome windows with a single click, persist them to a local SQLite database, enrich them with local AI categorization and 1-sentence summaries using **Ollama** and **Qwen2.5**, search them instantly, and restore them back into Chrome with original window groupings, tab ordering, and pinned states preserved.

---

## The Problem

Modern web workflows inevitably lead to **tab overload**:

- Dozens of tabs accumulated across multiple browser windows consume gigabytes of system RAM.
- Important research, documentation, and work references become buried in chaotic browser sessions.
- Users fear closing tabs because they will lose context, yet keeping them open creates cognitive overload and sluggish browser performance.
- Cloud-based bookmarking and tab manager services require sending personal browsing histories, private URLs, and internal intranet links to third-party servers.

## The Solution

**Tab Bankruptcy** introduces a clean, local-first workflow:

1. **Declare Tab Bankruptcy**: Stash all open tabs across all Chrome windows simultaneously into permanent local storage.
2. **Local SQLite Persistence**: Store structured tab data (URLs, titles, favicons, window indices, tab order, pinned flags) locally on your machine.
3. **Local AI Enrichment**: Automatically classify tabs into intuitive categories and generate concise 1-sentence summaries using offline open-weight models (**Qwen2.5**) via Ollama.
4. **Smart Search & Filter**: Quickly find any saved tab across Title, URL, Category, or AI Summary with keyword highlight matching.
5. **Seamless Session Restoration**: Reopen entire sessions back into Chrome on demand, preserving exact window groupings, tab ordering, and pinned statuses.

---

## Why Open Innovation & Local AI Matter

- **100% Privacy & Data Sovereignty**: Your browsing habits, private project links, and reading history never leave your machine. No telemetry, no analytics, no cloud API tokens.
- **Open-Weight AI**: Powered by **Qwen2.5-Coder:7B** via Ollama. Open models democratize state-of-the-art language intelligence without SaaS subscription paywalls or cloud lock-in.
- **Zero Ongoing Costs & Offline Capability**: Once downloaded, the system runs entirely offline without internet access or ongoing inference fees.

---

## Architecture Overview

The system is built on a clean, decoupled 4-tier architecture:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                             Google Chrome                              │
│                                                                        │
│   ┌───────────────────────────┐      ┌───────────────────────────────┐ │
│   │   Popup UI (Capture)      │      │   Service Worker (Restore)    │ │
│   │   chrome.tabs.query       │      │   chrome.windows.create       │ │
│   │   chrome.storage.local    │      │   chrome.tabs.create          │ │
│   └─────────────┬─────────────┘      └──────────────▲────────────────┘ │
└─────────────────┼───────────────────────────────────┼──────────────────┘
                  │ POST /api/sessions                │ Polls /api/restore-jobs/pending
                  ▼                                   │ & reports completion
┌─────────────────────────────────────────────────────┴──────────────────┐
│                         FastAPI Backend (Port 8000)                    │
│                                                                        │
│   • Session Ingestion & Querying      • Asynchronous Restore Queue     │
│   • AI Categorization Pipeline        • AI Summarization Pipeline      │
└─────────────┬───────────────────────────────────────▲──────────────────┘
              │                                       │
       Read / │ SQLite3                        Prompt │ JSON
       Write  │ Database                       Stream │ Completion
              ▼                                       ▼
┌───────────────────────────┐         ┌──────────────────────────────────┐
│     tab_bankruptcy.db     │         │       Local Ollama Engine        │
│   • sessions              │         │     (qwen2.5-coder:7b)           │
│   • tabs                  │         │     http://127.0.0.1:11434       │
│   • restore_jobs          │         └──────────────────────────────────┘
└───────────────────────────┘
              ▲
              │ REST API (JSON / CORS enabled)
              ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     React Dashboard (Vite on Port 5173)                │
│   • Total Sessions & Tabs Overview Metrics                             │
│   • Window-Grouped Tab Browser with Favicons & Pinned Badges           │
│   • One-Click AI Categorization & Summarization Triggers               │
│   • Real-Time Search & Category Filtering with Keyword Highlighting    │
│   • One-Click "Restore Session" Trigger & Live Progress Tracker        │
│   • Interactive Local AI Diagnostic Test Card                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Key Features

1. **Multi-Window Tab Capture (Chrome Extension)**
   - Simultaneously queries and captures tabs across all active Chrome windows.
   - Preserves tab titles, URLs, favicon URLs, pinned status, window index, and tab order index.
   - Local fallback caching in `chrome.storage.local`.
   - Direct HTTP POST to the local FastAPI backend.

2. **Relational SQLite Persistence (FastAPI Backend)**
   - Normalized database schemas (`sessions`, `tabs`, and `restore_jobs`).
   - Foreign key integrity and cascading deletions.
   - Permissive CORS for both Chrome Extensions (`chrome-extension://*`) and local web dashboards (`http://localhost:5173`).

3. **100% Offline AI Categorization (Ollama + Qwen2.5)**
   - Classifies tabs into a strict 10-category taxonomy:  
     `Development`, `Study`, `Research`, `Work`, `Shopping`, `News`, `Entertainment`, `Social`, `Finance`, `Other`.
   - Batched processing (10 tabs per chunk) for balanced prompt length and high throughput.
   - Resilient parsing with regex JSON array extraction and fallback categorization.
   - Skips already categorized tabs on subsequent runs to save compute.

4. **1-Sentence AI Summaries (Ollama + Qwen2.5)**
   - Generates concise 10–25 word summaries based on tab titles and URL context.
   - Batched processing with fallback handling for unparsable responses.
   - Persisted directly into the SQLite `tabs` table for instant retrieval.

5. **Smart Search & Interactive Filtering (React Dashboard)**
   - Instant client-side search across **Title**, **URL**, **Category**, and **Summary**.
   - Real-time keyword highlight matching in tab titles and AI summaries.
   - Category filter pills with dynamic count badges.
   - Visual badges for pinned tabs, categories, and window group dividers.

6. **Tab Session Restoration (React Dashboard → Extension Bridge)**
   - User clicks **"Restore Session"** in the React dashboard.
   - FastAPI enqueues an asynchronous restore job in SQLite.
   - The Chrome extension background service worker polls `/api/restore-jobs/pending` every 2.5 seconds.
   - Extension creates new Chrome windows and tabs matching original window grouping and ordering.
   - Pinned tabs are restored as pinned.
   - Chrome internal URLs (`chrome://`, `devtools://`, etc.) are safely filtered out and reported back to the dashboard.
   - Dashboard displays real-time progress and completion banners with restored tab counts and skipped tab reasons.

7. **Local AI Diagnostic Card**
   - Built-in diagnostic card on the dashboard home screen to verify Ollama connectivity and test inference latency.

---

## Tech Stack

| Layer                  | Technology                           | Description                                                               |
| ---------------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| **Chrome Extension**   | Manifest V3, TypeScript, Vite        | Multi-window stash popup UI and background restore service worker         |
| **Backend API**        | Python 3.10+, FastAPI, Uvicorn       | RESTful API, SQLite database manager, and restore job queue               |
| **Database**           | SQLite3                              | Relational database (`tab_bankruptcy.db`) auto-initialized on startup     |
| **Local AI Engine**    | Ollama, Qwen2.5 (`qwen2.5-coder:7b`) | 100% offline, local language model inference via HTTP                     |
| **Frontend Dashboard** | React 18, TypeScript, Vite           | Modern responsive dark-themed dashboard with zero external CSS frameworks |

---

## Project Structure

```text
tab-bankruptcy/
├── backend/
│   ├── app/
│   │   ├── ai/
│   │   │   ├── categorizer.py         # 10-category taxonomy classification & batching
│   │   │   ├── summarizer.py          # 1-sentence tab summarizer & prompt templates
│   │   │   └── ollama_service.py      # HTTP client communicating with local Ollama
│   │   ├── config.py                  # Model name and Ollama URL configuration
│   │   ├── database.py                # SQLite connection, table schemas, and CRUD operations
│   │   ├── models.py                  # SQL DDL schemas and table definitions
│   │   ├── schemas.py                 # Pydantic request and response models
│   │   └── main.py                    # FastAPI routes, CORS, lifespan, and restore job queue
│   ├── tab_bankruptcy.db              # SQLite database file (auto-created on startup)
│   ├── requirements.txt               # FastAPI, Uvicorn, Pydantic
│   └── .gitignore                     # Ignores .venv, .env, and local database files
├── dashboard/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx             # Dashboard header & summary statistics
│   │   │   ├── SessionCard.tsx        # Individual session card component
│   │   │   ├── SessionList.tsx        # Session grid, loading, empty, and offline error states
│   │   │   ├── TabList.tsx            # Session details view, search/filter, and Restore action
│   │   │   └── AITestCard.tsx         # Interactive local AI diagnostic card
│   │   ├── types.ts                   # TypeScript interfaces (TabSession, StashedTab, etc.)
│   │   ├── api.ts                     # Backend REST API client & job status polling
│   │   ├── App.tsx                    # Main application view manager & state router
│   │   ├── main.tsx                   # React entry point
│   │   └── index.css                  # Custom cohesive dark theme styling
│   ├── package.json                   # React 18, TypeScript, Vite
│   ├── vite.config.ts                 # Vite development and build configuration
│   └── .gitignore                     # Ignores node_modules, dist, .vite
├── extension/
│   ├── dist/                          # Production bundle loaded into Chrome
│   ├── icons/                         # Extension toolbar icons (16, 48, 128)
│   ├── src/
│   │   ├── background.ts              # Background service worker (polling & tab restoration)
│   │   ├── popup/
│   │   │   ├── popup.html             # Stash popup markup with backend status indicator
│   │   │   ├── popup.ts               # Chrome Tabs/Windows API capture & stash logic
│   │   │   └── popup.css              # Clean dark theme styling
│   │   └── types.ts                   # Extension TypeScript interfaces
│   ├── manifest.json                  # Manifest V3 configuration (tabs, storage, windows)
│   ├── package.json                   # TypeScript, Vite
│   ├── vite.config.ts                 # Vite build configuration with asset copy plugin
│   └── .gitignore                     # Ignores node_modules, dist, .vite
├── README.md                          # Comprehensive documentation
└── .gitignore                         # Root gitignore covering all subprojects
```

---

## Prerequisites

Ensure you have installed:

1. **Google Chrome** (or Chromium-based browser)
2. **Node.js** (v18.0.0 or higher) & **npm**
3. **Python** (v3.10 or higher)
4. **Ollama** (download from [ollama.com](https://ollama.com))

---

## Setup & Running Guide

### Step 1: Start Ollama & Pull the Model

1. Verify Ollama is installed:

   ```bash
   ollama --version
   ```

2. Start the Ollama server:

   ```bash
   ollama serve
   ```

3. In another terminal, pull the recommended open-weight model:

   ```bash
   ollama pull qwen2.5-coder:7b
   ```

   _(Note: `qwen2.5-coder:7b` is the default model. If using a different model such as `qwen2.5:3b`, set `OLLAMA_MODEL=qwen2.5:3b` in `backend/.env`)_

4. Verify the model is ready:
   ```bash
   ollama list
   ```

---

### Step 2: Setup & Start the FastAPI Backend

1. Navigate to the `backend/` directory:

   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   - **Windows (PowerShell)**:
     ```powershell
     # If script execution is blocked on Windows, enable it for this process:
     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
     python -m venv .venv
     .\.venv\Scripts\Activate.ps1
     ```
   - **macOS / Linux**:
     ```bash
     python3 -m venv .venv
     source .venv/bin/activate
     ```

3. Install backend dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Start the FastAPI server:
   ```bash
   uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

The backend will automatically initialize `tab_bankruptcy.db` and listen at `http://127.0.0.1:8000`.  
API documentation is available at `http://127.0.0.1:8000/docs`.

---

### Step 3: Build & Load the Chrome Extension

1. In a new terminal, navigate to `extension/`:

   ```bash
   cd extension
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the extension bundle:

   ```bash
   npm run build
   ```

4. Load the extension in Chrome:
   1. Open Chrome and navigate to `chrome://extensions/`.
   2. Enable **Developer mode** (toggle in the top-right corner).
   3. Click **"Load unpacked"**.
   4. Select the `extension/dist` folder (ensure you select `extension/dist`, where the build outputs reside).
   5. Pin the **Tab Bankruptcy** extension icon to your Chrome toolbar.

---

### Step 4: Setup & Run the React Dashboard

1. In a new terminal, navigate to `dashboard/`:

   ```bash
   cd dashboard
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the Vite development server:

   ```bash
   npm run dev
   ```

4. Open your browser and navigate to:
   ```text
   http://localhost:5173
   ```

---

## Step-by-Step Demo & Verification Guide

### 1. Capture Multiple Windows & Tabs

1. Open 2 distinct Chrome windows with multiple tabs each (e.g. GitHub, Python docs, MDN, Wikipedia).
2. Pin at least one tab in each window to verify pinned state preservation.
3. Click the **Tab Bankruptcy** icon in Chrome's toolbar.
4. Verify the popup displays:
   - Green **"Backend Connected"** indicator.
   - Accurate tab and window counts.
5. Click **"Stash All Tabs"**.
6. Verify the confirmation message and session ID.

### 2. View Saved Sessions in Dashboard

1. Open the React Dashboard at `http://localhost:5173`.
2. Observe the header metrics: **Total Sessions** and **Total Tabs Saved**.
3. Locate your new session card and click **"View Session →"**.
4. Observe the session detail view:
   - Header summary badges: Total Tabs, Windows, Categorized count, Summarized count.
   - Tabs grouped by window with favicon, title, URL, and pinned badge.
   - Click the **"Open"** button on any individual tab to open that URL in a new tab.

### 3. Test Local AI Categorization

1. Click **"✨ AI Categorize Tabs"** in the session header.
2. Watch the loading indicator as Ollama classifies tabs into categories (Development, Work, Social, etc.).
3. When complete, verify:
   - Color-coded category badges appear on each tab card.
   - Category filter pills update with exact tab counts per category.
   - Clicking a category pill filters the tab list immediately.

### 4. Test Local AI Summarization

1. Click **"📝 Generate Missing Summaries"**.
2. Watch the progress indicator as Ollama generates 1-sentence summaries.
3. When complete, verify that each tab displays a concise summary callout below its title.
4. Subsequent clicks indicate that all tabs already have summaries (cached in SQLite).

### 5. Test Smart Search & Highlighting

1. Type a keyword into the search bar (e.g., `"github"` or `"python"`).
2. Verify:
   - Filtered results update immediately across Title, URL, Category, and AI Summary.
   - Matching keywords are highlighted with an amber mark.
   - Combining search with a category filter works seamlessly.
   - Clearing the search restores the full list.

### 6. Test Session Restoration

1. In the session detail view, click **"🔁 Restore Session"**.
2. Observe the in-app progress banner:
   ```text
   ⏳ Restoring session... (Chrome extension is opening tabs)
   ```
3. Within 2–3 seconds, observe Google Chrome:
   - New Chrome windows open corresponding to each original window index.
   - Tabs open in their exact original order.
   - Pinned tabs are restored in the pinned position.
   - Non-restorable Chrome internal tabs (`chrome://`) are skipped cleanly.
4. In the dashboard, observe the completion banner:
   ```text
   ✓ Session restored: N tabs restored across M windows
   ```

### 7. Test Diagnostic AI Card & Offline Resilience

- **Interactive AI Diagnostic**:
  1. Return to the dashboard home view.
  2. Scroll to the **Local AI Test** card.
  3. Enter a prompt and click **"Test Local AI"** to verify Ollama connectivity and response latency.
- **Ollama Offline Handling**:
  1. Temporarily stop Ollama (`Ctrl+C` in Ollama terminal).
  2. Click **"AI Categorize Tabs"** in the dashboard.
  3. Verify a user-friendly error message appears:  
     `"Ollama is not running. Start Ollama and try again."`  
     Confirm the backend and dashboard do not crash.
- **Backend Offline Handling**:
  1. Temporarily stop the FastAPI backend.
  2. Refresh the dashboard.
  3. Verify the dashboard displays an informative offline state with a **"Retry Connection"** button.

---

## Limitations

- **Chrome Internal Pages**: URLs prefixed with `chrome://`, `chrome-extension://`, `devtools://`, `edge://`, or `about:` cannot be reopened by Chrome extensions due to Chrome security sandboxing. Tab Bankruptcy identifies, skips, and reports them cleanly.
- **In-Page Session State**: The extension restores tab URLs, window groupings, tab order, and pinned statuses, but cannot restore unsaved form inputs or browser back/forward history stacks.
- **Inference Speed**: Local AI performance depends entirely on host hardware (GPU acceleration vs CPU-only inference via Ollama).

---

## Troubleshooting

| Problem                                     | Cause                               | Solution                                                                                                                                   |
| ------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Extension popup shows "Backend Offline"** | FastAPI is not running on port 8000 | Run `uvicorn app.main:app --port 8000` in `backend/` and check terminal for errors.                                                        |
| **CORS error in browser console**           | Origin mismatch                     | FastAPI is configured with wildcard CORS (`allow_origins=["*"]`). Ensure you are using `http://localhost:5173` or `http://127.0.0.1:5173`. |
| **Ollama connection refused (`11434`)**     | Ollama daemon not running           | Run `ollama serve` in a terminal window.                                                                                                   |
| **Model not found error**                   | Model not pulled                    | Run `ollama pull qwen2.5-coder:7b` or set `OLLAMA_MODEL=qwen2.5:3b` in `backend/.env`.                                                     |
| **Extension fails to load in Chrome**       | Loaded wrong folder                 | Ensure you select `extension/dist` (NOT `extension/`) when clicking "Load unpacked".                                                       |
| **Restore button does not open tabs**       | Extension not running in Chrome     | Ensure the extension is loaded at `chrome://extensions/` and Chrome is open. Inspect the background service worker console for any issues. |
| **Dashboard build failure**                 | Node version or dependencies        | Run `npm install` in `dashboard/` and ensure Node.js is v18+.                                                                              |

---

## License

MIT License. Open-source, private, and 100% local.
