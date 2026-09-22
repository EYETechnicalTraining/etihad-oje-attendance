import React, { useState, useEffect } from 'react';
import { TraineeLogSummary, Allocation, TaskCount, User } from '../../types';
import { attendanceService } from '../../services/hybridAttendanceService';
import { allocationService } from '../../services/hybridAllocationService';
import { taskService } from '../../services/hybridTaskService';
import {
  getUAEDateString,
  formatDisplayDate,
  getPreviousDateString,
  getNextDateString,
} from '../../utils/timezone';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Compass,
  CheckSquare,
  UserCheck,
  Smartphone,
  Shield,
  Plane,
} from 'lucide-react';

export const TraineeLogsTab: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(getUAEDateString());
  const [logs, setLogs] = useState<TraineeLogSummary[]>([]);

  // Modals state
  const [allocationModal, setAllocationModal] = useState<{ open: boolean; traineeId: string; name: string } | null>(null);
  const [allocationsList, setAllocationsList] = useState<Allocation[]>([]);

  const [taskModal, setTaskModal] = useState<{ open: boolean; traineeId: string; name: string } | null>(null);
  const [tasksList, setTasksList] = useState<TaskCount[]>([]);

  const [userDetailsModal, setUserDetailsModal] = useState<{ open: boolean; log: TraineeLogSummary | null }>(
    { open: false, log: null }
  );

  const loadLogs = async (dateStr: string) => {
    const data = await attendanceService.getTraineeLogsForDate(dateStr);
    setLogs(data);
  };

  useEffect(() => {
    loadLogs(selectedDate);
  }, [selectedDate]);

  const handlePrevDay = () => {
    setSelectedDate(getPreviousDateString(selectedDate));
  };

  const handleNextDay = () => {
    setSelectedDate(getNextDateString(selectedDate));
  };

  // Open Allocation History Modal
  const openAllocationModal = async (traineeId: string, name: string) => {
    const list = await allocationService.getAllocations(traineeId);
    setAllocationsList(list);
    setAllocationModal({ open: true, traineeId, name });
  };

  // Open Task Count History Modal
  const openTaskModal = async (traineeId: string, name: string) => {
    const list = await taskService.getTaskCounts(traineeId);
    setTasksList(list);
    setTaskModal({ open: true, traineeId, name });
  };

  return (
    <div>
      <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0A192F' }}>Trainee Attendance & Activity Logs</h2>
        <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
          Daily attendance status, workstation allocations, task completions, and daily sign-out timestamps.
        </p>
      </div>

      {/* Date Navigation Bar */}
      <div className="date-navigator">
        <button onClick={handlePrevDay} className="btn btn-outline btn-sm">
          <ChevronLeft size={18} />
        </button>

        <div className="date-display">
          <CalendarIcon size={20} color="#C5A059" />
          <span>{formatDisplayDate(selectedDate)}</span>
        </div>

        <button onClick={handleNextDay} className="btn btn-outline btn-sm">
          <ChevronRight size={18} />
        </button>

        <input
          type="date"
          className="form-control"
          style={{ width: 'auto', padding: '0.35rem 0.5rem' }}
          value={selectedDate}
          onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
        />
      </div>

      {/* Trainee Logs Table */}
      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Sr. No</th>
              <th>Staff No</th>
              <th>Name</th>
              <th>Status</th>
              <th>Log In Time</th>
              <th>Sign Out Time</th>
              <th style={{ textAlign: 'center' }}>Allocation</th>
              <th style={{ textAlign: 'center' }}>Task Count</th>
              <th style={{ textAlign: 'center' }}>User Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                  No trainees registered in the system yet.
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.traineeId}>
                  <td>{log.srNo}</td>
                  <td style={{ fontWeight: 700, color: '#0A192F' }}>{log.traineeId}</td>
                  <td style={{ fontWeight: 600 }}>{log.name}</td>
                  <td>
                    <Badge status={log.status} />
                  </td>
                  <td style={{ fontWeight: 600, color: '#1E293B' }}>{log.loginTime}</td>
                  <td style={{ fontWeight: 600, color: '#475569' }}>{log.signOutTime}</td>

                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => openAllocationModal(log.traineeId, log.name)}
                      className="btn btn-gold btn-sm"
                    >
                      <Compass size={13} />
                      <span>Allocations ({log.allocationCount})</span>
                    </button>
                  </td>

                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => openTaskModal(log.traineeId, log.name)}
                      className="btn btn-navy btn-sm"
                    >
                      <CheckSquare size={13} />
                      <span>Task Count ({log.latestTaskCount !== null ? log.latestTaskCount : '-'})</span>
                    </button>
                  </td>

                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => setUserDetailsModal({ open: true, log })}
                      className="btn btn-outline btn-sm"
                    >
                      <UserCheck size={13} />
                      <span>Details</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Allocation Modal */}
      {allocationModal && (
        <Modal
          isOpen={allocationModal.open}
          onClose={() => setAllocationModal(null)}
          title={`Allocation Details: ${allocationModal.name} (${allocationModal.traineeId})`}
          maxWidth="700px"
        >
          {allocationsList.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
              No allocation records submitted by this trainee yet.
            </div>
          ) : (
            <div>
              <div style={{ background: '#F8FAFC', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#C5A059', textTransform: 'uppercase' }}>
                  LATEST ALLOCATION
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  <div><strong>Location/Hangar:</strong> {allocationsList[0].location}</div>
                  <div><strong>Inside/Outside:</strong> {allocationsList[0].insideOutside}</div>
                  <div><strong>Aircraft Reg:</strong> {allocationsList[0].aircraftRegistration}</div>
                  <div><strong>Aircraft Type:</strong> {allocationsList[0].aircraftType}</div>
                  <div><strong>Manager:</strong> {allocationsList[0].manager}</div>
                  <div><strong>Engineer:</strong> {allocationsList[0].engineer}</div>
                </div>
              </div>

              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', color: '#0A192F' }}>
                Allocation History
              </h4>
              <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                <table className="custom-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>Date & Time</th>
                      <th>Location</th>
                      <th>Type</th>
                      <th>Aircraft Reg</th>
                      <th>Aircraft Type</th>
                      <th>Manager / Engineer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allocationsList.map((a) => (
                      <tr key={a.id}>
                        <td>{a.date} {a.time}</td>
                        <td>{a.location}</td>
                        <td>{a.insideOutside}</td>
                        <td style={{ fontWeight: 700 }}>{a.aircraftRegistration}</td>
                        <td>{a.aircraftType}</td>
                        <td>{a.manager} / {a.engineer}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Task Count Modal */}
      {taskModal && (
        <Modal
          isOpen={taskModal.open}
          onClose={() => setTaskModal(null)}
          title={`Task Count Details: ${taskModal.name} (${taskModal.traineeId})`}
          maxWidth="600px"
        >
          {tasksList.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#64748B' }}>
              No task count entries submitted by this trainee yet.
            </div>
          ) : (
            <div>
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', textAlign: 'center' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>
                  LATEST TASK COUNT
                </span>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#0A192F' }}>
                  {tasksList[0].taskCount} Tasks
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                  Submitted on {tasksList[0].date} at {tasksList[0].time}
                </div>
              </div>

              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', color: '#0A192F' }}>
                Task Count History
              </h4>
              <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                <table className="custom-table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Submission Time</th>
                      <th style={{ textAlign: 'right' }}>Tasks Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasksList.map((t) => (
                      <tr key={t.id}>
                        <td>{t.date}</td>
                        <td>{t.time}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#0A192F' }}>
                          {t.taskCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* User Details Modal */}
      {userDetailsModal.log && (
        <Modal
          isOpen={userDetailsModal.open}
          onClose={() => setUserDetailsModal({ open: false, log: null })}
          title={`Account Details: ${userDetailsModal.log.name}`}
          maxWidth="500px"
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.85rem' }}>
            <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>USERNAME</span>
              <div style={{ fontWeight: 700, color: '#0A192F' }}>{userDetailsModal.log.username}</div>
            </div>

            <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>ACCOUNT STATUS</span>
              <div style={{ fontWeight: 700 }}>
                {userDetailsModal.log.accountStatus === 'Active' ? (
                  <span style={{ color: '#047857' }}>● Active</span>
                ) : (
                  <span style={{ color: '#B91C1C' }}>● Disabled</span>
                )}
              </div>
            </div>

            <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>LAST PASSWORD CHANGE</span>
              <div style={{ fontWeight: 600, color: '#1E293B' }}>
                {userDetailsModal.log.lastPasswordChange || 'Default Initial Password'}
              </div>
            </div>

            <div style={{ background: '#F8FAFC', padding: '0.85rem', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>WEBAUTHN / PASSKEY REGISTERED</span>
              <div style={{ fontWeight: 700, color: userDetailsModal.log.passkeyRegistered ? '#047857' : '#B91C1C' }}>
                {userDetailsModal.log.passkeyRegistered ? 'YES (Device Biometrics Enabled)' : 'NO'}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
