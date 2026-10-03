import { StashedTab, TabSession, SESSIONS_STORAGE_KEY } from '../types';

// DOM Element references
const openTabsCountEl = document.getElementById('openTabsCount') as HTMLSpanElement;
const openWindowsCountEl = document.getElementById('openWindowsCount') as HTMLSpanElement;
const stashBtn = document.getElementById('stashBtn') as HTMLButtonElement;
const statusBanner = document.getElementById('statusBanner') as HTMLDivElement;
const statusIcon = document.getElementById('statusIcon') as HTMLSpanElement;
const statusMessage = document.getElementById('statusMessage') as HTMLSpanElement;
const backendStatusRow = document.getElementById('backendStatusRow') as HTMLDivElement;
const backendStatusIcon = document.getElementById('backendStatusIcon') as HTMLSpanElement;
const backendStatusMessage = document.getElementById('backendStatusMessage') as HTMLSpanElement;
const tabListEl = document.getElementById('tabList') as HTMLDivElement;
const capturedCountBadge = document.getElementById('capturedCountBadge') as HTMLSpanElement;
const sessionTimeEl = document.getElementById('sessionTime') as HTMLSpanElement;

// Local FastAPI backend endpoint
const BACKEND_URL = 'http://127.0.0.1:8000/api/sessions';

/**
 * Sends a captured session to the local FastAPI backend.
 * Gracefully returns false if the backend is not running or unreachable.
 */
async function sendSessionToBackend(session: TabSession): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const response = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(session),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`Backend responded with HTTP status ${response.status}`);
      return false;
    }

    const data = await response.json();
    return Boolean(data && data.success);
  } catch (err) {
    console.warn('Local FastAPI backend is not reachable:', err);
    return false;
  }
}

/**
 * Checks if a URL belongs to internal browser pages that cannot be accessed or restored.
 * Excludes chrome://, chrome-extension://, devtools://, and edge:// pages.
 */
function isInternalPage(url?: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase().trim();
  return (
    lower.startsWith('chrome://') ||
    lower.startsWith('chrome-extension://') ||
    lower.startsWith('devtools://') ||
    lower.startsWith('edge://') ||
    lower.startsWith('view-source:chrome://')
  );
}

/**
 * Escapes plain text for safe insertion into HTML.
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Extracts a simplified hostname from a URL for clean display.
 */
function formatUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    return parsed.hostname + (parsed.pathname !== '/' ? parsed.pathname : '');
  } catch {
    return rawUrl;
  }
}

/**
 * Renders the list of stashed tabs inside the popup scroll container.
 */
function renderTabList(tabs: StashedTab[]): void {
  tabListEl.innerHTML = '';
  capturedCountBadge.textContent = tabs.length.toString();

  if (tabs.length === 0) {
    tabListEl.innerHTML = `
      <div class="empty-state" id="emptyState">
        <p>No tabs captured yet.</p>
        <span class="empty-hint">Click "Stash All Tabs" to capture all windows.</span>
      </div>
    `;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const tab of tabs) {
    const item = document.createElement('div');
    item.className = 'tab-item';

    const safeTitle = escapeHtml(tab.title || 'Untitled Tab');
    const safeUrl = escapeHtml(formatUrl(tab.url));
    const fullUrl = escapeHtml(tab.url);

    // Favicon handling: Show favicon img if present, fallback to icon if it fails to load or is missing
    const hasFavicon = Boolean(tab.favIconUrl && !isInternalPage(tab.favIconUrl));
    const faviconHtml = hasFavicon
      ? `<img class="tab-favicon" src="${escapeHtml(tab.favIconUrl!)}" alt="" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" /><span class="tab-favicon-fallback" style="display:none;">🌐</span>`
      : `<span class="tab-favicon-fallback">🌐</span>`;

    // Window and index badges
    const windowBadge = `<span class="tab-meta-badge" title="Window ${tab.windowIndex + 1}, Tab ${tab.tabIndex + 1}">W${tab.windowIndex + 1}·T${tab.tabIndex + 1}</span>`;
    const pinnedBadge = tab.pinned ? `<span class="tab-meta-badge pinned" title="Pinned tab">📌 Pinned</span>` : '';

    item.innerHTML = `
      ${faviconHtml}
      <div class="tab-details">
        <div class="tab-title-row">
          <span class="tab-title" title="${safeTitle}">${safeTitle}</span>
          ${pinnedBadge}
          ${windowBadge}
        </div>
        <span class="tab-url" title="${fullUrl}">${safeUrl}</span>
      </div>
    `;

    fragment.appendChild(item);
  }

  tabListEl.appendChild(fragment);
}

/**
 * Queries current open windows and tabs using the Chrome Tabs & Windows APIs
 * and updates live count indicators in the popup header.
 */
async function refreshCurrentStats(): Promise<void> {
  try {
    // chrome.windows.getAll with populate: true retrieves all windows with their tabs
    const windows = await chrome.windows.getAll({ populate: true });
    let totalTabs = 0;

    for (const win of windows) {
      if (win.tabs) {
        totalTabs += win.tabs.length;
      }
    }

    openTabsCountEl.textContent = totalTabs.toString();
    openWindowsCountEl.textContent = windows.length.toString();
  } catch (err) {
    console.error('Failed to query open windows:', err);
    openTabsCountEl.textContent = '?';
    openWindowsCountEl.textContent = '?';
  }
}

/**
 * Loads previous sessions from chrome.storage.local to restore captured tabs list
 * when the popup is reopened.
 */
async function loadStoredSessions(): Promise<void> {
  try {
    const result = await chrome.storage.local.get([SESSIONS_STORAGE_KEY]);
    const sessions: TabSession[] = Array.isArray(result[SESSIONS_STORAGE_KEY])
      ? result[SESSIONS_STORAGE_KEY]
      : [];

    if (sessions.length > 0) {
      const latestSession = sessions[0];
      renderTabList(latestSession.tabs);

      const date = new Date(latestSession.createdAt);
      sessionTimeEl.textContent = `Last stashed ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

      statusIcon.textContent = '✓';
      statusMessage.textContent = `${latestSession.tabCount} tabs previously stashed locally`;
      backendStatusRow.style.display = 'none';
      statusBanner.classList.remove('hidden');
    }
  } catch (err) {
    console.error('Failed to load sessions from chrome.storage.local:', err);
  }
}

/**
 * Main action: Retrieves all tabs from all open Chrome windows,
 * extracts required fields, ignores internal pages, saves the session
 * to chrome.storage.local, sends to local FastAPI backend, and displays
 * captured tabs and connection status in the popup.
 */
async function handleStashAllTabs(): Promise<void> {
  stashBtn.disabled = true;
  const originalBtnText = stashBtn.innerHTML;
  stashBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Stashing Tabs...</span>';

  try {
    // 1. Retrieve all windows with their tabs across all Chrome windows
    // populate: true includes the array of Tab objects for each window
    const windows = await chrome.windows.getAll({ populate: true });

    const stashedTabs: StashedTab[] = [];
    let capturedWindowsCount = 0;

    // 2. Iterate through windows preserving original order
    for (let winIndex = 0; winIndex < windows.length; winIndex++) {
      const win = windows[winIndex];
      const tabs = win.tabs || [];
      let windowHasCapturedTab = false;

      // Iterate through tabs preserving original index ordering
      for (let tabIndex = 0; tabIndex < tabs.length; tabIndex++) {
        const tab = tabs[tabIndex];
        const url = tab.url || tab.pendingUrl || '';

        // 3. Ignore Chrome internal pages (e.g. chrome://, chrome-extension://)
        if (isInternalPage(url)) {
          continue;
        }

        // Gracefully handle missing or inaccessible titles/urls
        const title = tab.title && tab.title.trim().length > 0 ? tab.title : (url || 'Untitled Tab');

        stashedTabs.push({
          id: tab.id,
          windowId: win.id ?? 0,
          windowIndex: winIndex,
          tabIndex: tab.index ?? tabIndex,
          title: title,
          url: url,
          favIconUrl: tab.favIconUrl,
          pinned: Boolean(tab.pinned),
        });

        windowHasCapturedTab = true;
      }

      if (windowHasCapturedTab) {
        capturedWindowsCount++;
      }
    }

    // 4. Create session data structure
    const now = new Date();
    const newSession: TabSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      name: `Session ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      createdAt: now.toISOString(),
      windowCount: capturedWindowsCount,
      tabCount: stashedTabs.length,
      tabs: stashedTabs,
    };

    // 5. Store session in chrome.storage.local
    const stored = await chrome.storage.local.get([SESSIONS_STORAGE_KEY]);
    const existingSessions: TabSession[] = Array.isArray(stored[SESSIONS_STORAGE_KEY])
      ? stored[SESSIONS_STORAGE_KEY]
      : [];

    const updatedSessions = [newSession, ...existingSessions];
    await chrome.storage.local.set({ [SESSIONS_STORAGE_KEY]: updatedSessions });

    // 6. Send session to local FastAPI backend
    const backendConnected = await sendSessionToBackend(newSession);

    // 7. Update UI status display
    backendStatusRow.style.display = 'flex';
    statusIcon.textContent = '✓';

    if (backendConnected) {
      statusMessage.textContent = 'Tabs stashed successfully';
      backendStatusRow.className = 'status-row';
      backendStatusIcon.textContent = '✓';
      backendStatusMessage.textContent = 'Backend connected';
    } else {
      statusMessage.textContent = 'Tabs stashed locally';
      backendStatusRow.className = 'status-row warning';
      backendStatusIcon.textContent = '⚠';
      backendStatusMessage.textContent = 'Backend is not running';
    }
    statusBanner.classList.remove('hidden');

    sessionTimeEl.textContent = `Just now (${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;

    // 8. Render captured tabs below the button
    renderTabList(stashedTabs);

    // Refresh live stats
    await refreshCurrentStats();
  } catch (err) {
    console.error('Error during stash operation:', err);
    statusMessage.textContent = 'Failed to stash tabs. Check extension console.';
    statusBanner.classList.remove('hidden');
  } finally {
    stashBtn.disabled = false;
    stashBtn.innerHTML = originalBtnText;
  }
}

// Initialise event listeners and load data when the popup opens
document.addEventListener('DOMContentLoaded', () => {
  stashBtn.addEventListener('click', handleStashAllTabs);
  void refreshCurrentStats();
  void loadStoredSessions();
});
