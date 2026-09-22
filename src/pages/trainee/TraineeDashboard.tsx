import React, { useState, useEffect } from 'react';
import { User, Trainee, Remark, Attendance, Allocation, TaskCount, SignOut } from '../../types';
import { traineeService } from '../../services/dexie/traineeService';
import { attendanceService } from '../../services/dexie/attendanceService';
import { allocationService } from '../../services/dexie/allocationService';
import { taskService } from '../../services/dexie/taskService';
import {
  registerDevicePasskey,
  authenticateDevicePasskey,
  hasPasskeyRegistered,
} from '../../services/webauthnService';
import { getUAEDateString, getUAETimeString, formatDisplayDate } from '../../utils/timezone';
import { Modal } from '../../components/common/Modal';
import { Notification } from '../../components/common/Notification';
import { Badge } from '../../components/common/Badge';
import { ChangePasswordModal } from './ChangePasswordModal';
import {
  Smartphone,
  CalendarCheck,
  Compass,
  CheckSquare,
  LogOut,
  MessageSquare,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Plane,
} from 'lucide-react';

interface TraineeDashboardProps {
  currentUser: User;
}

export const TraineeDashboard: React.FC<TraineeDashboardProps> = ({ currentUser }) => {
  const [trainee, setTrainee] = useState<Trainee | null>(null);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);
  const [todaySignOut, setTodaySignOut] = useState<SignOut | null>(null);
  const [hasPasskey, setHasPasskey] = useState<boolean>(true);

  // Modals
  const [isPasskeyPromptOpen, setIsPasskeyPromptOpen] = useState(false);
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);
  const [isRemarksModalOpen, setIsRemarksModalOpen] = useState(false);
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);

  // Form states
  const [allocationForm, setAllocationForm] = useState({
    location: '',
    insideOutside: 'Inside' as 'Inside' | 'Outside',
    aircraftRegistration: '',
    aircraftType: '',
    manager: '',
    engineer: '',
  });

  const [taskCountInput, setTaskCountInput] = useState<number | ''>('');

  // Status feedback
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    if (!currentUser.traineeId) return;

    const t = await traineeService.getTraineeById(currentUser.traineeId);
    setTrainee(t);

    const rList = await traineeService.getRemarks(currentUser.traineeId);
    setRemarks(rList);

    const today = getUAEDateString();
    const att = await attendanceService.getTraineeAttendanceForDate(currentUser.traineeId, today);
    setTodayAttendance(att);

    const sOut = await taskService.getSignOut(currentUser.traineeId, today);
    setTodaySignOut(sOut);

    const pkRegistered = await hasPasskeyRegistered(currentUser.traineeId);
    setHasPasskey(pkRegistered);

    // Prompt passkey setup if first time login
    if (!pkRegistered) {
      setIsPasskeyPromptOpen(true);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  // Step 12: Device / Passkey Registration
  const handleRegisterDevice = async () => {
    if (!trainee) return;
    setLoading(true);
    setNotification(null);

    const res = await registerDevicePasskey(trainee.traineeId, trainee.name);
    setLoading(false);

    if (res.success) {
      setHasPasskey(true);
      setIsPasskeyPromptOpen(false);
      setNotification({
        type: 'success',
        text: 'This device has been securely registered with WebAuthn/Passkey authentication.',
      });
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to register passkey device.' });
    }
  };

  // Step 14: Attendance Logging
  const handleLogAttendance = async () => {
    if (!trainee) return;
    setLoading(true);
    setNotification(null);

    // 1. Verify Passkey / Device Biometrics
    const authRes = await authenticateDevicePasskey(trainee.traineeId);
    if (!authRes.success) {
      setLoading(false);
      setNotification({ type: 'error', text: authRes.error || 'Biometric authentication failed.' });
      return;
    }

    // 2. Log Attendance with auto timestamp and status calculation
    const logRes = await attendanceService.logAttendance(
      trainee.traineeId,
      authRes.method || 'WebAuthn/Passkey'
    );

    setLoading(false);
    if (logRes.success && logRes.attendance) {
      setTodayAttendance(logRes.attendance);
      setIsAttendanceModalOpen(false);
      setNotification({
        type: 'success',
        text: `Attendance Successfully Registered! Time: ${logRes.attendance.loginTime} • Status: ${logRes.attendance.status}`,
      });
    } else {
      setNotification({ type: 'error', text: logRes.error || 'Failed to log attendance.' });
    }
  };

  // Step 15: Allocation Submission
  const handleAllocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainee) return;
    setLoading(true);
    setNotification(null);

    const res = await allocationService.addAllocation({
      traineeId: trainee.traineeId,
      location: allocationForm.location,
      insideOutside: allocationForm.insideOutside,
      aircraftRegistration: allocationForm.aircraftRegistration,
      aircraftType: allocationForm.aircraftType,
      manager: allocationForm.manager,
      engineer: allocationForm.engineer,
    });

    setLoading(false);
    if (res.success) {
      setIsAllocationModalOpen(false);
      setAllocationForm({
        location: '',
        insideOutside: 'Inside',
        aircraftRegistration: '',
        aircraftType: '',
        manager: '',
        engineer: '',
      });
      setNotification({ type: 'success', text: 'Workstation Allocation successfully submitted.' });
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to submit allocation.' });
    }
  };

  // Step 16: Task Count Submission
  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainee || taskCountInput === '') return;
    setLoading(true);
    setNotification(null);

    const res = await taskService.addTaskCount(trainee.traineeId, Number(taskCountInput));
    setLoading(false);

    if (res.success) {
      setIsTaskModalOpen(false);
      setTaskCountInput('');
      setNotification({ type: 'success', text: `Task count (${res.taskCount?.taskCount}) submitted successfully.` });
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to submit task count.' });
    }
  };

  // Step 17: Daily Sign-Out
  const handleSignOutSubmit = async () => {
    if (!trainee) return;
    setLoading(true);
    setNotification(null);

    // Passkey verification if available
    if (hasPasskey) {
      await authenticateDevicePasskey(trainee.traineeId);
    }

    const res = await taskService.submitSignOut(trainee.traineeId);
    setLoading(false);

    if (res.success && res.signOut) {
      setTodaySignOut(res.signOut);
      setIsSignOutModalOpen(false);
      setNotification({
        type: 'success',
        text: `Successfully Signed Out! Time: ${res.signOut.signOutTime}`,
      });
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to sign out.' });
    }
  };

  return (
    <div className="main-content" style={{ maxWidth: '800px' }}>
      {notification && <Notification type={notification.type} message={notification.text} onClose={() => setNotification(null)} />}

      {/* Trainee Welcome Banner Header */}
      {trainee && (
        <div className="card" style={{ background: 'linear-gradient(135deg, #0A192F 0%, #1E293B 100%)', color: '#FFFFFF', border: '2px solid #C5A059' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: '#C5A059', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                OJE TECHNICAL TRAINEE DASHBOARD
              </div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', marginTop: '0.2rem' }}>
                Welcome, {trainee.name}
              </h2>
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.85rem', color: '#CBD5E1' }}>
                <span><strong>ID:</strong> {trainee.traineeId}</span>
                <span>•</span>
                <span><strong>Batch:</strong> {trainee.batchId}</span>
                <span>•</span>
                <span><strong>Program:</strong> {trainee.program}</span>
              </div>
            </div>

            <button onClick={() => setIsChangePassOpen(true)} className="btn btn-gold btn-sm">
              <KeyRound size={14} />
              <span>Change Password</span>
            </button>
          </div>
        </div>
      )}

      {/* Section 1: Remarks from Manager & Engineer */}
      <div className="card" style={{ borderLeft: '5px solid #C5A059' }}>
        <div className="card-header" style={{ marginBottom: '0.5rem', paddingBottom: '0.5rem' }}>
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
            <MessageSquare size={18} color="#C5A059" />
            <span>Remarks from Manager & Engineer</span>
          </span>
          {remarks.length > 0 && (
            <button onClick={() => setIsRemarksModalOpen(true)} className="btn btn-outline btn-sm">
              View History ({remarks.length})
            </button>
          )}
        </div>

        {remarks.length === 0 ? (
          <div style={{ color: '#64748B', fontSize: '0.875rem', fontStyle: 'italic', padding: '0.5rem 0' }}>
            No supervisor remarks entered yet.
          </div>
        ) : (
          <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.9rem', color: '#1E293B', fontWeight: 500, marginBottom: '0.35rem' }}>
              "{remarks[0].remark}"
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', textAlign: 'right' }}>
              By {remarks[0].createdBy} • {remarks[0].date} at {remarks[0].time}
            </div>
          </div>
        )}
      </div>

      {/* Four Large Mobile Action Cards */}
      <div className="trainee-grid">
        {/* CARD 1: ATTENDANCE */}
        <div
          className="action-card"
          onClick={() => setIsAttendanceModalOpen(true)}
          style={{
            borderColor: todayAttendance ? '#10B981' : '#C5A059',
            backgroundColor: todayAttendance ? '#F0FDF4' : '#FFFFFF',
          }}
        >
          <div
            className="action-card-icon"
            style={{
              background: todayAttendance ? '#DCFCE7' : '#F4EBE1',
              color: todayAttendance ? '#047857' : '#0A192F',
            }}
          >
            <CalendarCheck size={26} />
          </div>
          <div className="action-card-title">ATTENDANCE</div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
            {todayAttendance ? (
              <Badge status={todayAttendance.status} />
            ) : (
              <span style={{ color: '#64748B' }}>Tap to Log Today's Attendance</span>
            )}
          </div>
        </div>

        {/* CARD 2: ALLOCATION */}
        <div className="action-card" onClick={() => setIsAllocationModalOpen(true)}>
          <div className="action-card-icon">
            <Compass size={26} />
          </div>
          <div className="action-card-title">ALLOCATION</div>
          <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#64748B' }}>
            Submit Hangar / Aircraft Station
          </div>
        </div>

        {/* CARD 3: TASK COUNT */}
        <div className="action-card" onClick={() => setIsTaskModalOpen(true)}>
          <div className="action-card-icon">
            <CheckSquare size={26} />
          </div>
          <div className="action-card-title">TASK COUNT</div>
          <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#64748B' }}>
            Enter Daily Maintenance Tasks
          </div>
        </div>

        {/* CARD 4: DAILY SIGN-OUT */}
        <div
          className="action-card"
          onClick={() => setIsSignOutModalOpen(true)}
          style={{
            borderColor: todaySignOut ? '#047857' : '#E2E8F0',
            backgroundColor: todaySignOut ? '#F0FDF4' : '#FFFFFF',
          }}
        >
          <div
            className="action-card-icon"
            style={{
              background: todaySignOut ? '#DCFCE7' : '#FEF2F2',
              color: todaySignOut ? '#047857' : '#B91C1C',
            }}
          >
            <LogOut size={26} />
          </div>
          <div className="action-card-title">DAILY SIGN-OUT</div>
          <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: todaySignOut ? '#047857' : '#64748B' }}>
            {todaySignOut ? `Signed Out at ${todaySignOut.signOutTime}` : 'Tap to Sign Out for Today'}
          </div>
        </div>
      </div>

      {/* Modal 1: Device / Passkey Registration */}
      <Modal
        isOpen={isPasskeyPromptOpen}
        onClose={() => setIsPasskeyPromptOpen(false)}
        title="Secure Your Attendance Account"
      >
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#F4EBE1',
              color: '#0A192F',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem auto',
            }}
          >
            <Smartphone size={32} color="#C5A059" />
          </div>

          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0A192F', marginBottom: '0.5rem' }}>
            Device Biometric Authentication
          </h3>
          <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.5rem', lineHeight: 1.6 }}>
            Register this mobile device to securely verify your identity (via Fingerprint, Face ID, or PIN passkey) when submitting attendance and daily sign-outs.
          </p>

          <button
            onClick={handleRegisterDevice}
            className="btn btn-gold btn-lg"
            style={{ width: '100%' }}
            disabled={loading}
          >
            <Smartphone size={18} />
            <span>{loading ? 'Registering Device...' : 'Register This Device'}</span>
          </button>
        </div>
      </Modal>

      {/* Modal 2: Attendance Modal */}
      <Modal
        isOpen={isAttendanceModalOpen}
        onClose={() => setIsAttendanceModalOpen(false)}
        title="Log Today's Attendance"
      >
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>TODAY'S DATE</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0A192F', marginBottom: '1rem' }}>
            {formatDisplayDate(getUAEDateString())}
          </div>

          {todayAttendance ? (
            <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1.25rem', borderRadius: '10px', marginTop: '1rem' }}>
              <CheckCircle2 size={32} color="#047857" style={{ margin: '0 auto 0.5rem auto' }} />
              <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#047857' }}>Attendance Successfully Registered</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginTop: '0.85rem', fontSize: '0.9rem', textAlign: 'left' }}>
                <div><strong>Log Time:</strong> {todayAttendance.loginTime}</div>
                <div><strong>Status:</strong> <Badge status={todayAttendance.status} /></div>
                <div style={{ gridColumn: 'span 2' }}><strong>Auth Method:</strong> {todayAttendance.authenticationMethod}</div>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.5rem' }}>
                Click below to verify your identity via device WebAuthn passkey and record your UAE timestamp.
              </p>

              <button
                onClick={handleLogAttendance}
                className="btn btn-gold btn-lg"
                style={{ width: '100%' }}
                disabled={loading}
              >
                <CalendarCheck size={20} />
                <span>{loading ? 'Verifying Identity...' : 'Log Attendance'}</span>
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal 3: Allocation Form */}
      <Modal
        isOpen={isAllocationModalOpen}
        onClose={() => setIsAllocationModalOpen(false)}
        title="Submit Workstation Allocation"
        maxWidth="600px"
      >
        <form onSubmit={handleAllocationSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Location / Hangar *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Hangar 3 / Line Bay A"
                value={allocationForm.location}
                onChange={(e) => setAllocationForm({ ...allocationForm, location: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Inside / Outside *</label>
              <select
                className="form-control"
                value={allocationForm.insideOutside}
                onChange={(e) => setAllocationForm({ ...allocationForm, insideOutside: e.target.value as any })}
                required
              >
                <option value="Inside">Inside Hangar</option>
                <option value="Outside">Outside Hangar / Apron</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Aircraft Registration *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. A6-ETD"
                value={allocationForm.aircraftRegistration}
                onChange={(e) => setAllocationForm({ ...allocationForm, aircraftRegistration: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Aircraft Type *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Boeing 787 / A350"
                value={allocationForm.aircraftType}
                onChange={(e) => setAllocationForm({ ...allocationForm, aircraftType: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Check Manager *</label>
              <input
                type="text"
                className="form-control"
                placeholder="Manager Name"
                value={allocationForm.manager}
                onChange={(e) => setAllocationForm({ ...allocationForm, manager: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Check Engineer *</label>
              <input
                type="text"
                className="form-control"
                placeholder="Engineer Name"
                value={allocationForm.engineer}
                onChange={(e) => setAllocationForm({ ...allocationForm, engineer: e.target.value })}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsAllocationModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-navy" disabled={loading}>
              <Compass size={16} />
              <span>{loading ? 'Submitting...' : 'Submit Allocation'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 4: Task Count Form */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title="Enter Your Latest Task Count"
      >
        <form onSubmit={handleTaskSubmit}>
          <div className="form-group">
            <label className="form-label">Completed Task Count *</label>
            <input
              type="number"
              min="0"
              className="form-control"
              placeholder="e.g. 5"
              value={taskCountInput}
              onChange={(e) => setTaskCountInput(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <button type="button" className="btn btn-outline" onClick={() => setIsTaskModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-gold" disabled={loading || taskCountInput === ''}>
              <CheckSquare size={16} />
              <span>{loading ? 'Submitting...' : 'Submit Task Count'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal 5: Daily Sign-Out Confirmation */}
      <Modal
        isOpen={isSignOutModalOpen}
        onClose={() => setIsSignOutModalOpen(false)}
        title="Daily Sign-Out Verification"
      >
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          {todaySignOut ? (
            <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1.25rem', borderRadius: '10px' }}>
              <CheckCircle2 size={32} color="#047857" style={{ margin: '0 auto 0.5rem auto' }} />
              <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#047857' }}>Successfully Signed Out</h4>
              <div style={{ fontSize: '0.95rem', color: '#1E293B', marginTop: '0.5rem' }}>
                Time: <strong>{todaySignOut.signOutTime}</strong>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '1rem', color: '#0A192F', fontWeight: 600, marginBottom: '1.5rem' }}>
                Are you sure you want to sign out for today?
              </p>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsSignOutModalOpen(false)}
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleSignOutSubmit}
                  disabled={loading}
                >
                  <LogOut size={16} />
                  <span>{loading ? 'Signing Out...' : 'Confirm Sign-Out'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal 6: View Remarks History */}
      <Modal
        isOpen={isRemarksModalOpen}
        onClose={() => setIsRemarksModalOpen(false)}
        title="Supervisor Remarks History"
        maxWidth="600px"
      >
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {remarks.map((r) => (
            <div
              key={r.id}
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                padding: '0.85rem',
                marginBottom: '0.75rem',
                borderLeft: '4px solid #C5A059',
              }}
            >
              <div style={{ fontSize: '0.9rem', color: '#1E293B', marginBottom: '0.35rem', whiteSpace: 'pre-wrap' }}>
                "{r.remark}"
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748B', textAlign: 'right' }}>
                By {r.createdBy} • {r.date} at {r.time}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Modal 7: Change Password */}
      <ChangePasswordModal
        isOpen={isChangePassOpen}
        onClose={() => setIsChangePassOpen(false)}
        currentUser={currentUser}
      />
    </div>
  );
};
