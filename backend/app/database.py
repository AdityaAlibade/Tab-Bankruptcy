import sqlite3
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple, Dict, Any

from app.models import (
    CREATE_SESSIONS_TABLE,
    CREATE_TABS_TABLE,
    CREATE_TABS_SESSION_INDEX,
    CREATE_RESTORE_JOBS_TABLE,
    CREATE_RESTORE_JOBS_STATUS_INDEX,
)
from app.schemas import TabSession, StashedTab, SessionSummary

# Resolve database file path: backend/tab_bankruptcy.db
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = BASE_DIR / "tab_bankruptcy.db"


def get_db_connection() -> sqlite3.Connection:
    """
    Creates and returns a connection to the SQLite database
    with row_factory enabled and foreign keys enforced.
    """
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db() -> None:
    """
    Initializes the SQLite database tables and indices if they do not exist.
    Performs safe in-place migration if new columns (e.g. category) are missing.
    """
    try:
        with get_db_connection() as conn:
            conn.execute(CREATE_SESSIONS_TABLE)
            conn.execute(CREATE_TABS_TABLE)
            conn.execute(CREATE_TABS_SESSION_INDEX)
            conn.execute(CREATE_RESTORE_JOBS_TABLE)
            conn.execute(CREATE_RESTORE_JOBS_STATUS_INDEX)

            # Safe migration: ensure 'category' and 'summary' columns exist on 'tabs' table
            cursor = conn.execute("PRAGMA table_info(tabs);")
            columns = [col["name"] for col in cursor.fetchall()]
            if "category" not in columns:
                conn.execute("ALTER TABLE tabs ADD COLUMN category TEXT;")
                print("[Tab Bankruptcy DB] Migrated 'tabs' table: added 'category' column.")
            if "summary" not in columns:
                conn.execute("ALTER TABLE tabs ADD COLUMN summary TEXT;")
                print("[Tab Bankruptcy DB] Migrated 'tabs' table: added 'summary' column.")

            conn.commit()
        print(f"[Tab Bankruptcy DB] SQLite database initialized at: {DB_PATH}")
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR initializing SQLite database: {e}")
        raise e


def insert_session(session: TabSession) -> None:
    """
    Inserts a session and its associated tabs into the SQLite database in a single transaction.
    If the session ID already exists, replaces it to prevent duplicates.
    """
    try:
        with get_db_connection() as conn:
            # Delete any existing tabs for this session if re-stashing to prevent duplicates
            conn.execute("DELETE FROM tabs WHERE session_id = ?", (session.id,))

            # Insert or replace the session record
            conn.execute(
                """
                INSERT OR REPLACE INTO sessions (id, name, created_at, window_count, tab_count)
                VALUES (?, ?, ?, ?, ?)
                """,
                (session.id, session.name, session.createdAt, session.windowCount, session.tabCount)
            )

            # Insert all tab records
            if session.tabs:
                tab_rows = [
                    (
                        session.id,
                        tab.id,
                        tab.windowId,
                        tab.windowIndex,
                        tab.tabIndex,
                        tab.title,
                        tab.url,
                        tab.favIconUrl,
                        1 if tab.pinned else 0,
                        getattr(tab, "category", None),
                        getattr(tab, "summary", None)
                    )
                    for tab in session.tabs
                ]
                conn.executemany(
                    """
                    INSERT INTO tabs (
                        session_id, tab_id, window_id, window_index, tab_index,
                        title, url, favicon_url, pinned, category, summary
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    tab_rows
                )

            conn.commit()
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR inserting session '{session.id}': {e}")
        raise e


def fetch_all_sessions() -> List[SessionSummary]:
    """
    Retrieves summary list of all saved sessions sorted by created_at DESC.
    Does not load individual tab rows for performance.
    """
    try:
        with get_db_connection() as conn:
            rows = conn.execute(
                """
                SELECT id, name, created_at, window_count, tab_count
                FROM sessions
                ORDER BY created_at DESC
                """
            ).fetchall()

            return [
                SessionSummary(
                    id=row["id"],
                    name=row["name"],
                    createdAt=row["created_at"],
                    windowCount=row["window_count"],
                    tabCount=row["tab_count"]
                )
                for row in rows
            ]
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR querying sessions: {e}")
        raise e


def fetch_session_by_id(session_id: str) -> Optional[TabSession]:
    """
    Retrieves full session details including all stored tabs ordered by window and tab index.
    Includes the category field for each tab.
    """
    try:
        with get_db_connection() as conn:
            session_row = conn.execute(
                """
                SELECT id, name, created_at, window_count, tab_count
                FROM sessions
                WHERE id = ?
                """,
                (session_id,)
            ).fetchone()

            if not session_row:
                return None

            tab_rows = conn.execute(
                """
                SELECT id, tab_id, window_id, window_index, tab_index,
                       title, url, favicon_url, pinned, category, summary
                FROM tabs
                WHERE session_id = ?
                ORDER BY window_index ASC, tab_index ASC
                """,
                (session_id,)
            ).fetchall()

            tabs = [
                StashedTab(
                    id=t["tab_id"] if t["tab_id"] is not None else t["id"],
                    windowId=t["window_id"],
                    windowIndex=t["window_index"],
                    tabIndex=t["tab_index"],
                    title=t["title"],
                    url=t["url"],
                    favIconUrl=t["favicon_url"],
                    pinned=bool(t["pinned"]),
                    category=t["category"],
                    summary=t["summary"]
                )
                for t in tab_rows
            ]

            return TabSession(
                id=session_row["id"],
                name=session_row["name"],
                createdAt=session_row["created_at"],
                windowCount=session_row["window_count"],
                tabCount=session_row["tab_count"],
                tabs=tabs
            )
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR querying session '{session_id}': {e}")
        raise e


def fetch_raw_tabs_for_session(session_id: str) -> List[Dict[str, Any]]:
    """
    Retrieves all tab rows for a session as dictionaries with primary key 'id',
    title, url, and category.
    """
    try:
        with get_db_connection() as conn:
            rows = conn.execute(
                """
                SELECT id, tab_id, window_id, window_index, tab_index,
                       title, url, favicon_url, pinned, category, summary
                FROM tabs
                WHERE session_id = ?
                ORDER BY window_index ASC, tab_index ASC
                """,
                (session_id,)
            ).fetchall()

            return [dict(r) for r in rows]
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR fetching raw tabs for session '{session_id}': {e}")
        raise e


def update_tabs_categories(tab_category_pairs: List[Tuple[str, int]]) -> None:
    """
    Batch updates the category column for tabs.
    tab_category_pairs: list of tuples in the format (category_string, tab_row_id).
    """
    try:
        with get_db_connection() as conn:
            conn.executemany(
                "UPDATE tabs SET category = ? WHERE id = ?",
                tab_category_pairs
            )
            conn.commit()
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR batch updating tab categories: {e}")
        raise e


def update_tabs_summaries(tab_summary_pairs: List[Tuple[str, int]]) -> None:
    """
    Batch updates the summary column for tabs.
    tab_summary_pairs: list of tuples in the format (summary_string, tab_row_id).
    """
    try:
        with get_db_connection() as conn:
            conn.executemany(
                "UPDATE tabs SET summary = ? WHERE id = ?",
                tab_summary_pairs
            )
            conn.commit()
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR batch updating tab summaries: {e}")
        raise e


# ==============================================================================
# Restore Jobs Database Operations (Step 8)
# ==============================================================================

def create_restore_job(session_id: str) -> str:
    """
    Creates a new pending restore job in SQLite and returns its ID.
    """
    job_id = f"restore_{uuid.uuid4().hex[:12]}"
    created_at = datetime.utcnow().isoformat()
    try:
        with get_db_connection() as conn:
            conn.execute(
                """
                INSERT INTO restore_jobs (id, session_id, status, created_at)
                VALUES (?, ?, 'pending', ?)
                """,
                (job_id, session_id, created_at)
            )
            conn.commit()
            return job_id
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR creating restore job for session '{session_id}': {e}")
        raise e


def get_active_restore_job_for_session(session_id: str) -> Optional[Dict[str, Any]]:
    """
    Checks if there is already an active (pending or processing) restore job
    for this session to prevent duplicate jobs.
    """
    try:
        with get_db_connection() as conn:
            row = conn.execute(
                """
                SELECT id, session_id, status, created_at, started_at, completed_at,
                       restored_tabs, restored_windows, skipped_tabs, skipped_reasons, error_message
                FROM restore_jobs
                WHERE session_id = ? AND status IN ('pending', 'processing')
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (session_id,)
            ).fetchone()
            return dict(row) if row else None
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR querying active restore job: {e}")
        raise e


def get_pending_restore_job() -> Optional[Dict[str, Any]]:
    """
    Retrieves the oldest pending restore job for the Chrome extension to process.
    """
    try:
        with get_db_connection() as conn:
            row = conn.execute(
                """
                SELECT id, session_id, status, created_at
                FROM restore_jobs
                WHERE status = 'pending'
                ORDER BY created_at ASC
                LIMIT 1
                """
            ).fetchone()
            return dict(row) if row else None
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR querying pending restore job: {e}")
        raise e


def get_restore_job(job_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves a restore job by ID.
    """
    try:
        with get_db_connection() as conn:
            row = conn.execute(
                """
                SELECT id, session_id, status, created_at, started_at, completed_at,
                       restored_tabs, restored_windows, skipped_tabs, skipped_reasons, error_message
                FROM restore_jobs
                WHERE id = ?
                """,
                (job_id,)
            ).fetchone()
            return dict(row) if row else None
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR querying restore job '{job_id}': {e}")
        raise e


def update_restore_job_status(
    job_id: str,
    status: str,
    restored_tabs: int = 0,
    restored_windows: int = 0,
    skipped_tabs: int = 0,
    skipped_reasons: Optional[str] = None,
    error_message: Optional[str] = None
) -> None:
    """
    Updates the status and metadata for a restore job.
    """
    now = datetime.utcnow().isoformat()
    try:
        with get_db_connection() as conn:
            if status == "processing":
                conn.execute(
                    """
                    UPDATE restore_jobs
                    SET status = ?, started_at = ?
                    WHERE id = ?
                    """,
                    (status, now, job_id)
                )
            elif status in ("completed", "failed"):
                conn.execute(
                    """
                    UPDATE restore_jobs
                    SET status = ?,
                        completed_at = ?,
                        restored_tabs = ?,
                        restored_windows = ?,
                        skipped_tabs = ?,
                        skipped_reasons = ?,
                        error_message = ?
                    WHERE id = ?
                    """,
                    (
                        status,
                        now,
                        restored_tabs,
                        restored_windows,
                        skipped_tabs,
                        skipped_reasons,
                        error_message,
                        job_id,
                    )
                )
            else:
                conn.execute(
                    "UPDATE restore_jobs SET status = ? WHERE id = ?",
                    (status, job_id)
                )
            conn.commit()
    except sqlite3.Error as e:
        print(f"[Tab Bankruptcy DB] ERROR updating restore job '{job_id}': {e}")
        raise e
