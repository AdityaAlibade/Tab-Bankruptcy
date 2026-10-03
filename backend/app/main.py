from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.database import (
    init_db,
    insert_session,
    fetch_all_sessions,
    fetch_session_by_id,
    fetch_raw_tabs_for_session,
    update_tabs_categories,
    update_tabs_summaries,
    create_restore_job,
    get_active_restore_job_for_session,
    get_pending_restore_job,
    get_restore_job,
    update_restore_job_status,
)
from app.ai.ollama_service import query_ollama, OllamaServiceError
from app.ai.categorizer import categorize_tabs
from app.ai.summarizer import summarize_tabs
from app.config import OLLAMA_MODEL
from app.schemas import (
    TabSession,
    SessionCreateResponse,
    SessionListResponse,
    SessionDetailResponse,
    AITestRequest,
    AITestResponse,
    CategorizedTabItem,
    CategorizeSessionResponse,
    SummarizedTabItem,
    SummarizeSessionResponse,
    RestoreJobResponse,
    RestoreJobStatusResponse,
    PendingRestoreJobPayload,
    CompleteRestoreJobRequest,
    SkippedTabReason,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.
    Automatically initializes the SQLite database tables upon startup.
    """
    init_db()
    yield


app = FastAPI(
    title="Tab Bankruptcy API",
    description="Local backend service for storing and managing tab sessions in SQLite",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for Chrome Extension and local development
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(chrome-extension://.*|http://localhost(:\d+)?|http://127\.0\.0\.1(:\d+)?)$",
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Welcome route providing service information and API links."""
    return {
        "service": "Tab Bankruptcy Backend",
        "status": "running",
        "docs": "/docs",
        "endpoints": {
            "health": "/api/health",
            "sessions": "/api/sessions",
        },
    }


@app.get("/api/health")
async def health_check():
    """Simple health check endpoint to verify backend connectivity."""
    return {"status": "ok", "service": "Tab Bankruptcy Backend"}


@app.post("/api/sessions", response_model=SessionCreateResponse)
async def create_session(session: TabSession):
    """
    Accepts, validates, and permanently stores a stashed tab session in SQLite.
    Inserts session metadata and individual tab rows in a single transaction.
    """
    try:
        insert_session(session)
        print(
            f"[Tab Bankruptcy] Saved session '{session.name}' "
            f"(ID: {session.id}) to SQLite: {session.tabCount} tabs across {session.windowCount} windows."
        )

        return SessionCreateResponse(
            success=True,
            message="Session saved successfully",
            sessionId=session.id,
            tabCount=session.tabCount,
            windowCount=session.windowCount,
        )
    except Exception as e:
        print(f"[Tab Bankruptcy] Database error saving session '{session.id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error saving session: {str(e)}",
        )


@app.get("/api/sessions", response_model=SessionListResponse)
async def list_sessions():
    """
    Returns summary metadata for all saved tab sessions from SQLite.
    Ordered by creation date descending.
    """
    try:
        sessions = fetch_all_sessions()
        return SessionListResponse(
            success=True,
            sessions=sessions,
        )
    except Exception as e:
        print(f"[Tab Bankruptcy] Database error fetching sessions: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error fetching sessions: {str(e)}",
        )


@app.get("/api/sessions/{session_id}", response_model=SessionDetailResponse)
async def get_session_detail(session_id: str):
    """
    Returns full details for a specific session including all of its stored tabs.
    """
    try:
        session = fetch_session_by_id(session_id)
        if not session:
            raise HTTPException(
                status_code=404,
                detail=f"Session with ID '{session_id}' not found",
            )

        return SessionDetailResponse(
            success=True,
            session=session,
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Tab Bankruptcy] Database error fetching session '{session_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Database error fetching session details: {str(e)}",
        )


@app.post("/api/ai/test", response_model=AITestResponse)
async def test_ai_completion(request: AITestRequest):
    """
    Sends a test prompt to the local open-weight model via Ollama.
    Validates that local inference works without cloud APIs.
    """
    if not request.text or not request.text.strip():
        raise HTTPException(
            status_code=400,
            detail="Text prompt cannot be empty"
        )

    try:
        result = query_ollama(prompt=request.text)
        response_text = result.get("response", "")
        model_used = result.get("model", OLLAMA_MODEL)

        return AITestResponse(
            success=True,
            response=response_text,
            model=model_used,
        )
    except OllamaServiceError as err:
        print(f"[Tab Bankruptcy AI] Ollama Error: {err.message}")
        raise HTTPException(
            status_code=err.status_code,
            detail=err.message,
        )
    except Exception as e:
        print(f"[Tab Bankruptcy AI] Unexpected Error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"AI inference error: {str(e)}",
        )


@app.post("/api/sessions/{session_id}/categorize", response_model=CategorizeSessionResponse)
async def categorize_session_tabs(session_id: str, force: bool = False):
    """
    Categorizes tabs in a session using the local Qwen model via Ollama.
    Processes tabs in batches of 10, validates against allowed categories,
    updates SQLite database, and returns categorized tabs.
    Skips tabs that already have a category unless force=True.
    """
    # 1. Verify session exists
    session = fetch_session_by_id(session_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session with ID '{session_id}' not found",
        )

    # 2. Fetch raw tabs with SQLite primary key 'id'
    raw_tabs = fetch_raw_tabs_for_session(session_id)
    if not raw_tabs:
        return CategorizeSessionResponse(
            success=True,
            sessionId=session_id,
            categorizedCount=0,
            tabs=[],
        )

    # 3. Determine which tabs need categorization
    tabs_to_process = [t for t in raw_tabs if force or not t.get("category")]

    if not tabs_to_process:
        print(
            f"[Tab Bankruptcy AI] All {len(raw_tabs)} tabs for session '{session_id}' "
            f"already categorized. Skipping AI inference."
        )
        return CategorizeSessionResponse(
            success=True,
            sessionId=session_id,
            categorizedCount=0,
            tabs=[
                CategorizedTabItem(
                    id=t.get("tab_id") if t.get("tab_id") is not None else t.get("id"),
                    title=t.get("title") or "Untitled",
                    url=t.get("url") or "",
                    category=t.get("category") or "Other",
                )
                for t in raw_tabs
            ],
        )

    try:
        # 4. Categorize tabs in batches using Ollama
        categorized_results = categorize_tabs(tabs_to_process, model=OLLAMA_MODEL)

        # 5. Save categories back to SQLite
        tab_updates = [
            (item["category"], item["id"])
            for item in categorized_results
            if item.get("id") is not None
        ]
        update_tabs_categories(tab_updates)

        print(
            f"[Tab Bankruptcy AI] Successfully categorized {len(categorized_results)} tabs "
            f"for session '{session.name}' ({session_id}) in SQLite."
        )

        # Build lookup of updated categories by SQLite row id
        updated_cat_by_id = {item["id"]: item["category"] for item in categorized_results if item.get("id") is not None}

        final_tab_items = []
        for t in raw_tabs:
            cat = updated_cat_by_id.get(t["id"], t.get("category")) or "Other"
            final_tab_items.append(
                CategorizedTabItem(
                    id=t.get("tab_id") if t.get("tab_id") is not None else t.get("id"),
                    title=t.get("title") or "Untitled",
                    url=t.get("url") or "",
                    category=cat,
                )
            )

        return CategorizeSessionResponse(
            success=True,
            sessionId=session_id,
            categorizedCount=len(categorized_results),
            tabs=final_tab_items,
        )
    except OllamaServiceError as err:
        print(f"[Tab Bankruptcy AI] Ollama Error: {err.message}")
        raise HTTPException(
            status_code=err.status_code,
            detail=err.message,
        )
    except Exception as e:
        print(f"[Tab Bankruptcy AI] Error categorizing session '{session_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to categorize tabs: {str(e)}",
        )


@app.post("/api/sessions/{session_id}/summarize", response_model=SummarizeSessionResponse)
async def summarize_session_tabs(session_id: str, force: bool = False):
    """
    Generates a concise 1-sentence AI summary for each tab in a session using local Qwen.
    Processes tabs in batches of 10, cleans output, updates SQLite, and returns tabs.
    Skips tabs that already have a summary unless force=True.
    """
    # 1. Verify session exists
    session = fetch_session_by_id(session_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session with ID '{session_id}' not found",
        )

    # 2. Fetch raw tabs with SQLite primary key 'id'
    raw_tabs = fetch_raw_tabs_for_session(session_id)
    if not raw_tabs:
        return SummarizeSessionResponse(
            success=True,
            sessionId=session_id,
            summarizedCount=0,
            tabs=[],
        )

    # 3. Determine which tabs need summaries
    tabs_to_process = [t for t in raw_tabs if force or not t.get("summary")]

    if not tabs_to_process:
        print(
            f"[Tab Bankruptcy AI] All {len(raw_tabs)} tabs for session '{session_id}' "
            f"already summarized. Skipping AI inference."
        )
        return SummarizeSessionResponse(
            success=True,
            sessionId=session_id,
            summarizedCount=0,
            tabs=[
                SummarizedTabItem(
                    id=t.get("tab_id") if t.get("tab_id") is not None else t.get("id"),
                    title=t.get("title") or "Untitled",
                    url=t.get("url") or "",
                    summary=t.get("summary") or "No summary available for this tab.",
                )
                for t in raw_tabs
            ],
        )

    try:
        # 4. Summarize tabs in batches using Ollama
        summarized_results = summarize_tabs(tabs_to_process, model=OLLAMA_MODEL)

        # 5. Save summaries back to SQLite
        tab_updates = [
            (item["summary"], item["id"])
            for item in summarized_results
            if item.get("id") is not None
        ]
        update_tabs_summaries(tab_updates)

        print(
            f"[Tab Bankruptcy AI] Successfully summarized {len(summarized_results)} tabs "
            f"for session '{session.name}' ({session_id}) in SQLite."
        )

        # Build lookup of updated summaries by SQLite row id
        updated_summary_by_id = {item["id"]: item["summary"] for item in summarized_results if item.get("id") is not None}

        final_tab_items = []
        for t in raw_tabs:
            summary = updated_summary_by_id.get(t["id"], t.get("summary")) or "No summary available for this tab."
            final_tab_items.append(
                SummarizedTabItem(
                    id=t.get("tab_id") if t.get("tab_id") is not None else t.get("id"),
                    title=t.get("title") or "Untitled",
                    url=t.get("url") or "",
                    summary=summary,
                )
            )

        return SummarizeSessionResponse(
            success=True,
            sessionId=session_id,
            summarizedCount=len(summarized_results),
            tabs=final_tab_items,
        )
    except OllamaServiceError as err:
        print(f"[Tab Bankruptcy AI] Ollama Error: {err.message}")
        raise HTTPException(
            status_code=err.status_code,
            detail=err.message,
        )
    except Exception as e:
        print(f"[Tab Bankruptcy AI] Error summarizing session '{session_id}': {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to summarize tabs: {str(e)}",
        )


# ==============================================================================
# Restore Session Endpoints (Step 8)
# ==============================================================================

@app.post("/api/sessions/{session_id}/restore", response_model=RestoreJobResponse)
async def restore_session(session_id: str):
    """
    Creates a pending restore job for the session.
    The Chrome extension polls for pending jobs and performs the actual tab restoration.
    Returns immediately with the job ID — restoration happens asynchronously.
    Prevents duplicate restore jobs for the same session.
    """
    # 1. Verify session exists
    session = fetch_session_by_id(session_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{session_id}' not found",
        )

    # 2. Prevent duplicate jobs (double-click protection)
    existing_job = get_active_restore_job_for_session(session_id)
    if existing_job:
        print(
            f"[Tab Bankruptcy Restore] Active restore job already exists for session '{session_id}': "
            f"{existing_job['id']} (status: {existing_job['status']})"
        )
        return RestoreJobResponse(
            success=True,
            jobId=existing_job["id"],
            status=existing_job["status"],
        )

    # 3. Create a new pending restore job
    job_id = create_restore_job(session_id)
    print(
        f"[Tab Bankruptcy Restore] Created restore job '{job_id}' for session '{session_id}' "
        f"({session.tabCount} tabs across {session.windowCount} windows)."
    )

    return RestoreJobResponse(
        success=True,
        jobId=job_id,
        status="pending",
    )


@app.get("/api/restore-jobs/pending", response_model=PendingRestoreJobPayload)
async def get_pending_restore_job_for_extension():
    """
    Polled by the Chrome extension every 2-3 seconds.
    Returns the oldest pending restore job along with the full session tab data.
    If no pending job exists, returns hasPendingJob=False.
    """
    job = get_pending_restore_job()
    if not job:
        return PendingRestoreJobPayload(hasPendingJob=False)

    # Mark job as processing immediately so subsequent polls don't double-pick it
    update_restore_job_status(job["id"], "processing")

    # Fetch the session tabs
    session = fetch_session_by_id(job["session_id"])
    if not session:
        # Session deleted after job was created — mark failed
        update_restore_job_status(
            job["id"],
            "failed",
            error_message=f"Session '{job['session_id']}' no longer exists",
        )
        return PendingRestoreJobPayload(hasPendingJob=False)

    print(
        f"[Tab Bankruptcy Restore] Extension picked up job '{job['id']}' "
        f"for session '{session.name}' ({len(session.tabs)} tabs)."
    )

    return PendingRestoreJobPayload(
        hasPendingJob=True,
        jobId=job["id"],
        sessionId=job["session_id"],
        tabs=session.tabs,
    )


@app.get("/api/restore-jobs/{job_id}", response_model=RestoreJobStatusResponse)
async def get_restore_job_status(job_id: str):
    """
    Returns the current status of a restore job.
    Used by the React dashboard to poll for completion.
    """
    import json

    job = get_restore_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Restore job '{job_id}' not found")

    skipped_reasons = None
    if job.get("skipped_reasons"):
        try:
            raw = json.loads(job["skipped_reasons"])
            skipped_reasons = [SkippedTabReason(url=r["url"], reason=r["reason"]) for r in raw]
        except Exception:
            skipped_reasons = None

    return RestoreJobStatusResponse(
        success=True,
        jobId=job["id"],
        status=job["status"],
        restoredTabs=job.get("restored_tabs"),
        restoredWindows=job.get("restored_windows"),
        skippedTabs=job.get("skipped_tabs"),
        skippedReasons=skipped_reasons,
        errorMessage=job.get("error_message"),
    )


@app.post("/api/restore-jobs/{job_id}/complete")
async def complete_restore_job(job_id: str, result: CompleteRestoreJobRequest):
    """
    Called by the Chrome extension once it has finished (or failed) the restoration.
    Updates the job status in SQLite with final counts and any skipped tab details.
    """
    import json

    job = get_restore_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Restore job '{job_id}' not found")

    skipped_json = None
    if result.skippedReasons:
        try:
            skipped_json = json.dumps(result.skippedReasons)
        except Exception:
            skipped_json = None

    final_status = "completed" if not result.errorMessage else "failed"
    update_restore_job_status(
        job_id,
        final_status,
        restored_tabs=result.restoredTabs,
        restored_windows=result.restoredWindows,
        skipped_tabs=result.skippedTabs,
        skipped_reasons=skipped_json,
        error_message=result.errorMessage,
    )

    print(
        f"[Tab Bankruptcy Restore] Job '{job_id}' marked {final_status}: "
        f"{result.restoredTabs} restored, {result.skippedTabs} skipped."
    )

    return {"success": True, "jobId": job_id, "status": final_status}
