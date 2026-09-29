import React, { useState, useEffect, useMemo } from 'react';
import { TraineeLogSummary, Allocation, TaskCount, User, AttendanceStatus, Batch } from '../../types';
import { attendanceService } from '../../services/hybridAttendanceService';
import { allocationService } from '../../services/hybridAllocationService';
import { taskService } from '../../services/hybridTaskService';
import { emailService } from '../../services/emailService';
import { holidayService } from '../../services/hybridHolidayService';
import { traineeService } from '../../services/hybridTraineeService';
import {
  getUAEDateString,
  formatDisplayDate,
  formatMediumDate,
  getPreviousDateString,
  getNextDateString,
  isWeekend,
  isPastCutoffTime,
} from '../../utils/timezone';
import { Badge } from '../../components/common/Badge';
import { Modal } from '../../components/common/Modal';
import { Notification } from '../../components/common/Notification';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Compass,
  CheckSquare,
  UserCheck,
  Coffee,
  Save,
  Sun,
  Search,
  Filter,
  ArrowUpDown,
  RotateCcw,
  X,
} from 'lucide-react';

interface TraineeLogsTabProps {
  refreshTrigger?: number;
}

export const TraineeLogsTab: React.FC<TraineeLogsTabProps> = ({ refreshTrigger }) => {
  const [selectedDate, setSelectedDate] = useState<string>(getUAEDateString());
  const [logs, setLogs] = useState<TraineeLogSummary[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedBatch, setSelectedBatch] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<string>('batch_staff');
  const [statusEdits, setStatusEdits] = useState<Record<string, AttendanceStatus>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [holidayName, setHolidayName] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modals state
  const [allocationModal, setAllocationModal] = useState<{ open: boolean; traineeId: string; name: string } | null>(null);
  const [allocationsList, setAllocationsList] = useState<Allocation[]>([]);

  const [taskModal, setTaskModal] = useState<{ open: boolean; traineeId: string; name: string } | null>(null);
  const [tasksList, setTasksList] = useState<TaskCount[]>([]);

  const [userDetailsModal, setUserDetailsModal] = useState<{ open: boolean; log: TraineeLogSummary | null }>(
    { open: false, log: null }
  );

  const loadLogs = async (dateStr: string) => {
    const [data, bList, holidays] = await Promise.all([
      attendanceService.getTraineeLogsForDate(dateStr),
      traineeService.getBatches(),
      holidayService.getAllHolidays(),
    ]);

    setLogs(data);
    setBatches(bList || []);

    // Preserve ONLY dirty, unsaved status dropdown choices made by the user
    setStatusEdits((prev) => {
      const dirty: Record<string, AttendanceStatus> = {};
      Object.entries(prev).forEach(([id, st]) => {
        const item = data.find((d) => String(d.traineeId).trim().toUpperCase() === String(id).trim().toUpperCase());
        if (item && item.status !== st) {
          dirty[id] = st;
        }
      });
      return dirty;
    });

    // Check holiday
    const matchedHoliday = holidays.find((h) => h.date === dateStr);
    setHolidayName(matchedHoliday ? matchedHoliday.name : null);
  };

  useEffect(() => {
    loadLogs(selectedDate);

    // Auto-refresh attendance logs seamlessly every 5 seconds in background
    const interval = setInterval(() => {
      loadLogs(selectedDate);

      // If viewing today's logs and past 08:00 AM cutoff, trigger automated no-show emails once if not already sent today
      if (selectedDate === getUAEDateString() && isPastCutoffTime(selectedDate)) {
        emailService.triggerAutomatedNoShowEmails(selectedDate).catch((e) =>
          console.warn('Automated No Show check error:', e)
        );
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [selectedDate, refreshTrigger]);

  const handlePrevDay = () => {
    setSelectedDate(getPreviousDateString(selectedDate));
  };

  const handleNextDay = () => {
    setSelectedDate(getNextDateString(selectedDate));
  };

  const handleStatusChange = async (log: TraineeLogSummary, newStatus: AttendanceStatus) => {
    setStatusEdits((prev) => ({ ...prev, [log.traineeId]: newStatus }));
    await handleSaveStatus(log, newStatus);
  };

  const handleSaveStatus = async (log: TraineeLogSummary, overrideStatus?: AttendanceStatus) => {
    const traineeId = log.traineeId;
    const targetStatus = overrideStatus || statusEdits[traineeId] || log.status;
    const prevStatus = log.status;
    const existingLoginTime = log.loginTime;

    // Calculate new loginTime and signOutTime according to exact user rules:
    let newLoginTime = existingLoginTime;
    let newSignOutTime = log.signOutTime;

    if (targetStatus === 'No Show') {
      newLoginTime = '-';
      newSignOutTime = '-';
    } else if (targetStatus === 'Late to Work') {
      newLoginTime = 'Logged in after 7:30 am';
    } else if (targetStatus === 'Present') {
      if (prevStatus === 'Late to Work' && existingLoginTime && existingLoginTime !== '-' && existingLoginTime !== 'N/A') {
        newLoginTime = existingLoginTime;
      } else if (
        prevStatus === 'No Show' ||
        !existingLoginTime ||
        existingLoginTime === '-' ||
        existingLoginTime === 'N/A' ||
        existingLoginTime.startsWith('Manual')
      ) {
        newLoginTime = 'Logged in before 7:30am';
      } else {
        newLoginTime = existingLoginTime;
      }
    } else {
      newLoginTime = `Manual (${targetStatus})`;
      newSignOutTime = '-';
    }

    // 1. INSTANT OPTIMISTIC UI UPDATE ON FIRST CLICK!
    setLogs((prevLogs) =>
      prevLogs.map((l) =>
        String(l.traineeId).trim().toUpperCase() === String(traineeId).trim().toUpperCase()
          ? {
              ...l,
              status: targetStatus,
              loginTime: newLoginTime,
              signOutTime: newSignOutTime,
            }
          : l
      )
    );
    setStatusEdits((prev) => ({ ...prev, [traineeId]: targetStatus }));
    setSavingId(traineeId);
    setNotification(null);

    // 2. Perform DB update
    const updateRes = await attendanceService.updateTraineeAttendanceStatus(
      traineeId,
      selectedDate,
      targetStatus,
      prevStatus,
      existingLoginTime
    );

    if (!updateRes.success) {
      setNotification({
        type: 'error',
        text: `Failed to update status for ${log.name}: ${updateRes.error || 'Database error'}`,
      });
      setSavingId(null);
      await loadLogs(selectedDate);
      return;
    }

    // Clear the edit state for this trainee since it's successfully saved
    setStatusEdits((prev) => {
      const next = { ...prev };
      delete next[traineeId];
      return next;
    });

    // 3. Dispatch notification email ONLY to this one trainee if Late to Work or No Show
    const targetTrainee = log;
    if (targetTrainee && targetTrainee.username) {
      if (targetStatus === 'Late to Work') {
        const res = await emailService.sendLateToWorkEmail(
          targetTrainee.name,
          targetTrainee.username,
          selectedDate,
          'Logged in after 7:30 am',
          traineeId,
          undefined,
          true, // isManual
          true  // force
        );
        if (res.success) {
          setNotification({
            type: 'success',
            text: `Status for ${targetTrainee.name} updated to "Late to Work". Email notification dispatched ONLY to ${targetTrainee.username}!`,
          });
        } else {
          setNotification({
            type: 'error',
            text: `Status updated to "Late to Work", but email dispatch returned: ${res.error || 'Failed to dispatch'}`,
          });
        }
      } else if (targetStatus === 'No Show') {
        const res = await emailService.sendNoShowEmail(
          targetTrainee.name,
          targetTrainee.username,
          selectedDate,
          traineeId,
          undefined,
          true // force
        );
        if (res.success) {
          setNotification({
            type: 'success',
            text: `Status for ${targetTrainee.name} updated to "No Show". Email notification dispatched ONLY to ${targetTrainee.username}!`,
          });
        } else {
          setNotification({
            type: 'error',
            text: `Status updated to "No Show", but email dispatch returned: ${res.error || 'Failed to dispatch'}`,
          });
        }
      } else {
        setNotification({
          type: 'success',
          text: `Status for ${targetTrainee.name} updated to "${targetStatus}".`,
        });
      }
    } else {
      setNotification({
        type: 'success',
        text: `Status for ${targetTrainee.name} updated to "${targetStatus}".`,
      });
    }

    setSavingId(null);
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

  const compareBatchAndStaff = (a: TraineeLogSummary, b: TraineeLogSummary) => {
    const batchA = (a.batch || '').trim();
    const batchB = (b.batch || '').trim();
    const bComp = batchA.localeCompare(batchB, undefined, { numeric: true, sensitivity: 'base' });
    if (bComp !== 0) return bComp;
    const idA = String(a.traineeId || '').trim();
    const idB = String(b.traineeId || '').trim();
    return idA.localeCompare(idB, undefined, { numeric: true, sensitivity: 'base' });
  };

  const allBatchOptions = useMemo(() => {
    const set = new Set<string>();
    batches.forEach((b) => {
      if (b.name && b.name.trim()) set.add(b.name.trim());
    });
    logs.forEach((l) => {
      if (l.batch && l.batch.trim()) set.add(l.batch.trim());
    });
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [batches, logs]);

  const filteredLogs = useMemo(() => {
    let result = [...logs];

    // 1. Batch filter
    if (selectedBatch !== 'ALL') {
      const norm = selectedBatch.trim().toUpperCase();
      result = result.filter((l) => (l.batch || '').trim().toUpperCase() === norm);
    }

    // 2. Search query (trainee name, staff no, or aircraft registration)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (l) =>
          (l.name || '').toLowerCase().includes(q) ||
          String(l.traineeId || '').toLowerCase().includes(q) ||
          (l.latestAllocationAircraft || '').toLowerCase().includes(q)
      );
    }

    // 3. Sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'staff_asc':
          return String(a.traineeId || '').trim().localeCompare(String(b.traineeId || '').trim(), undefined, { numeric: true, sensitivity: 'base' });
        case 'staff_desc':
          return String(b.traineeId || '').trim().localeCompare(String(a.traineeId || '').trim(), undefined, { numeric: true, sensitivity: 'base' });
        case 'name_asc':
          return (a.name || '').trim().localeCompare((b.name || '').trim(), undefined, { sensitivity: 'base' });
        case 'name_desc':
          return (b.name || '').trim().localeCompare((a.name || '').trim(), undefined, { sensitivity: 'base' });
        case 'batch_asc': {
          const bc = (a.batch || '').trim().localeCompare((b.batch || '').trim(), undefined, { numeric: true, sensitivity: 'base' });
          return bc !== 0 ? bc : String(a.traineeId || '').trim().localeCompare(String(b.traineeId || '').trim(), undefined, { numeric: true, sensitivity: 'base' });
        }
        case 'status': {
          const sc = (a.status || '').localeCompare(b.status || '');
          return sc !== 0 ? sc : compareBatchAndStaff(a, b);
        }
        case 'batch_staff':
        default:
          return compareBatchAndStaff(a, b);
      }
    });

    return result;
  }, [logs, selectedBatch, searchQuery, sortBy]);

  const selectedIsWeekend = isWeekend(selectedDate);

  return (
    <div>
      {notification && <Notification type={notification.type} message={notification.text} onClose={() => setNotification(null)} />}
      <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0A192F' }}>Trainee Attendance & Activity Logs</h2>
        <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
          Automated daily attendance status (Present, Late, No Show) with manual status override options (Leave, Sick, Military, Training, Stand Down).
        </p>
      </div>

      {/* Date Navigation Bar */}
      <div className="date-navigator">
        <button onClick={handlePrevDay} className="btn btn-outline btn-sm">
          <ChevronLeft size={18} />
        </button>

        <div className="date-display" style={{ minWidth: '300px' }}>
          <CalendarIcon size={20} color="#C5A059" />
          <span>{formatDisplayDate(selectedDate, true)}</span>
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

      {/* Weekend Banner */}
      {selectedIsWeekend && (
        <div
          style={{
            background: '#EFF6FF',
            border: '1px solid #BFDBFE',
            color: '#1E40AF',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <Coffee size={18} color="#2563EB" />
          <span>WEEKEND (No attendance logs or automated emails on weekends)</span>
        </div>
      )}

      {/* Holiday Banner */}
      {holidayName && (
        <div
          style={{
            background: '#FDF4FF',
            border: '1px solid #F5D0FE',
            color: '#9333EA',
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            marginBottom: '1rem',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          <Sun size={18} color="#9333EA" />
          <span>PUBLIC / COMPANY HOLIDAY: {holidayName.toUpperCase()} (Automated No-Show emails paused)</span>
        </div>
      )}

      {/* Search, Filter & Sort Controls Bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#F8FAFC',
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          border: '1px solid #E2E8F0',
          marginBottom: '1rem',
        }}
      >
        {/* Left: Search Bar */}
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '380px' }}>
          <Search
            size={16}
            color="#64748B"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          />
          <input
            type="text"
            className="form-control"
            placeholder="Search trainee name, staff no, aircraft..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              paddingLeft: '2rem',
              paddingRight: searchQuery ? '2rem' : '0.75rem',
              height: '36px',
              fontSize: '0.85rem',
              borderColor: '#CBD5E1',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#94A3B8',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Clear Search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Right Controls: Batch Filter + Sort By Selector + Reset + Count */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
          {/* Batch Filter Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Filter size={15} color="#C5A059" />
            <select
              className="form-control"
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              style={{
                height: '36px',
                fontSize: '0.82rem',
                fontWeight: 600,
                borderColor: selectedBatch !== 'ALL' ? '#C5A059' : '#CBD5E1',
                background: selectedBatch !== 'ALL' ? '#FFFBEB' : '#FFFFFF',
                minWidth: '155px',
              }}
              title="Filter by Batch (All batches added in the system)"
            >
              <option value="ALL">All Batches ({logs.length})</option>
              {allBatchOptions.map((b) => {
                const count = logs.filter((l) => (l.batch || '').trim().toUpperCase() === b.toUpperCase()).length;
                return (
                  <option key={b} value={b}>
                    Batch: {b} ({count})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Sort By Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <ArrowUpDown size={15} color="#0A192F" />
            <select
              className="form-control"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                height: '36px',
                fontSize: '0.82rem',
                fontWeight: 600,
                borderColor: sortBy !== 'batch_staff' ? '#0A192F' : '#CBD5E1',
                minWidth: '190px',
              }}
              title="Sort Trainees"
            >
              <option value="batch_staff">Sort: Batch & Staff No (Default)</option>
              <option value="staff_asc">Sort: Staff No (Low to High)</option>
              <option value="staff_desc">Sort: Staff No (High to Low)</option>
              <option value="name_asc">Sort: Trainee Name (A - Z)</option>
              <option value="name_desc">Sort: Trainee Name (Z - A)</option>
              <option value="batch_asc">Sort: Batch (A - Z)</option>
              <option value="status">Sort: Status</option>
            </select>
          </div>

          {/* Reset Filters & Search Button */}
          {(searchQuery || selectedBatch !== 'ALL' || sortBy !== 'batch_staff') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedBatch('ALL');
                setSortBy('batch_staff');
              }}
              className="btn btn-outline btn-sm"
              style={{ height: '36px', fontSize: '0.78rem', padding: '0 0.6rem', color: '#64748B' }}
              title="Reset all filters and sorting to default"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          )}

          {/* Showing Count Badge */}
          <div
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#475569',
              background: '#EDF2F7',
              padding: '0.35rem 0.65rem',
              borderRadius: '6px',
              whiteSpace: 'nowrap',
            }}
          >
            Showing <strong style={{ color: '#0A192F' }}>{filteredLogs.length}</strong> of {logs.length}
          </div>
        </div>
      </div>

      {/* Trainee Logs Table */}
      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Sr. No</th>
              <th>Staff No</th>
              <th>Name</th>
              <th>Batch</th>
              <th>Status & Manual Override</th>
              <th>Log In Time</th>
              <th>Sign Out Time</th>
              <th style={{ textAlign: 'center' }}>Allocation</th>
              <th style={{ textAlign: 'center' }}>Task Count</th>
              <th style={{ textAlign: 'center' }}>User Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748B' }}>
                  {logs.length === 0 ? (
                    'No trainees registered in the system yet.'
                  ) : (
                    <div>
                      <p style={{ fontWeight: 600, marginBottom: '0.6rem', color: '#1E293B', fontSize: '0.9rem' }}>
                        No trainees match your search or filter criteria.
                      </p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedBatch('ALL');
                          setSortBy('batch_staff');
                        }}
                        className="btn btn-outline btn-sm"
                        style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <RotateCcw size={13} />
                        <span>Reset Filters & Search</span>
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              filteredLogs.map((log, index) => (
                <tr key={log.traineeId}>
                  <td>{index + 1}</td>
                  <td style={{ fontWeight: 700, color: '#0A192F' }}>{log.traineeId}</td>
                  <td style={{ fontWeight: 600 }}>{log.name}</td>
                  <td>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        background: '#F1F5F9',
                        color: '#334155',
                        border: '1px solid #CBD5E1',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {log.batch || '-'}
                    </span>
                  </td>
                  <td style={{ minWidth: '220px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <div>
                        <Badge status={log.status} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <select
                          className="form-control"
                          style={{
                            padding: '0.2rem 0.4rem',
                            fontSize: '0.75rem',
                            height: '28px',
                            width: '135px',
                            borderColor: '#CBD5E1',
                            borderRadius: '4px',
                          }}
                          disabled={savingId === log.traineeId}
                          value={statusEdits[log.traineeId] !== undefined ? statusEdits[log.traineeId] : log.status}
                          onChange={(e) => handleStatusChange(log, e.target.value as AttendanceStatus)}
                        >
                          <option value="Present">Present</option>
                          <option value="Late to Work">Late to Work</option>
                          <option value="No Show">No Show</option>
                          <option value="Annual Leave">Annual Leave</option>
                          <option value="Sick Leave">Sick Leave</option>
                          <option value="Military Services">Military Services</option>
                          <option value="Training">Training</option>
                          <option value="Stand Down">Stand Down</option>
                        </select>
                        <button
                          onClick={() => handleSaveStatus(log, statusEdits[log.traineeId])}
                          disabled={savingId === log.traineeId}
                          className="btn btn-navy btn-sm"
                          style={{
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.72rem',
                            height: '28px',
                            lineHeight: 1,
                          }}
                          title="Save Status Override"
                        >
                          <Save size={12} />
                          <span>{savingId === log.traineeId ? 'Saving...' : 'Save'}</span>
                        </button>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight: 600, color: '#1E293B' }}>{log.loginTime}</td>
                  <td style={{ fontWeight: 600, color: '#475569' }}>{log.signOutTime}</td>

                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => openAllocationModal(log.traineeId, log.name)}
                      className={log.latestAllocationAircraft ? "btn btn-gold btn-sm" : "btn btn-outline btn-sm"}
                      style={{
                        minWidth: '95px',
                        padding: '0.25rem 0.6rem',
                        fontSize: '0.8rem',
                        fontWeight: log.latestAllocationAircraft ? 700 : 500,
                        color: log.latestAllocationAircraft ? undefined : '#64748B',
                      }}
                      title={log.latestAllocationAircraft ? `Current Aircraft: ${log.latestAllocationAircraft} (Click to view history)` : "No allocation submitted yet. Click to view history."}
                    >
                      <Compass size={13} />
                      <span>{log.latestAllocationAircraft || '-'}</span>
                    </button>
                  </td>

                  <td style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => openTaskModal(log.traineeId, log.name)}
                      className={log.latestTaskCount !== null ? "btn btn-navy btn-sm" : "btn btn-outline btn-sm"}
                      style={{
                        minWidth: '70px',
                        padding: '0.25rem 0.6rem',
                        fontSize: '0.8rem',
                        fontWeight: log.latestTaskCount !== null ? 700 : 500,
                        color: log.latestTaskCount !== null ? undefined : '#64748B',
                      }}
                      title={log.latestTaskCount !== null ? `Last Submitted: ${log.latestTaskCount} tasks (Click to view history)` : "No task count submitted yet. Click to view history."}
                    >
                      <CheckSquare size={13} />
                      <span>{log.latestTaskCount !== null ? log.latestTaskCount : '-'}</span>
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
                        <td>{formatMediumDate(a.date)} • {a.time}</td>
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
                  Submitted on {formatMediumDate(tasksList[0].date)} at {tasksList[0].time}
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
                        <td>{formatMediumDate(t.date)}</td>
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
