import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { TabSession, StashedTab, RestoreJobStatusResponse } from '../types';
import { categorizeSession, summarizeSession, restoreSession, pollRestoreJobStatus } from '../api';

interface TabListProps {
  session: TabSession;
  onBack: () => void;
  onSessionUpdated?: (updated: TabSession) => void;
}

/**
 * Text highlighter for search query matches in title or summary.
 */
const Highlight: React.FC<{ text: string; query: string }> = ({ text, query }) => {
  if (!query.trim() || !text) return <>{text}</>;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.trim().toLowerCase() ? (
          <mark key={i} className="search-highlight">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
};

export const TabList: React.FC<TabListProps> = ({ session, onBack, onSessionUpdated }) => {
  const [tabs, setTabs] = useState<StashedTab[]>(session.tabs);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // AI Categorization states
  const [isCategorizing, setIsCategorizing] = useState<boolean>(false);
  const [categorizeMessage, setCategorizeMessage] = useState<string | null>(null);
  const [categorizeError, setCategorizeError] = useState<string | null>(null);

  // AI Summarization states
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const [summarizeMessage, setSummarizeMessage] = useState<string | null>(null);
  const [summarizeError, setSummarizeError] = useState<string | null>(null);

  // Restore Session states
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreJobId, setRestoreJobId] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<RestoreJobStatusResponse | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clear polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Sync internal tabs when session prop changes
  useEffect(() => {
    setTabs(session.tabs);
  }, [session.tabs]);

  const formattedDate = (() => {
    try {
      const date = new Date(session.createdAt);
      if (isNaN(date.getTime())) return session.createdAt;
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return session.createdAt;
    }
  })();

  // Compute category counts from current tabs
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tabs.forEach((tab) => {
      const cat = tab.category || 'Uncategorized';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [tabs]);

  // Sorted list of categories present in this session
  const sortedCategories = useMemo(() => {
    return Object.keys(categoryCounts).sort((a, b) => categoryCounts[b] - categoryCounts[a]);
  }, [categoryCounts]);

  const categorizedTabsCount = useMemo(() => {
    return tabs.filter((t) => Boolean(t.category)).length;
  }, [tabs]);

  const summarizedTabsCount = useMemo(() => {
    return tabs.filter((t) => Boolean(t.summary)).length;
  }, [tabs]);

  const allSummarized = summarizedTabsCount === tabs.length && tabs.length > 0;

  // Filter tabs client-side based on Category + Search Query (Title, URL, Category, Summary)
  const filteredTabs = useMemo(() => {
    return tabs.filter((tab) => {
      // 1. Category filter
      if (selectedCategory !== 'All') {
        const tabCat = tab.category || 'Uncategorized';
        if (tabCat !== selectedCategory) return false;
      }

      // 2. Text search filter (Title, URL, Category, Summary)
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;

      const titleMatch = (tab.title || '').toLowerCase().includes(query);
      const urlMatch = (tab.url || '').toLowerCase().includes(query);
      const catMatch = (tab.category || '').toLowerCase().includes(query);
      const summaryMatch = (tab.summary || '').toLowerCase().includes(query);

      return titleMatch || urlMatch || catMatch || summaryMatch;
    });
  }, [tabs, selectedCategory, searchQuery]);

  const handleOpenTab = (url: string) => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // AI Categorization action handler
  const handleCategorize = async (force: boolean = false) => {
    setIsCategorizing(true);
    setCategorizeError(null);
    setCategorizeMessage('Analyzing tabs with local AI...');

    try {
      const response = await categorizeSession(session.id, force);
      if (response.success && Array.isArray(response.tabs)) {
        const updatedTabs = tabs.map((tab, idx) => {
          const matchingResult = response.tabs[idx] || response.tabs.find((t) => t.url === tab.url);
          return {
            ...tab,
            category: matchingResult?.category || tab.category || 'Other',
          };
        });

        setTabs(updatedTabs);
        if (onSessionUpdated) {
          onSessionUpdated({
            ...session,
            tabs: updatedTabs,
          });
        }

        const count = response.categorizedCount;
        if (count > 0) {
          setCategorizeMessage(`✓ ${count} tabs categorized`);
        } else {
          setCategorizeMessage('✓ All tabs already categorized');
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'AI categorization failed. Check that Ollama is running.';
      setCategorizeError(errMsg);
      setCategorizeMessage(null);
    } finally {
      setIsCategorizing(false);
    }
  };

  // AI Summarization action handler
  const handleSummarize = async (force: boolean = false) => {
    setIsSummarizing(true);
    setSummarizeError(null);
    setSummarizeMessage('Generating AI summaries...');

    try {
      const response = await summarizeSession(session.id, force);
      if (response.success && Array.isArray(response.tabs)) {
        const updatedTabs = tabs.map((tab, idx) => {
          const matchingResult = response.tabs[idx] || response.tabs.find((t) => t.url === tab.url);
          return {
            ...tab,
            summary: matchingResult?.summary || tab.summary || null,
          };
        });

        setTabs(updatedTabs);
        if (onSessionUpdated) {
          onSessionUpdated({
            ...session,
            tabs: updatedTabs,
          });
        }

        const count = response.summarizedCount;
        if (count > 0) {
          setSummarizeMessage(`✓ ${count} summaries generated`);
        } else {
          setSummarizeMessage('✓ All tabs have summaries');
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : 'AI summarization failed. Check that Ollama is running.';
      setSummarizeError(errMsg);
      setSummarizeMessage(null);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Restore Session handler
  const handleRestoreSession = useCallback(async () => {
    if (isRestoring) return; // Double-click guard
    setIsRestoring(true);
    setRestoreError(null);
    setRestoreStatus(null);
    setRestoreJobId(null);

    // Clear any existing poll
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    try {
      const jobResponse = await restoreSession(session.id);
      if (!jobResponse.success) {
        throw new Error('Failed to create restore job');
      }

      const jobId = jobResponse.jobId;
      setRestoreJobId(jobId);

      // If job is already completed (e.g. duplicate job that already ran), handle immediately
      if (jobResponse.status === 'completed') {
        setIsRestoring(false);
        return;
      }
      if (jobResponse.status === 'failed') {
        setRestoreError('Restore job failed.');
        setIsRestoring(false);
        return;
      }

      // Poll for status every 2 seconds (slightly faster than the extension's 2.5s poll)
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusResponse = await pollRestoreJobStatus(jobId);
          setRestoreStatus(statusResponse);

          if (statusResponse.status === 'completed' || statusResponse.status === 'failed') {
            if (pollIntervalRef.current !== null) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            if (statusResponse.status === 'failed') {
              setRestoreError(statusResponse.errorMessage || 'Restoration failed in the Chrome extension.');
            }
            setIsRestoring(false);
          }
        } catch {
          // Polling failure — keep trying
        }
      }, 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to start restore. Check that FastAPI is running.';
      setRestoreError(msg);
      setIsRestoring(false);
    }
  }, [isRestoring, session.id]);

  const tabPlural = session.tabCount === 1 ? 'Tab' : 'Tabs';
  const windowPlural = session.windowCount === 1 ? 'Window' : 'Windows';

  return (
    <section className="session-detail-view">
      {/* Navigation & Header */}
      <div className="detail-navigation">
        <button className="btn-back" onClick={onBack} type="button">
          ← Back to Sessions
        </button>
      </div>

      <div className="detail-summary-card">
        <div className="detail-header-row">
          <div className="detail-title-block">
            <h2 className="detail-session-name">{session.name}</h2>
            <span className="detail-created-badge">{formattedDate}</span>
          </div>

          {/* AI Action Controls */}
          <div className="detail-ai-actions">
            {/* Restore Session Button */}
            <button
              id="restore-session-btn"
              className="btn-restore-session"
              onClick={handleRestoreSession}
              disabled={isRestoring || isCategorizing || isSummarizing}
              type="button"
              title="Reopen all saved tabs in Chrome"
            >
              {isRestoring ? (
                <>
                  <span className="spinner-mini">⏳</span>
                  <span>Restoring session...</span>
                </>
              ) : (
                <>
                  <span>🔁</span>
                  <span>Restore Session</span>
                </>
              )}
            </button>

            {/* Categorization Button */}
            <button
              id="ai-categorize-btn"
              className="btn-categorize-ai"
              onClick={() => handleCategorize(false)}
              disabled={isCategorizing || isSummarizing}
              type="button"
            >
              {isCategorizing ? (
                <>
                  <span className="spinner-mini">⏳</span>
                  <span>Analyzing tabs with local AI...</span>
                </>
              ) : (
                <>
                  <span className="ai-sparkle">✨</span>
                  <span>AI Categorize Tabs</span>
                </>
              )}
            </button>

            {/* Summarization Button */}
            <button
              id="ai-summarize-btn"
              className="btn-summarize-ai"
              onClick={() => handleSummarize(false)}
              disabled={isSummarizing || isCategorizing}
              type="button"
            >
              {isSummarizing ? (
                <>
                  <span className="spinner-mini">⏳</span>
                  <span>Generating AI summaries...</span>
                </>
              ) : allSummarized ? (
                <>
                  <span>✓ All tabs have summaries</span>
                </>
              ) : (
                <>
                  <span className="ai-sparkle">📝</span>
                  <span>Generate Missing Summaries</span>
                </>
              )}
            </button>

            {/* Subtle Re-generate options if content exists */}
            {summarizedTabsCount > 0 && !isSummarizing && (
              <button
                className="btn-recategorize-subtle"
                onClick={() => handleSummarize(true)}
                title="Re-generate summaries for all tabs"
                type="button"
              >
                🔄 Re-summarize
              </button>
            )}
          </div>
        </div>

        {/* Restore Status Banners */}
        {isRestoring && restoreJobId && (
          <div className="restore-banner-progress">
            <span className="spinner-mini">⏳</span>
            <span>Restoring session... (Chrome extension is opening tabs)</span>
          </div>
        )}

        {!isRestoring && restoreStatus?.status === 'completed' && (
          <div className="restore-banner-success">
            <div className="restore-success-main">
              <span>✓ Session restored</span>
            </div>
            <div className="restore-success-detail">
              {restoreStatus.restoredTabs ?? 0} tab{(restoreStatus.restoredTabs ?? 0) !== 1 ? 's' : ''} restored
              {(restoreStatus.restoredWindows ?? 0) > 0 && ` across ${restoreStatus.restoredWindows} window${(restoreStatus.restoredWindows ?? 0) !== 1 ? 's' : ''}`}
              {(restoreStatus.skippedTabs ?? 0) > 0 && (
                <span className="restore-skipped-note">
                  {` · ${restoreStatus.skippedTabs} tab${(restoreStatus.skippedTabs ?? 0) !== 1 ? 's' : ''} skipped`}
                </span>
              )}
            </div>
          </div>
        )}

        {restoreError && (
          <div className="restore-banner-error">
            <div className="restore-error-text">
              <strong>Restore Error:</strong> {restoreError}
            </div>
            <div className="restore-error-hint">
              Make sure the Chrome Extension is installed and Chrome is open.
            </div>
            <button
              className="btn-retry-mini"
              onClick={handleRestoreSession}
              type="button"
              disabled={isRestoring}
            >
              🔄 Retry
            </button>
          </div>
        )}

        {/* Categorization Feedback Banner */}
        {categorizeMessage && (
          <div className="categorize-banner-success">
            <span>{categorizeMessage}</span>
          </div>
        )}

        {categorizeError && (
          <div className="categorize-banner-error">
            <div className="categorize-error-text">
              <strong>Categorization Error:</strong> {categorizeError}
            </div>
            <button
              className="btn-retry-mini"
              onClick={() => handleCategorize(false)}
              type="button"
            >
              🔄 Retry
            </button>
          </div>
        )}

        {/* Summarization Feedback Banner */}
        {summarizeMessage && (
          <div className="summarize-banner-success">
            <span>{summarizeMessage}</span>
          </div>
        )}

        {summarizeError && (
          <div className="categorize-banner-error">
            <div className="categorize-error-text">
              <strong>Summarization Error:</strong> {summarizeError}
            </div>
            <button
              className="btn-retry-mini"
              onClick={() => handleSummarize(false)}
              type="button"
            >
              🔄 Retry
            </button>
          </div>
        )}

        {/* Session-Level Statistics */}
        <div className="detail-stats-row">
          <div className="detail-stat">
            <span className="stat-num">{session.tabCount}</span>
            <span className="stat-desc">Total {tabPlural}</span>
          </div>
          <div className="stat-divider-vertical" />
          <div className="detail-stat">
            <span className="stat-num">{session.windowCount}</span>
            <span className="stat-desc">{windowPlural}</span>
          </div>
          <div className="stat-divider-vertical" />
          <div className="detail-stat">
            <span className="stat-num">{categorizedTabsCount}</span>
            <span className="stat-desc">Categorized</span>
          </div>
          <div className="stat-divider-vertical" />
          <div className="detail-stat">
            <span className="stat-num">{summarizedTabsCount}</span>
            <span className="stat-desc">Summarized</span>
          </div>
        </div>

        {/* Category Summary Badges Section */}
        {categorizedTabsCount > 0 && (
          <div className="category-summary-box">
            <h4 className="category-summary-heading">Categories</h4>
            <div className="category-summary-badges">
              {sortedCategories.map((category) => {
                const count = categoryCounts[category];
                const isActive = selectedCategory === category;
                const catClass = `cat-${category.toLowerCase()}`;

                return (
                  <button
                    key={category}
                    type="button"
                    className={`category-summary-pill ${catClass} ${isActive ? 'pill-active' : ''}`}
                    onClick={() => setSelectedCategory(isActive ? 'All' : category)}
                    title={`Click to filter by ${category}`}
                  >
                    <span className="pill-name">{category}</span>
                    <span className="pill-count">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Filter Bar by Category */}
      {categorizedTabsCount > 0 && (
        <div className="category-filter-toolbar">
          <span className="filter-label">Filter:</span>
          <button
            type="button"
            className={`filter-chip ${selectedCategory === 'All' ? 'chip-active' : ''}`}
            onClick={() => setSelectedCategory('All')}
          >
            All ({tabs.length})
          </button>
          {sortedCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`filter-chip chip-${cat.toLowerCase()} ${selectedCategory === cat ? 'chip-active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat} ({categoryCounts[cat]})
            </button>
          ))}
        </div>
      )}

      {/* Search / Filter Control */}
      <div className="search-bar-wrap">
        <div className="search-input-box">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder={
              selectedCategory !== 'All'
                ? `Search title, URL, summary in ${selectedCategory}...`
                : 'Search tabs by title, URL, category, or summary...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter tabs by title, URL, category, or summary"
          />
          {searchQuery && (
            <button
              className="btn-clear-search"
              onClick={() => setSearchQuery('')}
              type="button"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <div className="filter-status">
          {searchQuery || selectedCategory !== 'All' ? (
            <span>
              Showing {filteredTabs.length} of {tabs.length} tabs
              {selectedCategory !== 'All' && ` (Category: ${selectedCategory})`}
              {searchQuery && ` (Query: "${searchQuery}")`}
            </span>
          ) : (
            <span>{tabs.length} total tabs</span>
          )}
        </div>
      </div>

      {/* Tabs List */}
      <div className="tab-items-container">
        {filteredTabs.length === 0 ? (
          <div className="empty-search-state">
            <div className="empty-state-icon">🔍</div>
            <p className="empty-title">No tabs found.</p>
            <p className="empty-hint">Try a different search term or category.</p>
            <button
              className="btn-clear-filter"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('All');
              }}
              type="button"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filteredTabs.map((tab: StashedTab, index: number) => {
            const displayTitle = tab.title || tab.url || 'Untitled Tab';
            const windowNum = tab.windowIndex + 1;
            const tabNum = tab.tabIndex + 1;
            const categoryName = tab.category || 'Uncategorized';
            const categoryClass = `cat-tag-${categoryName.toLowerCase()}`;

            return (
              <article key={`${tab.windowId}_${tab.tabIndex}_${index}`} className="tab-card">
                <div className="tab-card-left">
                  <div className="tab-favicon-wrap">
                    {tab.favIconUrl ? (
                      <img
                        className="tab-favicon-img"
                        src={tab.favIconUrl}
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <span
                      className="tab-favicon-fallback"
                      style={{ display: tab.favIconUrl ? 'none' : 'flex' }}
                    >
                      🌐
                    </span>
                  </div>

                  <div className="tab-info">
                    <h4 className="tab-title" title={displayTitle}>
                      <Highlight text={displayTitle} query={searchQuery} />
                    </h4>

                    <a
                      href={tab.url}
                      className="tab-url-link"
                      target="_blank"
                      rel="noopener noreferrer"
                      title={tab.url}
                      onClick={(e) => {
                        e.preventDefault();
                        handleOpenTab(tab.url);
                      }}
                    >
                      {tab.url}
                    </a>

                    {/* Category Badge & Metadata */}
                    <div className="tab-badges-row">
                      <span className={`tab-category-badge ${categoryClass}`}>
                        {categoryName}
                      </span>

                      <span className="tab-badge">
                        Window {windowNum} • Tab {tabNum}
                      </span>
                      {tab.pinned && (
                        <span className="tab-badge tab-badge-pinned">
                          📌 Pinned
                        </span>
                      )}
                    </div>

                    {/* AI Tab Summary */}
                    {tab.summary ? (
                      <div className="tab-summary-box">
                        <p className="tab-summary-text">
                          <Highlight text={tab.summary} query={searchQuery} />
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="tab-card-actions">
                  <button
                    className="btn-open-tab"
                    onClick={() => handleOpenTab(tab.url)}
                    type="button"
                    title={`Open ${displayTitle}`}
                  >
                    Open ↗
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
};
