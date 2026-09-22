import React, { useState } from 'react';
import { User } from '../../types';
import { LogOut, RefreshCw, Plane } from 'lucide-react';

interface HeaderProps {
  user: User | null;
  onLogout: () => void;
  onRefresh?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout, onRefresh }) => {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshClick = async () => {
    setRefreshing(true);
    if (onRefresh) {
      await onRefresh();
    } else {
      window.location.reload();
    }
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="brand-logo-icon">
          <Plane size={22} color="#0A192F" strokeWidth={2.5} />
        </div>
        <div className="brand-titles">
          <h1>OJE TRAINEE MANAGEMENT SYSTEM</h1>
          <p>Etihad Engineering Technical Training</p>
        </div>
      </div>

      {user && (
        <div className="user-nav-actions">
          <div className="user-badge-info">
            <div className="user-badge-name">{user.username}</div>
            <div className="user-badge-role">
              {user.role === 'MASTER' ? 'Administrator' : `Trainee ID: ${user.traineeId}`}
            </div>
          </div>

          <button
            onClick={handleRefreshClick}
            className="btn btn-gold btn-sm"
            title="Refresh Central Database Data"
            disabled={refreshing}
          >
            <RefreshCw size={15} className={refreshing ? 'spin-icon' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Data'}</span>
          </button>

          <button
            onClick={onLogout}
            className="btn btn-outline btn-sm"
            style={{ color: '#FFFFFF', borderColor: '#C5A059' }}
            title="Log Out"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      )}
    </header>
  );
};
