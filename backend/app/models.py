"""
Database table schemas and SQL definitions for Tab Bankruptcy SQLite storage.
"""

CREATE_SESSIONS_TABLE = """
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    window_count INTEGER NOT NULL,
    tab_count INTEGER NOT NULL
);
"""

CREATE_TABS_TABLE = """
CREATE TABLE IF NOT EXISTS tabs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    tab_id INTEGER,
    window_id INTEGER NOT NULL,
    window_index INTEGER NOT NULL,
    tab_index INTEGER NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    favicon_url TEXT,
    pinned BOOLEAN NOT NULL DEFAULT 0,
    category TEXT,
    summary TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
);
"""

CREATE_TABS_SESSION_INDEX = """
CREATE INDEX IF NOT EXISTS idx_tabs_session_id ON tabs (session_id);
"""

CREATE_RESTORE_JOBS_TABLE = """
CREATE TABLE IF NOT EXISTS restore_jobs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    restored_tabs INTEGER DEFAULT 0,
    restored_windows INTEGER DEFAULT 0,
    skipped_tabs INTEGER DEFAULT 0,
    skipped_reasons TEXT,
    error_message TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
);
"""

CREATE_RESTORE_JOBS_STATUS_INDEX = """
CREATE INDEX IF NOT EXISTS idx_restore_jobs_status ON restore_jobs (status);
"""

