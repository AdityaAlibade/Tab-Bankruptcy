import React from 'react';
import { SessionSummary } from '../types';
import { SessionCard } from './SessionCard';

interface SessionListProps {
  sessions: SessionSummary[];
  isLoading: boolean;
  errorMessage: string | null;
  onSelectSession: (sessionId: string) => void;
  onRetry: () => void;
}

export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  isLoading,
  errorMessage,
  onSelectSession,
  onRetry,
}) => {
  if (isLoading) {
    return (
      <div className="state-container loading-state">
        <div className="spinner">⏳</div>
        <p className="state-message">Loading sessions...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="state-container error-state">
        <div className="state-icon">⚠️</div>
        <h3 className="state-title">Cannot connect to Tab Bankruptcy backend.</h3>
        <p className="state-details">
          Make sure FastAPI is running on:{' '}
          <code className="code-badge">http://127.0.0.1:8000</code>
        </p>
        <button className="btn-retry" onClick={onRetry} type="button">
          🔄 Retry Connection
        </button>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="state-container empty-state">
        <div className="state-icon">📦</div>
        <h3 className="state-title">No saved sessions yet.</h3>
        <p className="state-details">
          Open Chrome and click <strong>"Stash All Tabs"</strong> in the extension.
        </p>
        <button className="btn-retry" onClick={onRetry} type="button">
          🔄 Check Again
        </button>
      </div>
    );
  }

  // Sort sessions with newest first (by createdAt or naturally preserving descending order from backend)
  const sortedSessions = [...sessions].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <section className="session-list-section">
      <div className="section-title-bar">
        <h2 className="section-heading">Saved Sessions</h2>
        <span className="count-tag">{sortedSessions.length} total</span>
      </div>

      <div className="session-grid">
        {sortedSessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            onSelect={onSelectSession}
          />
        ))}
      </div>
    </section>
  );
};
