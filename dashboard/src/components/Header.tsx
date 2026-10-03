import React from 'react';

interface HeaderProps {
  sessionCount: number;
  totalTabsCount: number;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  sessionCount,
  totalTabsCount,
  onRefresh,
  isLoading,
}) => {
  return (
    <header className="dashboard-header">
      <div className="header-brand">
        <div className="brand-title-row">
          <span className="brand-icon">🗂️</span>
          <h1 className="brand-title">TAB BANKRUPTCY</h1>
        </div>
        <p className="brand-subtitle">
          Save, organize and find your forgotten browser tabs.
        </p>
      </div>

      <div className="header-meta">
        <div className="stat-pill">
          <span className="stat-pill-label">Sessions</span>
          <span className="stat-pill-value">{sessionCount}</span>
        </div>
        <div className="stat-pill">
          <span className="stat-pill-label">Tabs Saved</span>
          <span className="stat-pill-value">{totalTabsCount}</span>
        </div>
        {onRefresh && (
          <button
            className="refresh-btn"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh from backend"
          >
            {isLoading ? '⏳' : '🔄'} Refresh
          </button>
        )}
      </div>
    </header>
  );
};
