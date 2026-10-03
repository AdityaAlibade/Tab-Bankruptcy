# Tab Bankruptcy Dashboard (Step 4)

A local React + TypeScript dashboard built with **Vite** that connects to the Tab Bankruptcy FastAPI backend to browse, inspect, search, and open stashed tabs across all sessions.

> **Note**: This is Step 4. It does not include AI categorization, Ollama, embeddings, semantic search, or tab restoration.

---

## Features

- **Session Overview**:
  - Displays aggregate statistics: total **Sessions** and **Tabs Saved**.
  - Grid of session cards showing session name, tab count, window count, and creation date.
  - Automatically sorted with the newest session first.
- **Session Details View**:
  - Displays full session metadata and list of captured tabs.
  - Each tab card shows favicon (with fallback), page title, truncated URL, window index, tab index, and pinned badge.
- **Open Saved Tab**:
  - Clicking **"Open ↗"** on any tab card opens the URL in a new browser tab (`window.open(url, "_blank")`).
- **Client-Side Search / Filter**:
  - Real-time text search filtering against tab titles and URLs.
  - Instant match counter (e.g. *"Showing 3 of 14 tabs"*).
- **Graceful Error & Loading States**:
  - Shows friendly loading indicators.
  - Clear offline warning if the FastAPI backend is not running, with a one-click **"Retry Connection"** button.
  - Friendly empty state when no sessions are saved yet.

---

## Getting Started

### 1. Ensure FastAPI Backend is Running

In a separate terminal:

```bash
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 2. Install Dashboard Dependencies

In this directory (`dashboard`):

```bash
cd dashboard
npm install
```

### 3. Start the Development Server

```bash
npm run dev
```

Open your browser at:
```text
http://localhost:5173
```
*(or `http://127.0.0.1:5173`)*

---

## Production Build

To test or build the static production bundle:

```bash
npm run build
npm run preview
```
