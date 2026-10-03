import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SessionSummary, TabSession } from './types';
import { fetchSessions, fetchSessionDetail } from './api';
import { Header } from './components/Header';
import { SessionList } from './components/SessionList';
import { TabList } from './components/TabList';
import { AITestCard } from './components/AITestCard';

export const App: React.FC = () => {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<TabSession | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Fetch all sessions from the FastAPI backend
  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await fetchSessions();
      setSessions(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to connect to backend server');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Load session detail when a session card is clicked
  const handleSelectSession = useCallback(async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setIsLoadingDetail(true);
    setDetailError(null);

    try {
      const detail = await fetchSessionDetail(sessionId);
      setSelectedSession(detail);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setDetailError(err.message);
      } else {
        setDetailError('Failed to load session details');
      }
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  const handleBackToSessions = () => {
    setSelectedSessionId(null);
    setSelectedSession(null);
    setDetailError(null);
  };

  // Compute aggregate statistics for the header
  const totalTabsCount = useMemo(() => {
    return sessions.reduce((acc, s) => acc + (s.tabCount || 0), 0);
  }, [sessions]);

  return (
    <div className="app-shell">
      <Header
        sessionCount={sessions.length}
        totalTabsCount={totalTabsCount}
        onRefresh={() => {
          void loadSessions();
          if (selectedSessionId) {
            void handleSelectSession(selectedSessionId);
          }
        }}
        isLoading={isLoading || isLoadingDetail}
      />

      <main className="main-content">
        {selectedSessionId ? (
          isLoadingDetail ? (
            <div className="state-container loading-state">
              <div className="spinner">⏳</div>
              <p className="state-message">Loading session tabs...</p>
            </div>
          ) : detailError ? (
            <div className="state-container error-state">
              <div className="state-icon">⚠️</div>
              <h3 className="state-title">Could not load session details</h3>
              <p className="state-details">{detailError}</p>
              <div className="detail-error-actions">
                <button
                  className="btn-retry"
                  onClick={() => handleSelectSession(selectedSessionId)}
                  type="button"
                >
                  🔄 Retry
                </button>
                <button
                  className="btn-back-secondary"
                  onClick={handleBackToSessions}
                  type="button"
                >
                  ← Back to Sessions
                </button>
              </div>
            </div>
          ) : selectedSession ? (
            <TabList
              session={selectedSession}
              onBack={handleBackToSessions}
              onSessionUpdated={(updated) => setSelectedSession(updated)}
            />
          ) : null
        ) : (
          <div className="home-content-stack">
            <SessionList
              sessions={sessions}
              isLoading={isLoading}
              errorMessage={errorMessage}
              onSelectSession={handleSelectSession}
              onRetry={loadSessions}
            />
            <AITestCard />
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
