import React, { useState, useEffect } from 'react';
import { TraineeLogSummary, Instructor, User } from '../../types';
import { attendanceService } from '../../services/hybridAttendanceService';
import { authService } from '../../services/hybridAuthService';
import { getUAEDateString } from '../../utils/timezone';
import { Notification } from '../../components/common/Notification';
import {
  Shield,
  KeyRound,
  UserX,
  UserCheck,
  Smartphone,
  UserPlus,
  Trash2,
  GraduationCap,
  Info,
} from 'lucide-react';

interface AccessControlTabProps {
  currentUser?: User;
}

export const AccessControlTab: React.FC<AccessControlTabProps> = ({ currentUser }) => {
  const isMaster = currentUser ? currentUser.role === 'MASTER' : true;

  // Trainee logs state
  const [logs, setLogs] = useState<TraineeLogSummary[]>([]);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Instructor management state (Master only)
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [staffNumberInput, setStaffNumberInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [addingInstructor, setAddingInstructor] = useState(false);

  const loadData = async () => {
    const today = getUAEDateString();
    const data = await attendanceService.getTraineeLogsForDate(today);
    setLogs(data);

    if (isMaster) {
      const instList = await authService.getInstructors();
      setInstructors(instList);
    }
  };

  useEffect(() => {
    loadData();
  }, [isMaster]);

  // ---------------- Trainee Actions ----------------
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

  // ---------------- Instructor Actions (Master Only) ----------------
  const handleAddInstructor = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setAddingInstructor(true);

    const res = await authService.addInstructor(staffNumberInput, nameInput, emailInput);
    setAddingInstructor(false);

    if (res.success && res.instructor) {
      setMsg({
        type: 'success',
        text: `Instructor ${res.instructor.name} registered! Login: ${res.instructor.email} • Password: Etihad@${res.instructor.staffNumber}`,
      });
      setStaffNumberInput('');
      setNameInput('');
      setEmailInput('');
      loadData();
    } else {
      setMsg({ type: 'error', text: res.error || 'Failed to add instructor.' });
    }
  };

  const handleResetInstructorPassword = async (username: string, staffNumber: string, name: string) => {
    if (!confirm(`Reset password for instructor ${name} back to default Etihad@${staffNumber}?`)) return;
    setMsg(null);
    const res = await authService.resetInstructorPassword(username, staffNumber);
    if (res.success) {
      setMsg({
        type: 'success',
        text: `Password for instructor ${name} reset to default: ${res.newPassword}`,
      });
      loadData();
    } else {
      setMsg({ type: 'error', text: res.error || 'Failed to reset instructor password.' });
    }
  };

  const handleToggleInstructorStatus = async (username: string, currentStatus: boolean, name: string) => {
    const nextState = !currentStatus;
    const actionText = nextState ? 'enable' : 'disable';
    if (!confirm(`Are you sure you want to ${actionText} the account for instructor ${name}?`)) return;

    setMsg(null);
    const res = await authService.toggleInstructorStatus(username, nextState);
    if (res.success) {
      setMsg({
        type: 'success',
        text: `Instructor account for ${name} has been ${nextState ? 'enabled' : 'disabled'}.`,
      });
      loadData();
    } else {
      setMsg({ type: 'error', text: res.error || 'Failed to update instructor status.' });
    }
  };

  const handleRemoveInstructor = async (username: string, name: string) => {
    if (!confirm(`Are you sure you want to delete instructor ${name} (${username})? This action cannot be undone.`)) return;
    setMsg(null);
    const res = await authService.removeInstructor(username);
    if (res.success) {
      setMsg({
        type: 'success',
        text: `Instructor account ${name} removed from system.`,
      });
      loadData();
    } else {
      setMsg({ type: 'error', text: res.error || 'Failed to delete instructor.' });
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0A192F' }}>
          Access Control &amp; Security Credentials
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
          {isMaster
            ? 'Manage instructor accounts, configure login access credentials, reset trainee passwords, and toggle account activation status.'
            : 'Manage trainee authentication credentials, reset default passwords, and toggle trainee account activation status.'}
        </p>
      </div>

      {msg && <Notification type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

      {/* MASTER-ONLY: Instructor Access Management Section */}
      {isMaster && (
        <div className="card" style={{ borderLeft: '5px solid #C5A059', marginBottom: '2rem' }}>
          <div className="card-header">
            <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <GraduationCap size={20} color="#C5A059" />
              <span>OJE Instructors &amp; Faculty Access Management</span>
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1.25rem' }}>
            Register new instructors for portal login access. Instructors have restricted administrative privileges:
            they can manage trainees, register holidays, view/override trainee logs, and download Excel reports, but cannot access master settings or add other instructors.
          </p>

          {/* Form to Register Instructor */}
          <form onSubmit={handleAddInstructor} style={{ marginBottom: '1.5rem', background: '#F8FAFC', padding: '1.25rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Staff Number</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. 54321"
                  value={staffNumberInput}
                  onChange={(e) => setStaffNumberInput(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Instructor Full Name</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Capt. Ahmed Al Mansoori"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Email Address (Login Username)</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="e.g. instructor@etihad.ae"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  required
                />
              </div>

              <div>
                <button type="submit" className="btn btn-gold btn-md" disabled={addingInstructor} style={{ width: '100%' }}>
                  <UserPlus size={16} />
                  <span>{addingInstructor ? 'Registering...' : 'Register Instructor'}</span>
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem', fontSize: '0.8rem', color: '#64748B' }}>
              <Info size={14} color="#C5A059" />
              <span>
                Default Password will be automatically set to <strong>Etihad@StaffNumber</strong> (e.g. <code>Etihad@{staffNumberInput || '54321'}</code>).
              </span>
            </div>
          </form>

          {/* Table of Registered Instructors */}
          <div className="table-responsive">
            <table className="custom-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Staff Number</th>
                  <th>Instructor Name</th>
                  <th>Login Username (Email)</th>
                  <th>Account Status</th>
                  <th>Last Password Change</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {instructors.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '1.5rem', color: '#64748B' }}>
                      No instructors registered yet. Use the form above to add an instructor.
                    </td>
                  </tr>
                ) : (
                  instructors.map((inst) => (
                    <tr key={inst.email}>
                      <td style={{ fontWeight: 700, color: '#0A192F' }}>{inst.staffNumber}</td>
                      <td style={{ fontWeight: 600 }}>{inst.name}</td>
                      <td style={{ color: '#475569' }}>{inst.email}</td>
                      <td>
                        {inst.active ? (
                          <span className="badge badge-present">ACTIVE</span>
                        ) : (
                          <span className="badge badge-noshow">DISABLED</span>
                        )}
                      </td>
                      <td style={{ color: '#64748B' }}>{inst.lastPasswordChange || 'Not Changed'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            onClick={() => handleResetInstructorPassword(inst.email, inst.staffNumber, inst.name)}
                            className="btn btn-navy btn-sm"
                            title={`Reset Password to Etihad@${inst.staffNumber}`}
                          >
                            <KeyRound size={13} />
                            <span>Reset Password</span>
                          </button>

                          {inst.active ? (
                            <button
                              type="button"
                              onClick={() => handleToggleInstructorStatus(inst.email, inst.active, inst.name)}
                              className="btn btn-danger btn-sm"
                              title="Disable Instructor Account"
                            >
                              <UserX size={13} />
                              <span>Disable</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleInstructorStatus(inst.email, inst.active, inst.name)}
                              className="btn btn-success btn-sm"
                              title="Enable Instructor Account"
                            >
                              <UserCheck size={13} />
                              <span>Enable</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleRemoveInstructor(inst.email, inst.name)}
                            className="btn btn-outline btn-sm"
                            style={{ color: '#B91C1C', borderColor: '#FCA5A5' }}
                            title="Delete Instructor Account"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Trainee Access Control Table (Visible to Both Master and Instructors) */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Shield size={20} color="#002060" />
            <span>Trainee Security Credentials &amp; Access Control</span>
          </span>
        </div>

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
    </div>
  );
};
