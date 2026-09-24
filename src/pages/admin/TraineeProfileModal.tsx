import React, { useState, useEffect } from 'react';
import { Trainee, Remark, RemarkHistoryItem, User } from '../../types';
import { traineeService } from '../../services/hybridTraineeService';
import { db } from '../../db';
import { Modal } from '../../components/common/Modal';
import { Notification } from '../../components/common/Notification';
import { MessageSquare, Calendar, Clock, UserCheck, PlusCircle, Trash2, History, CheckCircle2 } from 'lucide-react';
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
  const [history, setHistory] = useState<RemarkHistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
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
      const hist = await traineeService.getRemarksHistory(trainee.traineeId);
      setHistory(hist);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen && trainee) {
      loadRemarks();
      setNewRemark('');
      setMsg(null);
      setActiveTab('active');
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
    setHistory((prev) => [
      {
        id: tempId,
        traineeId: trainee.traineeId,
        remark: remarkText,
        createdBy: currentUser.username,
        date,
        time,
        timestamp,
        status: 'active',
      },
      ...prev,
    ]);
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
        const freshHist = await traineeService.getRemarksHistory(trainee.traineeId);
        setHistory(freshHist);
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

    // INSTANT: Delete immediately from active list on 1 click!
    setRemarks((prev) => prev.filter((r) => r.id !== remarkId && (!remarkText || r.remark.trim() !== remarkText.trim())));
    // Mark as deleted in history view
    setHistory((prev) =>
      prev.map((h) => {
        if ((remarkId > 0 && h.id === remarkId) || (remarkText && h.remark.trim() === remarkText.trim())) {
          return {
            ...h,
            status: 'deleted' as const,
            deletedBy: currentUser.username,
            deletedAtDate: getUAEDateString(),
            deletedAtTime: getUAETimeString(),
            deletedTimestamp: Date.now(),
          };
        }
        return h;
      })
    );
    setMsg({ type: 'success', text: 'Remark deleted from active view and permanently saved to history.' });

    try {
      const res = await traineeService.deleteRemark(remarkId, trainee.traineeId, remarkText, currentUser.username);
      if (!res.success) {
        setMsg({ type: 'error', text: res.error || 'Failed to delete remark.' });
        await loadRemarks();
      } else {
        const freshHist = await traineeService.getRemarksHistory(trainee.traineeId);
        setHistory(freshHist);
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0A192F', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MessageSquare size={18} color="#C5A059" />
            <span>Remarks from Manager & Engineer</span>
          </h4>

          {/* View Mode Toggle: Active vs Remarks History */}
          <div style={{ display: 'flex', gap: '0.35rem', background: '#F1F5F9', padding: '3px', borderRadius: '6px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('active')}
              style={{
                border: 'none',
                background: activeTab === 'active' ? '#FFFFFF' : 'transparent',
                color: activeTab === 'active' ? '#0A192F' : '#64748B',
                fontWeight: activeTab === 'active' ? 700 : 500,
                fontSize: '0.78rem',
                padding: '0.3rem 0.65rem',
                borderRadius: '4px',
                cursor: 'pointer',
                boxShadow: activeTab === 'active' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              Active Remarks ({remarks.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('history');
                loadRemarks();
              }}
              style={{
                border: 'none',
                background: activeTab === 'history' ? '#0A192F' : 'transparent',
                color: activeTab === 'history' ? '#C5A059' : '#64748B',
                fontWeight: activeTab === 'history' ? 700 : 500,
                fontSize: '0.78rem',
                padding: '0.3rem 0.65rem',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                boxShadow: activeTab === 'history' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <History size={13} />
              <span>Remarks History ({history.length})</span>
            </button>
          </div>
        </div>

        {msg && <Notification type={msg.type} message={msg.text} onClose={() => setMsg(null)} />}

        {activeTab === 'active' ? (
          <>
            {currentUser.role === 'MASTER' && (
              <form onSubmit={handleSaveRemark} style={{ marginBottom: '1.25rem' }}>
                <div className="form-group" style={{ marginBottom: '0.65rem' }}>
                  <label className="form-label" style={{ fontSize: '0.85rem' }}>Add New Remark</label>
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
                  No active remarks recorded yet.
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
                        {r.createdBy && <span>• By: {r.createdBy}</span>}
                      </span>
                      {currentUser.role === 'MASTER' && (
                        <button
                          type="button"
                          onClick={() => r.id && handleDeleteRemark(r.id, r.remark)}
                          disabled={deletingId === r.id}
                          className="btn btn-outline btn-sm"
                          style={{ padding: '0.15rem 0.45rem', fontSize: '0.7rem', color: '#B91C1C', borderColor: '#FCA5A5' }}
                          title="Delete Remark (Saves to History)"
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
          </>
        ) : (
          /* Remarks History View */
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '0.75rem', fontStyle: 'italic' }}>
              Permanent chronological audit trail of all remarks added and deleted for this trainee.
            </div>
            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94A3B8', fontSize: '0.9rem' }}>
                No remarks recorded in history yet.
              </div>
            ) : (
              history.map((h, idx) => {
                const isDeleted = h.status === 'deleted';
                return (
                  <div
                    key={h.id || idx}
                    style={{
                      background: isDeleted ? '#FFF5F5' : '#FFFFFF',
                      border: isDeleted ? '1px solid #FED7D7' : '1px solid #E2E8F0',
                      borderLeft: isDeleted ? '4px solid #E53E3E' : '4px solid #10B981',
                      borderRadius: '8px',
                      padding: '0.85rem',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span
                        style={{
                          background: isDeleted ? '#FEE2E2' : '#DCFCE7',
                          color: isDeleted ? '#991B1B' : '#166534',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                        }}
                      >
                        {isDeleted ? <Trash2 size={11} /> : <CheckCircle2 size={11} />}
                        <span>{isDeleted ? 'Deleted from Active' : 'Active Remark'}</span>
                      </span>

                      <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                        Created: {formatMediumDate(h.date)} at {h.time}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.9rem', color: isDeleted ? '#4A5568' : '#1E293B', marginBottom: '0.5rem', whiteSpace: 'pre-wrap', textDecoration: isDeleted ? 'line-through' : 'none' }}>
                      {h.remark}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', fontSize: '0.74rem', color: '#64748B' }}>
                      <span><strong>Author:</strong> {h.createdBy}</span>
                      {isDeleted && (
                        <span style={{ color: '#991B1B', fontWeight: 600 }}>
                          Deleted on {formatMediumDate(h.deletedAtDate || h.date)} at {h.deletedAtTime || ''} {h.deletedBy ? `by ${h.deletedBy}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
