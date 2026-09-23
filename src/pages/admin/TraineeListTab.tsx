import React, { useState, useEffect } from 'react';
import { Trainee, Batch, User, Holiday } from '../../types';
import { traineeService } from '../../services/hybridTraineeService';
import { holidayService } from '../../services/hybridHolidayService';
import { Modal } from '../../components/common/Modal';
import { Notification } from '../../components/common/Notification';
import { TraineeProfileModal } from './TraineeProfileModal';
import { PlusCircle, Trash2, UserPlus, Eye, Search, Calendar, Sun, Save } from 'lucide-react';

interface TraineeListTabProps {
  currentUser: User;
}

export const TraineeListTab: React.FC<TraineeListTabProps> = ({ currentUser }) => {
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);

  // Form inputs for Trainee
  const [traineeIdInput, setTraineeIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [batchInput, setBatchInput] = useState('');
  const [programInput, setProgramInput] = useState('');

  // Batch modal
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');

  // Holiday form
  const [holidayDateInput, setHolidayDateInput] = useState('');
  const [holidayNameInput, setHolidayNameInput] = useState('');
  const [addingHoliday, setAddingHoliday] = useState(false);

  // Profile modal
  const [selectedTrainee, setSelectedTrainee] = useState<Trainee | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [sortBy, setSortBy] = useState<'traineeId' | 'batchId' | 'name'>('traineeId');

  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    const tList = await traineeService.getAllTrainees();
    const bList = await traineeService.getBatches();
    const hList = await holidayService.getAllHolidays();
    setTrainees(tList);
    setBatches(bList);
    setHolidays(hList);
    if (bList.length > 0 && !batchInput) {
      setBatchInput(bList[0].name);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddTrainee = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    if (!batchInput) {
      setNotification({ type: 'error', text: 'Please select a batch or register a batch first.' });
      return;
    }

    setLoading(true);

    const res = await traineeService.addTrainee({
      traineeId: traineeIdInput.trim(),
      name: nameInput.trim(),
      email: emailInput.trim(),
      batchId: batchInput,
      program: programInput.trim(),
      active: true,
    });

    setLoading(false);

    if (res.success && res.trainee) {
      setNotification({
        type: 'success',
        text: `Trainee ${res.trainee.name} added successfully! Default Password: Etihad@${res.trainee.traineeId}`,
      });
      setTraineeIdInput('');
      setNameInput('');
      setEmailInput('');
      setProgramInput('');
      loadData();
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to add trainee.' });
    }
  };

  const handleRemoveTrainee = async (traineeId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove trainee ${name} (ID: ${traineeId})? This action cannot be undone.`)) {
      return;
    }

    setNotification(null);
    const res = await traineeService.removeTrainee(traineeId);

    if (res.success) {
      setNotification({ type: 'success', text: `Trainee ${name} removed from system.` });
      loadData();
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to remove trainee.' });
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchName.trim()) return;

    setNotification(null);
    const res = await traineeService.addBatch(newBatchName.trim());

    if (res.success && res.batch) {
      setNotification({ type: 'success', text: `Batch "${res.batch.name}" registered successfully.` });
      setNewBatchName('');
      setIsBatchModalOpen(false);
      loadData();
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to create batch.' });
    }
  };

  const handleDeleteBatch = async (batchId: number, name: string) => {
    if (!confirm(`Delete batch "${name}"? Existing trainees assigned to this batch will remain.`)) return;

    const res = await traineeService.deleteBatch(batchId);
    if (res.success) {
      setNotification({ type: 'success', text: `Batch "${name}" deleted.` });
      loadData();
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to delete batch.' });
    }
  };

  // Add Holiday Handler
  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayDateInput || !holidayNameInput.trim()) return;

    setAddingHoliday(true);
    setNotification(null);

    const res = await holidayService.addHoliday(holidayDateInput, holidayNameInput.trim());
    setAddingHoliday(false);

    if (res.success) {
      setNotification({
        type: 'success',
        text: `Holiday "${holidayNameInput}" on ${holidayDateInput} registered successfully! Attendance emails & No-Show status will be paused on this day.`,
      });
      setHolidayDateInput('');
      setHolidayNameInput('');
      loadData();
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to add holiday.' });
    }
  };

  // Delete Holiday Handler
  const handleDeleteHoliday = async (date: string, name: string) => {
    if (!confirm(`Delete holiday "${name}" (${date})?`)) return;

    const res = await holidayService.deleteHoliday(date);
    if (res.success) {
      setNotification({ type: 'success', text: `Holiday "${name}" removed.` });
      loadData();
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to delete holiday.' });
    }
  };

  // Filter & Sort Trainees
  const filteredTrainees = trainees.filter((t) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      t.name.toLowerCase().includes(q) ||
      t.traineeId.toLowerCase().includes(q) ||
      t.email.toLowerCase().includes(q) ||
      t.program.toLowerCase().includes(q);

    const matchesBatch = batchFilter ? t.batchId === batchFilter : true;
    return matchesSearch && matchesBatch;
  });

  filteredTrainees.sort((a, b) => {
    if (sortBy === 'traineeId') return a.traineeId.localeCompare(b.traineeId, undefined, { numeric: true });
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'batchId') return a.batchId.localeCompare(b.batchId);
    return 0;
  });

  return (
    <div>
      <div style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0A192F' }}>Trainee & Batch Management</h2>
        <p style={{ fontSize: '0.85rem', color: '#64748B' }}>
          Add new trainees, register batches, manage public/company holidays, and view trainee profiles.
        </p>
      </div>

      {notification && <Notification type={notification.type} message={notification.text} onClose={() => setNotification(null)} />}

      {/* Holiday Management Section */}
      <div className="card" style={{ borderLeft: '5px solid #9333EA', marginBottom: '1.5rem' }}>
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sun size={20} color="#9333EA" />
            <span>Public & Company Holidays Management</span>
          </span>
        </div>
        <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '1rem' }}>
          Mark national and company holidays (e.g. UAE National Day, Eid). Trainees will show status <strong>HOLIDAY</strong>, and automated No-Show emails will be <strong>paused</strong> on these dates.
        </p>

        <form onSubmit={handleAddHoliday} style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Holiday Date *</label>
              <input
                type="date"
                className="form-control"
                value={holidayDateInput}
                onChange={(e) => setHolidayDateInput(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Holiday Name / Description *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. UAE National Day / New Year"
                value={holidayNameInput}
                onChange={(e) => setHolidayNameInput(e.target.value)}
                required
              />
            </div>

            <div>
              <button type="submit" className="btn btn-navy" disabled={addingHoliday}>
                <PlusCircle size={16} />
                <span>{addingHoliday ? 'Saving...' : 'Add Holiday'}</span>
              </button>
            </div>
          </div>
        </form>

        {holidays.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: '#0A192F' }}>Registered Holidays</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {holidays.map((h) => (
                <div
                  key={h.date}
                  style={{
                    background: '#FDF4FF',
                    border: '1px solid #E9D5FF',
                    borderRadius: '6px',
                    padding: '0.4rem 0.75rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.82rem',
                    color: '#9333EA',
                    fontWeight: 600,
                  }}
                >
                  <span><strong>{h.date}</strong>: {h.name}</span>
                  <button
                    onClick={() => handleDeleteHoliday(h.date, h.name)}
                    style={{ background: 'transparent', border: 'none', color: '#DC2626', cursor: 'pointer', display: 'flex' }}
                    title="Delete Holiday"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add New Trainee Form Card */}
      <div className="card" style={{ borderLeft: '5px solid #C5A059', marginBottom: '1.5rem' }}>
        <div className="card-header">
          <span className="card-title">Add New Trainee Account</span>
          <button
            onClick={() => setIsBatchModalOpen(true)}
            className="btn btn-gold btn-sm"
          >
            <PlusCircle size={14} />
            <span>Manage Batches ({batches.length})</span>
          </button>
        </div>

        <form onSubmit={handleAddTrainee}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Trainee / Staff ID *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 5092"
                value={traineeIdInput}
                onChange={(e) => setTraineeIdInput(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Batch *</label>
              <select
                className="form-control"
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                required
              >
                {batches.length === 0 ? (
                  <option value="">No batches created yet</option>
                ) : (
                  batches.map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Trainee Name *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Ahmed Al Mansoori"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Trainee Email *</label>
              <input
                type="email"
                className="form-control"
                placeholder="e.g. ahmed@etihad.ae"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Program *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. B1.1 Aircraft Maintenance"
                value={programInput}
                onChange={(e) => setProgramInput(e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-navy" disabled={loading}>
              <UserPlus size={16} />
              <span>{loading ? 'Processing...' : 'Add Trainee'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Filter & Search Bar */}
      <div className="card" style={{ padding: '0.85rem 1.25rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '220px' }}>
            <Search size={18} color="#64748B" />
            <input
              type="text"
              className="form-control"
              placeholder="Search by name, ID, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="form-control"
              style={{ width: 'auto' }}
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
            >
              <option value="">All Batches</option>
              {batches.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>

            <select
              className="form-control"
              style={{ width: 'auto' }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
            >
              <option value="traineeId">Sort by Staff ID</option>
              <option value="name">Sort by Name</option>
              <option value="batchId">Sort by Batch</option>
            </select>
          </div>
        </div>
      </div>

      {/* Trainees List Table */}
      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Staff No</th>
              <th>Batch</th>
              <th>Name</th>
              <th>Email</th>
              <th>Program</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrainees.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                  No trainees found.
                </td>
              </tr>
            ) : (
              filteredTrainees.map((t) => (
                <tr key={t.traineeId}>
                  <td style={{ fontWeight: 700, color: '#0A192F' }}>{t.traineeId}</td>
                  <td style={{ fontWeight: 600, color: '#C5A059' }}>{t.batchId}</td>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td style={{ color: '#475569', fontSize: '0.85rem' }}>{t.email}</td>
                  <td style={{ fontSize: '0.85rem' }}>{t.program}</td>
                  <td>
                    {t.active ? (
                      <span className="badge badge-present">Active</span>
                    ) : (
                      <span className="badge badge-noshow">Disabled</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          setSelectedTrainee(t);
                          setIsProfileOpen(true);
                        }}
                        className="btn btn-outline btn-sm"
                        title="View Full Trainee Profile"
                      >
                        <Eye size={13} />
                        <span>Profile</span>
                      </button>

                      {currentUser.role === 'MASTER' && (
                        <button
                          onClick={() => handleRemoveTrainee(t.traineeId, t.name)}
                          className="btn btn-danger btn-sm"
                          title="Remove Trainee"
                        >
                          <Trash2 size={13} />
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

      {/* Batch Management Modal */}
      <Modal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        title="Manage Batches"
        maxWidth="500px"
      >
        <form onSubmit={handleCreateBatch} style={{ marginBottom: '1.5rem' }}>
          <div className="form-group">
            <label className="form-label">Create New Batch</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. OJE Batch 6"
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-gold">
                <span>Add</span>
              </button>
            </div>
          </div>
        </form>

        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', color: '#0A192F' }}>
          Existing Batches
        </h4>
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {batches.map((b) => (
              <li
                key={b.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  background: '#F8FAFC',
                  borderRadius: '6px',
                  marginBottom: '0.4rem',
                  border: '1px solid #E2E8F0',
                }}
              >
                <span style={{ fontWeight: 600 }}>{b.name}</span>
                {currentUser.role === 'MASTER' && (
                  <button
                    type="button"
                    onClick={() => b.id && handleDeleteBatch(b.id, b.name)}
                    className="btn btn-danger btn-sm"
                    style={{ padding: '0.2rem 0.5rem' }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      {/* Trainee Profile Modal */}
      {selectedTrainee && (
        <TraineeProfileModal
          isOpen={isProfileOpen}
          onClose={() => {
            setIsProfileOpen(false);
            setSelectedTrainee(null);
          }}
          trainee={selectedTrainee}
          currentUser={currentUser}
        />
      )}
    </div>
  );
};
