export interface StashedTab {
  id?: number;
  windowId: number;
  windowIndex: number;
  tabIndex: number;
  title: string;
  url: string;
  favIconUrl?: string;
  pinned: boolean;
  category?: string | null;
  summary?: string | null;
}

export interface SessionSummary {
  id: string;
  name: string;
  createdAt: string;
  windowCount: number;
  tabCount: number;
}

export interface TabSession {
  id: string;
  name: string;
  createdAt: string;
  windowCount: number;
  tabCount: number;
  tabs: StashedTab[];
}

export interface SessionListResponse {
  success: boolean;
  sessions: SessionSummary[];
}

export interface SessionDetailResponse {
  success: boolean;
  session: TabSession;
}

export interface AITestRequest {
  text: string;
}

export interface AITestResponse {
  success: boolean;
  response?: string;
  error?: string;
  model?: string;
}

export interface CategorizedTabItem {
  id?: number;
  title: string;
  url: string;
  category: string;
}

export interface CategorizeSessionResponse {
  success: boolean;
  sessionId: string;
  categorizedCount: number;
  tabs: CategorizedTabItem[];
}

export interface SummarizedTabItem {
  id?: number;
  title: string;
  url: string;
  summary: string;
}

export interface SummarizeSessionResponse {
  success: boolean;
  sessionId: string;
  summarizedCount: number;
  tabs: SummarizedTabItem[];
}

// ──────────────────────────────────────────────
// Restore Job Types (Step 8)
// ──────────────────────────────────────────────

export interface SkippedTabReason {
  url: string;
  reason: string;
}

export interface RestoreJobResponse {
  success: boolean;
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface RestoreJobStatusResponse {
  success: boolean;
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  restoredTabs?: number;
  restoredWindows?: number;
  skippedTabs?: number;
  skippedReasons?: SkippedTabReason[];
  errorMessage?: string;
}
