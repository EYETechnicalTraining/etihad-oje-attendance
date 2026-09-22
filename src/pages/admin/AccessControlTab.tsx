import React, { useState, useEffect } from 'react';
import { TraineeLogSummary } from '../../types';
import { attendanceService } from '../../services/dexie/attendanceService';
import { authService } from '../../services/dexie/authService';
import { getUAEDateString } from '../../utils/timezone';
import { Notification } from '../../components/common/Notification';
import { Shield, KeyRound, UserX, UserCheck, Smartphone } from 'lucide-react';

export const AccessControlTab: React.FC = () => {
  const [logs, setLogs] = useState<TraineeLogSummary[]>([]);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = async () => {
    const today = getUAEDateString();
    const data = await attendanceService.getTraineeLogsForDate(today);
    setLogs(data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleResetPassword = async (traineeId: string, name: string) => {
    if (!confirm(`Reset password for trainee ${name} (ID: ${traineeId}) back to default Etihad@${traineeId}?`)) return;

    const res = await authService.resetTraineePassword(traineeId);
    if (res.success) {
      setMsg({
        type: 'success',
        text: `Password for ${name} reset to default: ${res.newPassword}`,
      });
      loadData();
    } else {
      setMsg({ type: 'error', text: res.error || 'Failed to reset password.' });
    }
  };

  const handleToggleStatus = async (traineeId: string, currentStatus: 'Active' | 'Disabled', name: string) => {
    const nextState = currentStatus === 'Disabled'; // Toggle
    const actionText = nextState ? 'enable' : 'disable';

    if (!confirm(`Are you sure you want to ${actionText} the account for ${name}?`)) return;

    const res = await authService.toggleUserStatus(traineeId, nextState);
    if (res.success) {
      setMsg({
        type: 'success',
        text: `Account for ${name} has been ${nextState ? 'enabled' : 'disabled'}.`,
      });
      loadData();
    } else {
      setMsg({ type: 'error', text: res.error || 'Failed to update user status.' });
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0A192F' }}>Access Control & Security Credentials</h2>
        <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
          Manage trainee authentication credentials, reset default passwords, and toggle account activation status.
        </p>
      </div>

      {msg && <Notification type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Sr. No</th>
              <th>Trainee ID</th>
              <th>Batch</th>
              <th>Trainee Name</th>
              <th>Username</th>
              <th>Password Status</th>
              <th>Last Password Change</th>
              <th>Passkey Registered</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                  No trainee accounts found.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.traineeId}>
                  <td>{log.srNo}</td>
                  <td style={{ fontWeight: 700, color: '#0A192F' }}>{log.traineeId}</td>
                  <td style={{ fontWeight: 600, color: '#C5A059' }}>{log.batch}</td>
                  <td style={{ fontWeight: 600 }}>{log.name}</td>
                  <td style={{ color: '#475569', fontSize: '0.85rem' }}>{log.username}</td>
                  <td>
                    {log.lastPasswordChange ? (
                      <span className="badge badge-present">CHANGED</span>
                    ) : (
                      <span className="badge badge-late">DEFAULT</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.85rem', color: '#64748B' }}>
                    {log.lastPasswordChange || 'Not Changed'}
                  </td>
                  <td>
                    {log.passkeyRegistered ? (
                      <span className="badge badge-present" style={{ gap: '0.2rem' }}>
                        <Smartphone size={12} /> YES
                      </span>
                    ) : (
                      <span className="badge badge-noshow">NO</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleResetPassword(log.traineeId, log.name)}
                        className="btn btn-navy btn-sm"
                        title="Reset Password to Etihad@[ID]"
                      >
                        <KeyRound size={13} />
                        <span>Reset Password</span>
                      </button>

                      {log.accountStatus === 'Active' ? (
                        <button
                          onClick={() => handleToggleStatus(log.traineeId, log.accountStatus, log.name)}
                          className="btn btn-danger btn-sm"
                          title="Disable Trainee Account"
                        >
                          <UserX size={13} />
                          <span>Disable</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleStatus(log.traineeId, log.accountStatus, log.name)}
                          className="btn btn-success btn-sm"
                          title="Enable Trainee Account"
                        >
                          <UserCheck size={13} />
                          <span>Enable</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
