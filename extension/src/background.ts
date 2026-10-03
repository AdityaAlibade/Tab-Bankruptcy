/**
 * Tab Bankruptcy \u2014 Background Service Worker (Step 8)
 *
 * Polls FastAPI for pending restore jobs and restores tabs/windows using Chrome APIs.
 * Architecture: React Dashboard \u2192 FastAPI \u2192 THIS WORKER \u2192 Chrome Tabs API
 */

const BACKEND_BASE = 'http://127.0.0.1:8000';
const POLL_INTERVAL_MS = 2500; // 2.5 seconds

interface StashedTab {
  id?: number;
  windowId: number;
  windowIndex: number;
  tabIndex: number;
  title: string;
  url: string;
  favIconUrl?: string;
  pinned: boolean;
}

interface PendingJobPayload {
  hasPendingJob: boolean;
  jobId?: string;
  sessionId?: string;
  tabs?: StashedTab[];
}

interface SkippedReason {
  url: string;
  reason: string;
}

/** Returns true if a URL is a Chrome internal page that cannot be restored. */
function isInternalUrl(url: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase().trim();
  return (
    lower.startsWith('chrome://') ||
    lower.startsWith('chrome-extension://') ||
    lower.startsWith('devtools://') ||
    lower.startsWith('edge://') ||
    lower.startsWith('about:') ||
    lower.startsWith('view-source:chrome://')
  );
}

/** Returns true if a URL is syntactically valid and openable. */
function isValidUrl(url: string): boolean {
  if (!url || url.trim() === '') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'file:';
  } catch {
    return false;
  }
}

/**
 * Core restoration logic.
 * Groups tabs by windowIndex, then for each group:
 *   1. Creates a new Chrome window navigated to the first valid URL.
 *   2. Creates remaining tabs in tabIndex order.
 *   3. Restores pinned status after tab creation.
 */
async function restoreSession(tabs: StashedTab[]): Promise<{
  restoredTabs: number;
  restoredWindows: number;
  skippedTabs: number;
  skippedReasons: SkippedReason[];
}> {
  let restoredTabs = 0;
  let restoredWindows = 0;
  let skippedTabs = 0;
  const skippedReasons: SkippedReason[] = [];

  // Group tabs by windowIndex
  const windowMap = new Map<number, StashedTab[]>();
  for (const tab of tabs) {
    const winIdx = tab.windowIndex ?? 0;
    if (!windowMap.has(winIdx)) {
      windowMap.set(winIdx, []);
    }
    windowMap.get(winIdx)!.push(tab);
  }

  // Sort each window's tabs by tabIndex
  for (const [, winTabs] of windowMap) {
    winTabs.sort((a, b) => (a.tabIndex ?? 0) - (b.tabIndex ?? 0));
  }

  // Process windows in ascending windowIndex order
  const sortedWindowIndices = Array.from(windowMap.keys()).sort((a, b) => a - b);

  for (const winIdx of sortedWindowIndices) {
    const winTabs = windowMap.get(winIdx)!;

    // Filter out unsupported tabs
    const openableTabs: StashedTab[] = [];
    for (const tab of winTabs) {
      if (isInternalUrl(tab.url)) {
        skippedTabs++;
        skippedReasons.push({ url: tab.url, reason: 'Chrome internal page cannot be restored' });
        continue;
      }
      if (!isValidUrl(tab.url)) {
        skippedTabs++;
        skippedReasons.push({ url: tab.url, reason: 'Invalid or unsupported URL' });
        continue;
      }
      openableTabs.push(tab);
    }

    if (openableTabs.length === 0) {
      // All tabs in this window were invalid \u2014 no window needed
      continue;
    }

    const firstTab = openableTabs[0];
    const remainingTabs = openableTabs.slice(1);

    let newWindow: chrome.windows.Window;
    try {
      // Chrome creates a default blank tab; we navigate it to the first URL
      newWindow = await chrome.windows.create({
        url: firstTab.url,
        focused: false,
      });
      restoredWindows++;
    } catch (err) {
      console.error(`[Tab Bankruptcy Restore] Failed to create window for windowIndex ${winIdx}:`, err);
      for (const tab of openableTabs) {
        skippedTabs++;
        skippedReasons.push({ url: tab.url, reason: `Window creation failed: ${String(err)}` });
      }
      continue;
    }

    // Apply pinned status to first tab if needed
    if (firstTab.pinned && newWindow.tabs && newWindow.tabs[0]?.id !== undefined) {
      try {
        await chrome.tabs.update(newWindow.tabs[0].id!, { pinned: true });
      } catch { /* non-fatal */ }
    }
    restoredTabs++;

    // Create remaining tabs in this window
    for (const tab of remainingTabs) {
      try {
        const createdTab = await chrome.tabs.create({
          windowId: newWindow.id,
          url: tab.url,
          active: false,
        });
        if (tab.pinned && createdTab.id !== undefined) {
          try {
            await chrome.tabs.update(createdTab.id, { pinned: true });
          } catch { /* non-fatal */ }
        }
        restoredTabs++;
      } catch (err) {
        console.error(`[Tab Bankruptcy Restore] Failed to create tab '${tab.url}':`, err);
        skippedTabs++;
        skippedReasons.push({ url: tab.url, reason: `Tab creation failed: ${String(err)}` });
      }
    }
  }

  return { restoredTabs, restoredWindows, skippedTabs, skippedReasons };
}

/** Reports job result back to FastAPI. */
async function reportJobComplete(
  jobId: string,
  restoredTabs: number,
  restoredWindows: number,
  skippedTabs: number,
  skippedReasons: SkippedReason[],
  errorMessage?: string
): Promise<void> {
  try {
    await fetch(`${BACKEND_BASE}/api/restore-jobs/${jobId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restoredTabs,
        restoredWindows,
        skippedTabs,
        skippedReasons: skippedReasons.length > 0 ? skippedReasons : null,
        errorMessage: errorMessage ?? null,
      }),
    });
  } catch (err) {
    console.error(`[Tab Bankruptcy Restore] Failed to report job '${jobId}' completion:`, err);
  }
}

/** Single poll cycle: check for a pending job and process it if found. */
async function pollForRestoreJob(): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${BACKEND_BASE}/api/restore-jobs/pending`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) return; // Backend offline or error \u2014 retry next cycle

    const payload: PendingJobPayload = await response.json();
    if (!payload.hasPendingJob || !payload.jobId || !payload.tabs) return;

    const { jobId, tabs } = payload;
    console.log(`[Tab Bankruptcy Restore] Job '${jobId}': restoring ${tabs.length} tabs...`);

    try {
      const result = await restoreSession(tabs);
      console.log(
        `[Tab Bankruptcy Restore] Job '${jobId}' done: ` +
        `${result.restoredTabs} restored, ${result.skippedTabs} skipped across ${result.restoredWindows} windows.`
      );
      await reportJobComplete(jobId, result.restoredTabs, result.restoredWindows, result.skippedTabs, result.skippedReasons);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Tab Bankruptcy Restore] Job '${jobId}' failed:`, err);
      await reportJobComplete(jobId, 0, 0, tabs.length, [], msg);
    }
  } catch {
    // Network error or backend offline \u2014 silent fail, retry next interval
  }
}

// Start polling every 2.5 seconds
setInterval(() => { void pollForRestoreJob(); }, POLL_INTERVAL_MS);
console.log('[Tab Bankruptcy] Background service worker active. Polling for restore jobs every 2.5s.');
