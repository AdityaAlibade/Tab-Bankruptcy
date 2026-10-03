import {
  SessionSummary,
  TabSession,
  SessionListResponse,
  SessionDetailResponse,
  CategorizeSessionResponse,
  SummarizeSessionResponse,
  RestoreJobResponse,
  RestoreJobStatusResponse,
} from './types';

const API_BASE_URL = 'http://127.0.0.1:8000';

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Fetches all saved session summaries from the FastAPI backend.
 */
export async function fetchSessions(): Promise<SessionSummary[]> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${API_BASE_URL}/api/sessions`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new ApiError(`Server responded with status ${response.status}`, response.status);
    }

    const data: SessionListResponse = await response.json();
    if (!data.success || !Array.isArray(data.sessions)) {
      throw new ApiError('Invalid response format received from backend');
    }

    return data.sessions;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out connecting to backend server');
    }
    throw new ApiError('Cannot connect to Tab Bankruptcy backend. Make sure FastAPI is running on http://127.0.0.1:8000');
  }
}

/**
 * Fetches details and tabs for a specific session by ID.
 */
export async function fetchSessionDetail(sessionId: string): Promise<TabSession> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${API_BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        throw new ApiError(`Session '${sessionId}' was not found.`, 404);
      }
      throw new ApiError(`Server responded with status ${response.status}`, response.status);
    }

    const data: SessionDetailResponse = await response.json();
    if (!data.success || !data.session) {
      throw new ApiError('Invalid session detail format received from backend');
    }

    return data.session;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out connecting to backend server');
    }
    throw new ApiError('Cannot connect to Tab Bankruptcy backend. Make sure FastAPI is running on http://127.0.0.1:8000');
  }
}

/**
 * Sends a test prompt to the backend AI endpoint (POST /api/ai/test),
 * which invokes the local Ollama instance.
 */
export async function testLocalAI(text: string): Promise<{ success: boolean; response: string; model?: string }> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 65000); // 65s timeout for local model inference

    const response = await fetch(`${API_BASE_URL}/api/ai/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(data.detail || `AI test failed with status ${response.status}`, response.status);
    }

    return {
      success: true,
      response: data.response || '',
      model: data.model,
    };
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('AI test timed out. Local model took too long to respond.');
    }
    throw new ApiError('Cannot connect to Tab Bankruptcy backend. Make sure FastAPI is running on http://127.0.0.1:8000');
  }
}

/**
 * Triggers batch AI categorization for all tabs in a session via the backend.
 */
export async function categorizeSession(sessionId: string, force: boolean = false): Promise<CategorizeSessionResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3m timeout for local inference

    const url = `${API_BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}/categorize${force ? '?force=true' : ''}`;
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(data.detail || `Categorization failed with status ${response.status}`, response.status);
    }

    return data;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('AI categorization timed out. Local model took too long to complete.');
    }
    throw new ApiError('Cannot connect to Tab Bankruptcy backend. Make sure FastAPI is running on http://127.0.0.1:8000');
  }
}

/**
 * Triggers batch AI summarization for all tabs in a session via the backend.
 */
export async function summarizeSession(sessionId: string, force: boolean = false): Promise<SummarizeSessionResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000); // 3m timeout for local inference

    const url = `${API_BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}/summarize${force ? '?force=true' : ''}`;
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(data.detail || `Summarization failed with status ${response.status}`, response.status);
    }

    return data;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('AI summarization timed out. Local model took too long to complete.');
    }
    throw new ApiError('Cannot connect to Tab Bankruptcy backend. Make sure FastAPI is running on http://127.0.0.1:8000');
  }
}

/**
 * Creates a restore job for a session.
 * Returns immediately with a job ID — restoration is performed asynchronously by the extension.
 */
export async function restoreSession(sessionId: string): Promise<RestoreJobResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(
      `${API_BASE_URL}/api/sessions/${encodeURIComponent(sessionId)}/restore`,
      { method: 'POST', signal: controller.signal }
    );
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(data.detail || `Restore request failed with status ${response.status}`, response.status);
    }
    return data as RestoreJobResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Request timed out connecting to backend server');
    }
    throw new ApiError('Cannot connect to Tab Bankruptcy backend. Make sure FastAPI is running on http://127.0.0.1:8000');
  }
}

/**
 * Polls for the current status of a restore job.
 * Call repeatedly until status is 'completed' or 'failed'.
 */
export async function pollRestoreJobStatus(jobId: string): Promise<RestoreJobStatusResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(
      `${API_BASE_URL}/api/restore-jobs/${encodeURIComponent(jobId)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(data.detail || `Status poll failed with status ${response.status}`, response.status);
    }
    return data as RestoreJobStatusResponse;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Status poll timed out');
    }
    throw new ApiError('Cannot connect to Tab Bankruptcy backend. Make sure FastAPI is running on http://127.0.0.1:8000');
  }
}

