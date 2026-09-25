import React, { useState, useEffect } from 'react';
import { User, Trainee, Remark, Attendance, Allocation, TaskCount, SignOut } from '../../types';
import { traineeService } from '../../services/hybridTraineeService';
import { attendanceService } from '../../services/hybridAttendanceService';
import { allocationService } from '../../services/hybridAllocationService';
import { taskService } from '../../services/hybridTaskService';
import { settingsService } from '../../services/hybridSettingsService';
import { emailService } from '../../services/emailService';
import { getDeviceLocation, checkGeofence } from '../../utils/geofence';
import { getUAEDateString, getUAETimeString, formatDisplayDate, formatMediumDate } from '../../utils/timezone';
import { Modal } from '../../components/common/Modal';
import { Notification } from '../../components/common/Notification';
import { Badge } from '../../components/common/Badge';
import { ChangePasswordModal } from './ChangePasswordModal';
import {
  CalendarCheck,
  Compass,
  CheckSquare,
  LogOut,
  MessageSquare,
  KeyRound,
  CheckCircle2,
  RefreshCw,
  Trash2,
} from 'lucide-react';

interface TraineeDashboardProps {
  currentUser: User;
}

export const TraineeDashboard: React.FC<TraineeDashboardProps> = ({ currentUser }) => {
  const [trainee, setTrainee] = useState<Trainee | null>(null);
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<Attendance | null>(null);
  const [todaySignOut, setTodaySignOut] = useState<SignOut | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [taskCounts, setTaskCounts] = useState<TaskCount[]>([]);

  // Tab views inside modals
  const [allocationTab, setAllocationTab] = useState<'form' | 'history'>('form');
  const [taskTab, setTaskTab] = useState<'form' | 'history'>('form');

  // Modals
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
  const [refreshing, setRefreshing] = useState(false);

  // Modal error states (to ensure errors show inside the active modal box)
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const loadData = async () => {
    if (!currentUser.traineeId) return;

    const today = getUAEDateString();
    const [t, rList, att, sOut, aList, tcList] = await Promise.all([
      traineeService.getTraineeById(currentUser.traineeId),
      traineeService.getRemarks(currentUser.traineeId),
      attendanceService.getTraineeAttendanceForDate(currentUser.traineeId, today),
      taskService.getSignOut(currentUser.traineeId, today),
      allocationService.getAllocations(currentUser.traineeId),
      taskService.getTaskCounts(currentUser.traineeId),
    ]);

    setTrainee(t);
    setRemarks(rList);
    setTodayAttendance(att);
    setTodaySignOut(sOut);
    setAllocations(aList);
    setTaskCounts(tcList);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      loadData();
    }, 5000); // 5-second seamless auto-refresh
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setTimeout(() => setRefreshing(false), 500);
  };

  // Instant Attendance Logging with Attendance Log In Geofence Check
  const handleLogAttendanceSimple = async () => {
    if (!trainee) return;
    setLoading(true);
    setNotification(null);
    setAttendanceError(null);

    // Fetch fresh geofence settings from central cloud database
    const geoSettings = await settingsService.getGeofenceSettings();
    if (geoSettings.enabled) {
      const locRes = await getDeviceLocation();
      if (!locRes.success || !locRes.coords) {
        setLoading(false);
        const errMsg = locRes.error || 'GPS Location permission required to log attendance.';
        setAttendanceError(errMsg);
        setNotification({
          type: 'error',
          text: errMsg,
        });
        return;
      }

      const check = checkGeofence(
        locRes.coords.latitude,
        locRes.coords.longitude,
        geoSettings.centerLatitude,
        geoSettings.centerLongitude,
        geoSettings.loginRadiusMeters
      );

      if (!check.isWithin) {
        setLoading(false);
        const errMsg = `🛑 Attendance Log In Restricted: You are currently ${check.formattedDistance} away from Etihad Engineering facility. Attendance Log In is allowed within ${geoSettings.loginRadiusMeters} meters.`;
        setAttendanceError(errMsg);
        setNotification({
          type: 'error',
          text: errMsg,
        });
        return;
      }
    }

    const logRes = await attendanceService.logAttendance(
      trainee.traineeId,
      'Password Fallback'
    );

    setLoading(false);
    if (logRes.success && logRes.attendance) {
      setTodayAttendance(logRes.attendance);
      setAttendanceError(null);
      setIsAttendanceModalOpen(false);
      setNotification({
        type: 'success',
        text: `Attendance Registered! Time: ${logRes.attendance.loginTime} • Status: ${logRes.attendance.status}`,
      });

      // Automated Late to Work Email dispatch
      if (logRes.attendance.status === 'Late to Work' && trainee.email) {
        emailService.sendLateToWorkEmail(
          trainee.name,
          trainee.email,
          getUAEDateString(),
          logRes.attendance.loginTime,
          trainee.traineeId
        ).catch((err) => console.warn('Failed to send Late to Work email:', err));
      }
    } else {
      const errMsg = logRes.error || 'Failed to log attendance.';
      setAttendanceError(errMsg);
      setNotification({ type: 'error', text: errMsg });
    }
  };

  // Allocation Submission
  const handleAllocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainee) return;
    setLoading(true);
    setNotification(null);
    setAllocationError(null);

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
      setAllocationError(null);
      setAllocationForm({
        location: '',
        insideOutside: 'Inside',
        aircraftRegistration: '',
        aircraftType: '',
        manager: '',
        engineer: '',
      });
      // Immediately refresh trainee's allocations list
      const updatedAllocations = await allocationService.getAllocations(trainee.traineeId);
      setAllocations(updatedAllocations);
      setAllocationTab('history');
      setNotification({ type: 'success', text: 'Workstation Allocation successfully submitted.' });
    } else {
      const errMsg = res.error || 'Failed to submit allocation.';
      setAllocationError(errMsg);
      setNotification({ type: 'error', text: errMsg });
    }
  };

  // Task Count Submission
  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainee || taskCountInput === '') return;
    setLoading(true);
    setNotification(null);
    setTaskError(null);

    const res = await taskService.addTaskCount(trainee.traineeId, Number(taskCountInput));
    setLoading(false);

    if (res.success) {
      setTaskError(null);
      setTaskCountInput('');
      // Immediately refresh trainee's task counts list
      const updatedTasks = await taskService.getTaskCounts(trainee.traineeId);
      setTaskCounts(updatedTasks);
      setTaskTab('history');
      setNotification({ type: 'success', text: `Task count (${res.taskCount?.taskCount}) submitted successfully.` });
    } else {
      const errMsg = res.error || 'Failed to submit task count.';
      setTaskError(errMsg);
      setNotification({ type: 'error', text: errMsg });
    }
  };

  // Delete Allocation Entry (Instant 1-Click Delete with Optimistic UI)
  const handleDeleteAllocation = async (allocationId?: number) => {
    if (!allocationId || !trainee) return;
    const prev = [...allocations];
    setAllocations((list) => list.filter((a) => a.id !== allocationId));
    setNotification({ type: 'success', text: 'Allocation record deleted.' });

    const res = await allocationService.deleteAllocation(allocationId, trainee.traineeId);
    if (!res.success) {
      setAllocations(prev);
      setNotification({ type: 'error', text: res.error || 'Failed to delete allocation.' });
    }
  };

  // Delete Task Count Entry (Instant 1-Click Delete with Optimistic UI)
  const handleDeleteTaskCount = async (taskCountId?: number) => {
    if (!taskCountId || !trainee) return;
    const prev = [...taskCounts];
    setTaskCounts((list) => list.filter((t) => t.id !== taskCountId));
    setNotification({ type: 'success', text: 'Task count record deleted.' });

    const res = await taskService.deleteTaskCount(taskCountId, trainee.traineeId);
    if (!res.success) {
      setTaskCounts(prev);
      setNotification({ type: 'error', text: res.error || 'Failed to delete task count.' });
    }
  };

  // Clear All Allocation History
  const handleClearAllAllocations = async () => {
    if (!trainee || allocations.length === 0) return;
    if (!window.confirm('Are you sure you want to clear your entire workstation allocation history?')) return;
    const prev = [...allocations];
    setAllocations([]);
    setNotification({ type: 'success', text: 'All workstation allocation history cleared.' });

    if (allocationService.clearAllocationHistory) {
      const res = await allocationService.clearAllocationHistory(trainee.traineeId);
      if (!res.success) {
        setAllocations(prev);
        setNotification({ type: 'error', text: res.error || 'Failed to clear allocation history.' });
      }
    }
  };

  // Clear All Task History
  const handleClearAllTasks = async () => {
    if (!trainee || taskCounts.length === 0) return;
    if (!window.confirm('Are you sure you want to clear your entire task count history?')) return;
    const prev = [...taskCounts];
    setTaskCounts([]);
    setNotification({ type: 'success', text: 'All task count history cleared.' });

    if (taskService.clearTaskHistory) {
      const res = await taskService.clearTaskHistory(trainee.traineeId);
      if (!res.success) {
        setTaskCounts(prev);
        setNotification({ type: 'error', text: res.error || 'Failed to clear task history.' });
      }
    }
  };

  // Daily Sign-Out with Daily Sign Out Geofence Check
  const handleSignOutSubmit = async () => {
    if (!trainee) return;
    if (!todayAttendance || todayAttendance.status === 'No Show') {
      const errMsg = '🛑 Daily Sign-Out is blocked: No active attendance found for today. Daily Sign-Out is only allowed for trainees who have logged attendance (Present or Late to Work). If you arrived late, please log your attendance first.';
      setSignOutError(errMsg);
      setNotification({ type: 'error', text: errMsg });
      return;
    }
    setLoading(true);
    setNotification(null);
    setSignOutError(null);

    // Fetch fresh geofence settings from central cloud database
    const geoSettings = await settingsService.getGeofenceSettings();
    if (geoSettings.enabled) {
      const locRes = await getDeviceLocation();
      if (!locRes.success || !locRes.coords) {
        setLoading(false);
        const errMsg = locRes.error || 'GPS Location permission required to sign out.';
        setSignOutError(errMsg);
        setNotification({
          type: 'error',
          text: errMsg,
        });
        return;
      }

      const check = checkGeofence(
        locRes.coords.latitude,
        locRes.coords.longitude,
        geoSettings.centerLatitude,
        geoSettings.centerLongitude,
        geoSettings.signOutRadiusMeters
      );

      if (!check.isWithin) {
        setLoading(false);
        const errMsg = `🛑 Daily Sign Out Restricted: You are currently ${check.formattedDistance} away from Etihad Engineering facility. Daily Sign Out is allowed within ${geoSettings.signOutRadiusMeters} meters.`;
        setSignOutError(errMsg);
        setNotification({
          type: 'error',
          text: errMsg,
        });
        return;
      }
    }

    const res = await taskService.submitSignOut(trainee.traineeId);
    setLoading(false);

    if (res.success && res.signOut) {
      setTodaySignOut(res.signOut);
      setSignOutError(null);
      setIsSignOutModalOpen(false);
      setNotification({
        type: 'success',
        text: `Successfully Signed Out! Time: ${res.signOut.signOutTime}`,
      });
    } else {
      const errMsg = res.error || 'Failed to sign out.';
      setSignOutError(errMsg);
      setNotification({ type: 'error', text: errMsg });
    }
  };

  return (
    <div className="main-content" style={{ maxWidth: '800px', paddingBottom: '2.5rem' }}>
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
              <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.85rem', color: '#CBD5E1', flexWrap: 'wrap' }}>
                <span><strong>ID:</strong> {trainee.traineeId}</span>
                <span>•</span>
                <span><strong>Batch:</strong> {trainee.batchId}</span>
                <span>•</span>
                <span><strong>Program:</strong> {trainee.program}</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={handleRefresh} className="btn btn-gold btn-sm" disabled={refreshing}>
                <RefreshCw size={14} className={refreshing ? 'spin-icon' : ''} />
                <span>Refresh</span>
              </button>
              <button onClick={() => setIsChangePassOpen(true)} className="btn btn-outline btn-sm" style={{ color: '#FFFFFF', borderColor: '#C5A059' }}>
                <KeyRound size={14} />
                <span>Password</span>
              </button>
            </div>
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
              Recorded on {formatMediumDate(remarks[0].date)}
            </div>
          </div>
        )}
      </div>

      {/* Four Large Mobile Action Cards */}
      <div className="trainee-grid">
        {/* CARD 1: ATTENDANCE */}
        <div
          className="action-card"
          onClick={() => {
            setAttendanceError(null);
            setIsAttendanceModalOpen(true);
          }}
          style={{
            borderColor: todayAttendance && todayAttendance.status !== 'No Show' ? '#10B981' : '#C5A059',
            backgroundColor: todayAttendance && todayAttendance.status !== 'No Show' ? '#F0FDF4' : '#FFFFFF',
          }}
        >
          <div
            className="action-card-icon"
            style={{
              background: todayAttendance && todayAttendance.status !== 'No Show' ? '#DCFCE7' : '#F4EBE1',
              color: todayAttendance && todayAttendance.status !== 'No Show' ? '#047857' : '#0A192F',
            }}
          >
            <CalendarCheck size={26} />
          </div>
          <div className="action-card-title">ATTENDANCE</div>
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', fontWeight: 600 }}>
            {todayAttendance && todayAttendance.status !== 'No Show' ? (
              <Badge status={todayAttendance.status} />
            ) : todayAttendance?.status === 'No Show' ? (
              <span style={{ color: '#DC2626' }}>No Show (Tap to Check In Late)</span>
            ) : (
              <span style={{ color: '#64748B' }}>Tap to Log Attendance</span>
            )}
          </div>
        </div>

        {/* CARD 2: ALLOCATION */}
        <div
          className="action-card"
          onClick={() => {
            setAllocationError(null);
            setAllocationTab('form');
            setIsAllocationModalOpen(true);
          }}
        >
          <div className="action-card-icon">
            <Compass size={26} />
          </div>
          <div className="action-card-title">ALLOCATION</div>
          {allocations.length > 0 ? (
            <div style={{ marginTop: '0.35rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0A192F' }}>
                {allocations[0].location}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                {formatMediumDate(allocations[0].date)} • Total: {allocations.length}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#64748B' }}>
              Submit Hangar / Aircraft Station
            </div>
          )}
        </div>

        {/* CARD 3: TASK COUNT */}
        <div
          className="action-card"
          onClick={() => {
            setTaskError(null);
            setTaskTab('form');
            setIsTaskModalOpen(true);
          }}
        >
          <div className="action-card-icon">
            <CheckSquare size={26} />
          </div>
          <div className="action-card-title">TASK COUNT</div>
          {taskCounts.length > 0 ? (
            <div style={{ marginTop: '0.35rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0A192F' }}>
                {taskCounts[0].taskCount} {taskCounts[0].taskCount === 1 ? 'Task' : 'Tasks'} Recorded
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                {formatMediumDate(taskCounts[0].date)} • Total: {taskCounts.length}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#64748B' }}>
              Enter Daily Maintenance Tasks
            </div>
          )}
        </div>

        {/* CARD 4: DAILY SIGN-OUT */}
        <div
          className="action-card"
          onClick={() => {
            setSignOutError(null);
            if (!todayAttendance || todayAttendance.status === 'No Show') {
              setSignOutError(
                '🛑 Daily Sign-Out is blocked: No active attendance found for today. Daily Sign-Out is only allowed for trainees who have logged attendance (Present or Late to Work). If you arrived late, please log your attendance first.'
              );
            }
            setIsSignOutModalOpen(true);
          }}
          style={{
            borderColor: todaySignOut ? '#047857' : (!todayAttendance || todayAttendance.status === 'No Show') ? '#FCA5A5' : '#E2E8F0',
            backgroundColor: todaySignOut ? '#F0FDF4' : (!todayAttendance || todayAttendance.status === 'No Show') ? '#FFF5F5' : '#FFFFFF',
          }}
        >
          <div
            className="action-card-icon"
            style={{
              background: todaySignOut ? '#DCFCE7' : (!todayAttendance || todayAttendance.status === 'No Show') ? '#FEE2E2' : '#FEF2F2',
              color: todaySignOut ? '#047857' : '#B91C1C',
            }}
          >
            <LogOut size={26} />
          </div>
          <div className="action-card-title">DAILY SIGN-OUT</div>
          <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', fontWeight: 600, color: todaySignOut ? '#047857' : (!todayAttendance || todayAttendance.status === 'No Show') ? '#DC2626' : '#64748B' }}>
            {todaySignOut
              ? `Signed Out at ${todaySignOut.signOutTime}`
              : (!todayAttendance || todayAttendance.status === 'No Show')
              ? 'Blocked: Log Attendance First'
              : 'Tap to Sign Out for Today'}
          </div>
        </div>
      </div>

      {/* Modal 1: Simple Attendance Logging Modal */}
      <Modal
        isOpen={isAttendanceModalOpen}
        onClose={() => {
          setIsAttendanceModalOpen(false);
          setAttendanceError(null);
        }}
        title="Log Today's Attendance"
      >
        <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
          {/* Prominent in-modal error alert */}
          {attendanceError && (
            <div style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
              <Notification
                type="error"
                message={attendanceError}
                onClose={() => setAttendanceError(null)}
              />
            </div>
          )}

          <div style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: 600 }}>TODAY'S DATE</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0A192F', marginBottom: '1rem' }}>
            {formatDisplayDate(getUAEDateString())}
          </div>

          {todayAttendance && todayAttendance.status !== 'No Show' ? (
            <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1.25rem', borderRadius: '10px', marginTop: '1rem' }}>
              <CheckCircle2 size={32} color="#047857" style={{ margin: '0 auto 0.5rem auto' }} />
              <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#047857' }}>Attendance Successfully Registered</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginTop: '0.85rem', fontSize: '0.85rem', textAlign: 'left' }}>
                <div><strong>Log Time:</strong> {todayAttendance.loginTime}</div>
                <div><strong>Status:</strong> <Badge status={todayAttendance.status} /></div>
              </div>
            </div>
          ) : (
            <div>
              {todayAttendance?.status === 'No Show' && (
                <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.85rem', textAlign: 'left' }}>
                  <strong>⚠️ Status Notice:</strong> You are currently registered as <strong>No Show</strong> for today. Logging attendance below will verify your presence and update your status to <strong>Late to Work</strong>.
                </div>
              )}
              <p style={{ fontSize: '0.9rem', color: '#475569', marginBottom: '1.5rem' }}>
                Click below to record your official attendance timestamp for today. Location will be verified against Etihad Engineering premises.
              </p>

              <button
                onClick={handleLogAttendanceSimple}
                className="btn btn-gold btn-lg"
                style={{ width: '100%' }}
                disabled={loading}
              >
                <CalendarCheck size={20} />
                <span>{loading ? 'Verifying Location & Logging...' : 'Log Attendance'}</span>
              </button>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal 2: Allocation Form & History */}
      <Modal
        isOpen={isAllocationModalOpen}
        onClose={() => {
          setIsAllocationModalOpen(false);
          setAllocationError(null);
        }}
        title="Workstation Allocation & History"
        maxWidth="650px"
      >
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setAllocationTab('form')}
            className={`btn btn-sm ${allocationTab === 'form' ? 'btn-navy' : 'btn-outline'}`}
            style={{ flex: 1, fontWeight: allocationTab === 'form' ? 700 : 500 }}
          >
            + New Allocation
          </button>
          <button
            type="button"
            onClick={() => setAllocationTab('history')}
            className={`btn btn-sm ${allocationTab === 'history' ? 'btn-gold' : 'btn-outline'}`}
            style={{ flex: 1, fontWeight: allocationTab === 'history' ? 700 : 500 }}
          >
            📋 Allocation History ({allocations.length})
          </button>
        </div>

        {allocationError && (
          <div style={{ marginBottom: '1.25rem' }}>
            <Notification
              type="error"
              message={allocationError}
              onClose={() => setAllocationError(null)}
            />
          </div>
        )}

        {allocationTab === 'history' ? (
          <div>
            {allocations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748B', fontStyle: 'italic' }}>
                No workstation allocations submitted yet.
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', padding: '0 2px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
                    {allocations.length} {allocations.length === 1 ? 'record' : 'records'} logged
                  </span>
                  {allocations.length > 1 && (
                    <button
                      type="button"
                      onClick={handleClearAllAllocations}
                      className="btn btn-outline btn-sm"
                      style={{ color: '#DC2626', borderColor: '#FCA5A5', fontSize: '0.72rem', padding: '2px 8px' }}
                    >
                      <Trash2 size={12} />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '4px' }}>
                  {allocations.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        padding: '0.85rem 1rem',
                        borderLeft: '4px solid #C5A059',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        <div style={{ fontWeight: 700, color: '#0A192F', fontSize: '0.95rem' }}>
                          {a.location}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              padding: '2px 8px',
                              borderRadius: '999px',
                              fontWeight: 600,
                              backgroundColor: a.insideOutside === 'Inside' ? '#EFF6FF' : '#FEF3C7',
                              color: a.insideOutside === 'Inside' ? '#1D4ED8' : '#B45309',
                              border: a.insideOutside === 'Inside' ? '1px solid #BFDBFE' : '1px solid #FDE68A',
                            }}
                          >
                            {a.insideOutside} Hangar
                          </span>
                          {a.id && (
                            <button
                              type="button"
                              onClick={() => handleDeleteAllocation(a.id)}
                              className="btn btn-outline btn-sm"
                              style={{
                                color: '#DC2626',
                                borderColor: '#FCA5A5',
                                backgroundColor: '#FEF2F2',
                                padding: '2px 7px',
                                fontSize: '0.72rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                              title="Delete this allocation entry"
                            >
                              <Trash2 size={12} />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.35rem', fontSize: '0.8rem', color: '#475569', marginTop: '0.35rem' }}>
                        <div><strong>A/C Reg:</strong> {a.aircraftRegistration || 'N/A'}</div>
                        <div><strong>A/C Type:</strong> {a.aircraftType || 'N/A'}</div>
                        <div><strong>Manager:</strong> {a.manager || 'N/A'}</div>
                        <div><strong>Engineer:</strong> {a.engineer || 'N/A'}</div>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94A3B8', textAlign: 'right', marginTop: '0.4rem', borderTop: '1px dashed #E2E8F0', paddingTop: '0.35rem' }}>
                        📅 {formatMediumDate(a.date)} • {a.time}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
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
        )}
      </Modal>

      {/* Modal 3: Task Count Form & History */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setTaskError(null);
        }}
        title="Task Count & History"
        maxWidth="600px"
      >
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setTaskTab('form')}
            className={`btn btn-sm ${taskTab === 'form' ? 'btn-navy' : 'btn-outline'}`}
            style={{ flex: 1, fontWeight: taskTab === 'form' ? 700 : 500 }}
          >
            + Submit Task Count
          </button>
          <button
            type="button"
            onClick={() => setTaskTab('history')}
            className={`btn btn-sm ${taskTab === 'history' ? 'btn-gold' : 'btn-outline'}`}
            style={{ flex: 1, fontWeight: taskTab === 'history' ? 700 : 500 }}
          >
            📊 Task History ({taskCounts.length})
          </button>
        </div>

        {taskError && (
          <div style={{ marginBottom: '1.25rem' }}>
            <Notification
              type="error"
              message={taskError}
              onClose={() => setTaskError(null)}
            />
          </div>
        )}

        {taskTab === 'history' ? (
          <div>
            {taskCounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748B', fontStyle: 'italic' }}>
                No task count submissions recorded yet.
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', padding: '0 2px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600 }}>
                    {taskCounts.length} {taskCounts.length === 1 ? 'submission' : 'submissions'} logged
                  </span>
                  {taskCounts.length > 1 && (
                    <button
                      type="button"
                      onClick={handleClearAllTasks}
                      className="btn btn-outline btn-sm"
                      style={{ color: '#DC2626', borderColor: '#FCA5A5', fontSize: '0.72rem', padding: '2px 8px' }}
                    >
                      <Trash2 size={12} />
                      <span>Clear All</span>
                    </button>
                  )}
                </div>

                <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingRight: '4px' }}>
                  {taskCounts.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '8px',
                        padding: '0.75rem 1rem',
                        borderLeft: '4px solid #047857',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#047857' }}>
                          {t.taskCount} {t.taskCount === 1 ? 'Task' : 'Tasks'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '0.15rem' }}>
                          Maintenance Tasks Completed
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0A192F' }}>
                            📅 {formatMediumDate(t.date)}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                            {t.time}
                          </div>
                        </div>
                        {t.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTaskCount(t.id)}
                            className="btn btn-outline btn-sm"
                            style={{
                              color: '#DC2626',
                              borderColor: '#FCA5A5',
                              backgroundColor: '#FEF2F2',
                              padding: '3px 8px',
                              fontSize: '0.72rem',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '3px',
                            }}
                            title="Delete this task count entry"
                          >
                            <Trash2 size={12} />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
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
        )}
      </Modal>

      {/* Modal 4: Daily Sign-Out Confirmation */}
      <Modal
        isOpen={isSignOutModalOpen}
        onClose={() => {
          setIsSignOutModalOpen(false);
          setSignOutError(null);
        }}
        title="Daily Sign-Out Verification"
      >
        <div style={{ textAlign: 'center', padding: '0.5rem 0' }}>
          {/* Prominent in-modal error alert */}
          {signOutError && (
            <div style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
              <Notification
                type="error"
                message={signOutError}
                onClose={() => setSignOutError(null)}
              />
            </div>
          )}

          {todaySignOut ? (
            <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1.25rem', borderRadius: '10px' }}>
              <CheckCircle2 size={32} color="#047857" style={{ margin: '0 auto 0.5rem auto' }} />
              <h4 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#047857' }}>Successfully Signed Out</h4>
              <div style={{ fontSize: '0.95rem', color: '#1E293B', marginTop: '0.5rem' }}>
                Time: <strong>{todaySignOut.signOutTime}</strong>
              </div>
            </div>
          ) : (!todayAttendance || todayAttendance.status === 'No Show') ? (
            <div style={{ padding: '0.5rem 0' }}>
              <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B', padding: '1rem', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.88rem', textAlign: 'left', lineHeight: 1.5 }}>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  🛑 Sign-Out Blocked: No Attendance Found
                </div>
                Daily Sign-Out is only permitted for trainees who have logged attendance for today (with status <strong>Present</strong> or <strong>Late to Work</strong>).
                <br /><br />
                {todayAttendance?.status === 'No Show' ? (
                  <span>Your current status is <strong>No Show</strong>. Please log your attendance first to change your status to <strong>Late to Work</strong>, which will unlock sign-out.</span>
                ) : (
                  <span>You have not recorded attendance yet for today. Please log your attendance first.</span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setIsSignOutModalOpen(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-navy"
                  onClick={() => {
                    setIsSignOutModalOpen(false);
                    setAttendanceError(null);
                    setIsAttendanceModalOpen(true);
                  }}
                >
                  <CalendarCheck size={16} />
                  <span>Log Attendance Now</span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '1rem', color: '#0A192F', fontWeight: 600, marginBottom: '1.5rem' }}>
                Are you sure you want to sign out for today? Location will be verified against Etihad Engineering premises.
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
                  <span>{loading ? 'Verifying Location & Signing Out...' : 'Confirm Sign-Out'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal 5: View Remarks History */}
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
                Recorded on {formatMediumDate(r.date)}
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* Modal 6: Change Password */}
      <ChangePasswordModal
        isOpen={isChangePassOpen}
        onClose={() => setIsChangePassOpen(false)}
        currentUser={currentUser}
      />
    </div>
  );
};
