from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field


class StashedTab(BaseModel):
    id: Optional[int] = None
    windowId: int
    windowIndex: int
    tabIndex: int
    title: str
    url: str
    favIconUrl: Optional[str] = None
    pinned: bool = False
    category: Optional[str] = None
    summary: Optional[str] = None


class TabSession(BaseModel):
    id: str
    name: str
    createdAt: str
    windowCount: int
    tabCount: int
    tabs: List[StashedTab] = Field(default_factory=list)


class SessionSummary(BaseModel):
    id: str
    name: str
    createdAt: str
    windowCount: int
    tabCount: int


class SessionCreateResponse(BaseModel):
    success: bool
    message: str
    sessionId: str
    tabCount: int
    windowCount: int


class SessionListResponse(BaseModel):
    success: bool
    sessions: List[SessionSummary]


class SessionDetailResponse(BaseModel):
    success: bool
    session: TabSession


class AITestRequest(BaseModel):
    text: str


class AITestResponse(BaseModel):
    success: bool
    response: Optional[str] = None
    error: Optional[str] = None
    model: Optional[str] = None


class CategorizedTabItem(BaseModel):
    id: Optional[int] = None
    title: str
    url: str
    category: str


class CategorizeSessionResponse(BaseModel):
    success: bool
    sessionId: str
    categorizedCount: int
    tabs: List[CategorizedTabItem]


class SummarizedTabItem(BaseModel):
    id: Optional[int] = None
    title: str
    url: str
    summary: str


class SummarizeSessionResponse(BaseModel):
    success: bool
    sessionId: str
    summarizedCount: int
    tabs: List[SummarizedTabItem]


# ──────────────────────────────────────────────
# Restore Job Schemas (Step 8)
# ──────────────────────────────────────────────

class SkippedTabReason(BaseModel):
    url: str
    reason: str


class RestoreJobResponse(BaseModel):
    """Returned when a restore job is created (POST /api/sessions/{id}/restore)."""
    success: bool
    jobId: str
    status: str  # 'pending' | 'processing' | 'completed' | 'failed'


class RestoreJobStatusResponse(BaseModel):
    """Returned when querying a job (GET /api/restore-jobs/{job_id})."""
    success: bool
    jobId: str
    status: str
    restoredTabs: Optional[int] = None
    restoredWindows: Optional[int] = None
    skippedTabs: Optional[int] = None
    skippedReasons: Optional[List[SkippedTabReason]] = None
    errorMessage: Optional[str] = None


class PendingRestoreJobPayload(BaseModel):
    """Returned to the Chrome extension when it polls for pending restore jobs."""
    hasPendingJob: bool
    jobId: Optional[str] = None
    sessionId: Optional[str] = None
    tabs: Optional[List[StashedTab]] = None


class CompleteRestoreJobRequest(BaseModel):
    """Sent by the Chrome extension to mark a job as completed."""
    restoredTabs: int = 0
    restoredWindows: int = 0
    skippedTabs: int = 0
    skippedReasons: Optional[List[Dict[str, Any]]] = None
    errorMessage: Optional[str] = None
