import React from 'react';
import { SessionSummary } from '../types';

interface SessionCardProps {
  session: SessionSummary;
  onSelect: (sessionId: string) => void;
}

export const SessionCard: React.FC<SessionCardProps> = ({ session, onSelect }) => {
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

  const tabPlural = session.tabCount === 1 ? 'Tab' : 'Tabs';
  const windowPlural = session.windowCount === 1 ? 'Window' : 'Windows';

  return (
    <article className="session-card">
      <div className="session-card-header">
        <h3 className="session-card-title">{session.name}</h3>
      </div>

      <div className="session-card-meta">
        <div className="session-metrics">
          <span className="metric-highlight">
            {session.tabCount} {tabPlural}
          </span>
          <span className="metric-dot">•</span>
          <span>
            {session.windowCount} {windowPlural}
          </span>
        </div>

        <div className="session-created-date">
          <span className="date-label">Created:</span> {formattedDate}
        </div>
      </div>

      <div className="session-card-footer">
        <button
          className="btn-view-session"
          onClick={() => onSelect(session.id)}
          type="button"
        >
          View Session →
        </button>
      </div>
    </article>
  );
};
