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

  // Auto-refresh all portal data every 5 minutes (300,000 ms)
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((prev) => prev + 1);
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey((prev) => prev + 1);
    setTimeout(() => setIsRefreshing(false), 500);
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
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: '#F1F5F9',
              padding: '0.3rem 0.6rem',
              borderRadius: '20px',
              border: '1px solid #E2E8F0',
            }}
            title="Data automatically refreshes every 5 minutes in the background"
          >
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }}></span>
            <span>Auto-refresh: 5m</span>
          </span>

          <button
            onClick={handleManualRefresh}
            className="btn btn-outline btn-sm"
            style={{ padding: '0.3rem 0.65rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            title="Refresh current tab data immediately"
            disabled={isRefreshing}
          >
            <RefreshCw size={13} style={{ animation: isRefreshing ? 'spin 0.6s linear infinite' : 'none' }} />
            <span>{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ marginTop: '1rem' }}>
        {activeTab === 'trainees' && <TraineeListTab key={`trainees_${refreshKey}`} currentUser={currentUser} />}
        {activeTab === 'access' && <AccessControlTab key={`access_${refreshKey}`} currentUser={currentUser} />}
        {activeTab === 'logs' && <TraineeLogsTab key={`logs_${refreshKey}`} />}
        {activeTab === 'backup' && <AuditBackupTab key={`backup_${refreshKey}`} currentUser={currentUser} />}
      </div>
    </div>
  );
};
