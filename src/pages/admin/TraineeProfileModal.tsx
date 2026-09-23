import React, { useState, useEffect } from 'react';
import { Trainee, Remark, User } from '../../types';
import { traineeService } from '../../services/hybridTraineeService';
import { db } from '../../db';
import { Modal } from '../../components/common/Modal';
import { Notification } from '../../components/common/Notification';
import { MessageSquare, Calendar, Clock, UserCheck, PlusCircle, Trash2 } from 'lucide-react';
import { formatMediumDate, getUAEDateString, getUAETimeString } from '../../utils/timezone';

interface TraineeProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  trainee: Trainee | null;
  currentUser: User;
}

export const TraineeProfileModal: React.FC<TraineeProfileModalProps> = ({
  isOpen,
  onClose,
  trainee,
  currentUser,
}) => {
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [newRemark, setNewRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadRemarks = async () => {
    if (!trainee) return;
    try {
      // 1. Instant local render from IndexedDB cache
      const local = await db.remarks
        .where('traineeId')
        .equals(trainee.traineeId)
        .reverse()
        .sortBy('timestamp');
      if (local && local.length > 0) {
        setRemarks(local);
      }
    } catch {
      // ignore
    }

    // 2. Fetch fresh from server
    try {
      const list = await traineeService.getRemarks(trainee.traineeId);
      setRemarks(list);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen && trainee) {
      loadRemarks();
      setNewRemark('');
      setMsg(null);
    }
  }, [isOpen, trainee]);

  const handleSaveRemark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trainee || !newRemark.trim() || loading) return;

    const remarkText = newRemark.trim();
    const tempId = -Date.now();
    const date = getUAEDateString();
    const time = getUAETimeString();
    const timestamp = Date.now();

    const optimisticRemark: Remark = {
      id: tempId,
      traineeId: trainee.traineeId,
      remark: remarkText,
      createdBy: currentUser.username,
      date,
      time,
      timestamp,
    };

    // INSTANT: Show immediately on 1 click!
    setNewRemark('');
    setRemarks((prev) => [optimisticRemark, ...prev]);
    setMsg({ type: 'success', text: 'Remark saved successfully.' });
    setLoading(true);

    try {
      const res = await traineeService.addRemark(
        trainee.traineeId,
        remarkText,
        currentUser.username
      );
      if (res.success && res.remark) {
        setRemarks((prev) =>
          prev.map((r) => (r.id === tempId ? res.remark! : r))
        );
      }
    } catch (err: any) {
      console.warn('Remark save background sync warning:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRemark = async (remarkId: number, remarkText?: string) => {
    if (!trainee) return;
    setDeletingId(remarkId);
    setMsg(null);

    // INSTANT: Delete immediately on 1 click without blocking prompt!
    setRemarks((prev) => prev.filter((r) => r.id !== remarkId && (!remarkText || r.remark.trim() !== remarkText.trim())));
    setMsg({ type: 'success', text: 'Remark deleted successfully.' });

    try {
      const res = await traineeService.deleteRemark(remarkId, trainee.traineeId, remarkText);
      if (!res.success) {
        setMsg({ type: 'error', text: res.error || 'Failed to delete remark.' });
        await loadRemarks();
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message || 'Failed to delete remark.' });
      await loadRemarks();
    } finally {
      setDeletingId(null);
    }
  };

  if (!trainee) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Trainee Profile: ${trainee.name}`} maxWidth="650px">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem', background: '#F8FAFC', padding: '1rem', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
        <div>
          <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>TRAINEE ID / STAFF NO</span>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0A192F' }}>{trainee.traineeId}</div>
        </div>
        <div>
          <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>NAME</span>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0A192F' }}>{trainee.name}</div>
        </div>
        <div>
          <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>BATCH</span>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#C5A059' }}>{trainee.batchId}</div>
        </div>
        <div>
          <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>PROGRAM</span>
          <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1E293B' }}>{trainee.program}</div>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>EMAIL</span>
          <div style={{ fontSize: '0.9rem', color: '#334155' }}>{trainee.email}</div>
        </div>
      </div>

      <div style={{ borderTop: '2px solid #E2E8F0', paddingTop: '1.25rem' }}>
        <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0A192F', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <MessageSquare size={18} color="#C5A059" />
          <span>Remarks from Manager & Engineer</span>
        </h4>

        {msg && <Notification type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

        {currentUser.role === 'MASTER' && (
          <form onSubmit={handleSaveRemark} style={{ marginBottom: '1.5rem' }}>
            <div className="form-group">
              <label className="form-label">Add New Remark</label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="Enter official supervisor remark, performance evaluation, or OJE progress note..."
                value={newRemark}
                onChange={(e) => setNewRemark(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-gold btn-sm" disabled={loading || !newRemark.trim()}>
              <PlusCircle size={15} />
              <span>{loading ? 'Saving...' : 'Save Remark'}</span>
            </button>
          </form>
        )}

        <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
          {remarks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94A3B8', fontSize: '0.9rem' }}>
              No remarks recorded yet.
            </div>
          ) : (
            remarks.map((r) => (
              <div
                key={r.id}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  padding: '0.85rem',
                  marginBottom: '0.75rem',
                  borderLeft: '4px solid #C5A059',
                }}
              >
                <div style={{ fontSize: '0.9rem', color: '#1E293B', marginBottom: '0.5rem', whiteSpace: 'pre-wrap' }}>
                  {r.remark}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748B' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Calendar size={13} color="#C5A059" /> <span>Date: {formatMediumDate(r.date)}</span>
                  </span>
                  {currentUser.role === 'MASTER' && (
                    <button
                      type="button"
                      onClick={() => r.id && handleDeleteRemark(r.id, r.remark)}
                      disabled={deletingId === r.id}
                      className="btn btn-outline btn-sm"
                      style={{ padding: '0.15rem 0.45rem', fontSize: '0.7rem', color: '#B91C1C', borderColor: '#FCA5A5' }}
                      title="Delete Remark"
                    >
                      <Trash2 size={11} />
                      <span>{deletingId === r.id ? 'Deleting...' : 'Delete'}</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};
