import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { TraineeListTab } from './TraineeListTab';
import { AccessControlTab } from './AccessControlTab';
import { TraineeLogsTab } from './TraineeLogsTab';
import { AuditBackupTab } from './AuditBackupTab';
import { Users, Shield, Clock, Database, RefreshCw } from 'lucide-react';

interface AdminDashboardProps {
  currentUser: User;
}

export type AdminTabKey = 'trainees' | 'access' | 'logs' | 'backup';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser }) => {
  const [activeTab, setActiveTabState] = useState<AdminTabKey>(() => {
    // 1. Check URL hash first (e.g. #logs, #trainees)
    const hash = window.location.hash.replace('#', '') as AdminTabKey;
    if (['trainees', 'access', 'logs', 'backup'].includes(hash)) {
      return hash;
    }
    // 2. Check localStorage
    const saved = localStorage.getItem('etihad_admin_active_tab') as AdminTabKey | null;
    if (saved && ['trainees', 'access', 'logs', 'backup'].includes(saved)) {
      return saved;
    }
    return 'trainees';
  });

  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [countdown, setCountdown] = useState<number>(5);
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);

  const setActiveTab = (tab: AdminTabKey) => {
    setActiveTabState(tab);
    localStorage.setItem('etihad_admin_active_tab', tab);
    window.location.hash = tab;
  };

  // Sync with browser back/forward buttons
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') as AdminTabKey;
      if (['trainees', 'access', 'logs', 'backup'].includes(hash)) {
        setActiveTabState(hash);
        localStorage.setItem('etihad_admin_active_tab', hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Auto-refresh countdown timer: 5... 4... 3... 2... 1... Refresh
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setIsAutoRefreshing(true);
          setRefreshKey((k) => k + 1);
          setTimeout(() => setIsAutoRefreshing(false), 900);
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey((prev) => prev + 1);
    setCountdown(5);
    setTimeout(() => setIsRefreshing(false), 400);
  };

  return (
    <div className="main-content">
      {/* Navigation Tabs Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem' }}>
        <div className="admin-tabs" style={{ margin: 0 }}>
          <button
            className={`tab-button ${activeTab === 'trainees' ? 'active' : ''}`}
            onClick={() => setActiveTab('trainees')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Users size={16} />
              <span>Trainee List</span>
            </div>
          </button>

          <button
            className={`tab-button ${activeTab === 'access' ? 'active' : ''}`}
            onClick={() => setActiveTab('access')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Shield size={16} />
              <span>Access Control</span>
            </div>
          </button>

          <button
            className={`tab-button ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Clock size={16} />
              <span>Trainee Logs</span>
            </div>
          </button>

          <button
            className={`tab-button ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => setActiveTab('backup')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Database size={16} />
              <span>Data & Audit</span>
            </div>
          </button>
        </div>

        {/* Auto-Refresh Status & Manual Refresh Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              color: isAutoRefreshing ? '#065F46' : '#475569',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: isAutoRefreshing ? '#D1FAE5' : '#F1F5F9',
              padding: '0.3rem 0.65rem',
              borderRadius: '20px',
              border: isAutoRefreshing ? '1px solid #10B981' : '1px solid #E2E8F0',
              fontWeight: 600,
              minWidth: '145px',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            title="Auto-refresh countdown in seconds (5... 4... 3... 2... 1... Refresh)"
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: isAutoRefreshing ? '#059669' : '#10B981',
                display: 'inline-block',
                transform: isAutoRefreshing ? 'scale(1.3)' : 'scale(1)',
                transition: 'transform 0.2s ease',
              }}
            ></span>
            <span>
              {isAutoRefreshing ? 'Refreshing...' : `Auto-refresh: ${countdown}...`}
            </span>
          </span>

          <button
            onClick={handleManualRefresh}
            className="btn btn-outline btn-sm"
            style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            title="Refresh current tab data immediately"
            disabled={isRefreshing}
          >
            <RefreshCw size={13} style={{ animation: (isRefreshing || isAutoRefreshing) ? 'spin 0.6s linear infinite' : 'none' }} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Tab Content - Remains mounted with zero screen blinking */}
      <div style={{ marginTop: '1rem' }}>
        {activeTab === 'trainees' && <TraineeListTab currentUser={currentUser} refreshTrigger={refreshKey} />}
        {activeTab === 'access' && <AccessControlTab currentUser={currentUser} refreshTrigger={refreshKey} />}
        {activeTab === 'logs' && <TraineeLogsTab refreshTrigger={refreshKey} />}
        {activeTab === 'backup' && <AuditBackupTab currentUser={currentUser} refreshTrigger={refreshKey} />}
      </div>
    </div>
  );
};
