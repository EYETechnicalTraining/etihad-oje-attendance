import React, { useState, useEffect } from 'react';
import { Trainee, Batch, User } from '../../types';
import { traineeService } from '../../services/dexie/traineeService';
import { Modal } from '../../components/common/Modal';
import { Notification } from '../../components/common/Notification';
import { TraineeProfileModal } from './TraineeProfileModal';
import { PlusCircle, Trash2, UserPlus, Eye, Search, Filter, ArrowUpDown } from 'lucide-react';

interface TraineeListTabProps {
  currentUser: User;
}

export const TraineeListTab: React.FC<TraineeListTabProps> = ({ currentUser }) => {
  const [trainees, setTrainees] = useState<Trainee[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);

  // Form inputs
  const [traineeIdInput, setTraineeIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [batchInput, setBatchInput] = useState('');
  const [programInput, setProgramInput] = useState('');

  // Batch modal
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');

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
    setTrainees(tList);
    setBatches(bList);
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
      traineeId: traineeIdInput,
      name: nameInput,
      email: emailInput,
      batchId: batchInput,
      program: programInput,
      active: true,
    });

    setLoading(false);

    if (res.success) {
      setNotification({
        type: 'success',
        text: `Trainee "${nameInput}" registered successfully with ID ${traineeIdInput}. Login credentials generated.`,
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

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchName.trim()) return;

    const res = await traineeService.addBatch(newBatchName);
    if (res.success) {
      setNewBatchName('');
      loadData();
    } else {
      alert(res.error || 'Failed to add batch.');
    }
  };

  const handleDeleteBatch = async (batchId: number) => {
    if (!confirm('Are you sure you want to delete this batch?')) return;
    const res = await traineeService.deleteBatch(batchId);
    if (res.success) {
      loadData();
    } else {
      alert(res.error || 'Failed to delete batch.');
    }
  };

  const handleRemoveTrainee = async (tId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove trainee ${name} (ID: ${tId})? This will delete all associated records.`)) return;

    const res = await traineeService.removeTrainee(tId);
    if (res.success) {
      setNotification({ type: 'success', text: `Trainee ${name} removed.` });
      loadData();
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to remove trainee.' });
    }
  };

  // Filtering & Sorting
  const filteredTrainees = trainees
    .filter((t) => {
      const matchesSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.traineeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesBatch = !batchFilter || t.batchId === batchFilter;
      return matchesSearch && matchesBatch;
    })
    .sort((a, b) => {
      if (sortBy === 'traineeId') return a.traineeId.localeCompare(b.traineeId, undefined, { numeric: true });
      if (sortBy === 'batchId') return a.batchId.localeCompare(b.batchId);
      return a.name.localeCompare(b.name);
    });

  return (
    <div>
      {/* Top Header & Batch Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0A192F' }}>Trainee Directory & Registration</h2>
          <p style={{ fontSize: '0.85rem', color: '#64748B' }}>Manage OJE Trainee Batches and Register New Technical Trainees</p>
        </div>
        <button onClick={() => setIsBatchModalOpen(true)} className="btn btn-gold">
          <PlusCircle size={16} />
          <span>Register Batch</span>
        </button>
      </div>

      {notification && <Notification type={notification.type} message={notification.text} onClose={() => setNotification(null)} />}

      {/* Trainee Registration Form */}
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserPlus size={18} color="#C5A059" />
            <span>Register New Trainee</span>
          </span>
        </div>
        <form onSubmit={handleAddTrainee}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Batch *</label>
              <select
                className="form-control"
                value={batchInput}
                onChange={(e) => setBatchInput(e.target.value)}
                required
              >
                {batches.length === 0 ? (
                  <option value="">No batches created</option>
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
              <label className="form-label">Trainee ID (Staff No) *</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. 10025"
                value={traineeIdInput}
                onChange={(e) => setTraineeIdInput(e.target.value)}
                required
              />
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
              placeholder="Search by ID, Name, or Email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Filter size={16} color="#64748B" />
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
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <ArrowUpDown size={16} color="#64748B" />
              <select
                className="form-control"
                style={{ width: 'auto' }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
              >
                <option value="traineeId">Sort by ID</option>
                <option value="batchId">Sort by Batch</option>
                <option value="name">Sort by Name</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Trainee Table */}
      <div className="table-responsive">
        <table className="custom-table">
          <thead>
            <tr>
              <th>Trainee ID</th>
              <th>Batch</th>
              <th>Trainee Name</th>
              <th>Program</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrainees.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748B' }}>
                  No trainees found matching criteria.
                </td>
              </tr>
            ) : (
              filteredTrainees.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 700, color: '#0A192F' }}>{t.traineeId}</td>
                  <td>
                    <span style={{ fontWeight: 600, color: '#C5A059' }}>{t.batchId}</span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td style={{ color: '#475569' }}>{t.program}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => {
                          setSelectedTrainee(t);
                          setIsProfileOpen(true);
                        }}
                        className="btn btn-navy btn-sm"
                        title="View Trainee Profile & Remarks"
                      >
                        <Eye size={14} />
                        <span>View Profile</span>
                      </button>
                      <button
                        onClick={() => handleRemoveTrainee(t.traineeId, t.name)}
                        className="btn btn-danger btn-sm"
                        title="Remove Trainee"
                      >
                        <Trash2 size={14} />
                        <span>Remove Trainee</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Batch Registration Modal */}
      <Modal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        title="Register / Manage Batches"
      >
        <form onSubmit={handleAddBatch} style={{ marginBottom: '1.5rem' }}>
          <div className="form-group">
            <label className="form-label">New Batch Name</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Batch 3 or OJE Batch 6"
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                required
              />
              <button type="submit" className="btn btn-gold">
                Add
              </button>
            </div>
          </div>
        </form>

        <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.75rem', color: '#0A192F' }}>
          Registered Batches
        </h4>
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {batches.map((b) => (
            <div
              key={b.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.6rem 0.85rem',
                borderBottom: '1px solid #E2E8F0',
                background: '#F8FAFC',
                marginBottom: '0.35rem',
                borderRadius: '6px',
              }}
            >
              <span style={{ fontWeight: 600, color: '#1E293B' }}>{b.name}</span>
              <button
                type="button"
                onClick={() => handleDeleteBatch(b.id!)}
                className="btn btn-danger btn-sm"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </Modal>

      {/* Trainee Profile Modal */}
      <TraineeProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        trainee={selectedTrainee}
        currentUser={currentUser}
      />
    </div>
  );
};
