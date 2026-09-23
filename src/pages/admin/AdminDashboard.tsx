import React, { useState } from 'react';
import { User } from '../../types';
import { TraineeListTab } from './TraineeListTab';
import { AccessControlTab } from './AccessControlTab';
import { TraineeLogsTab } from './TraineeLogsTab';
import { AuditBackupTab } from './AuditBackupTab';
import { Users, Shield, Clock, Database } from 'lucide-react';

interface AdminDashboardProps {
  currentUser: User;
}

export type AdminTabKey = 'trainees' | 'access' | 'logs' | 'backup';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<AdminTabKey>('trainees');

  return (
    <div className="main-content">
      {/* Navigation Tabs */}
      <div className="admin-tabs">
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

      {/* Tab Content */}
      <div style={{ marginTop: '1rem' }}>
        {activeTab === 'trainees' && <TraineeListTab currentUser={currentUser} />}
        {activeTab === 'access' && <AccessControlTab currentUser={currentUser} />}
        {activeTab === 'logs' && <TraineeLogsTab />}
        {activeTab === 'backup' && <AuditBackupTab currentUser={currentUser} />}
      </div>
    </div>
  );
};
