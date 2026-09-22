import React, { useState } from 'react';
import { User } from '../../types';
import { authService } from '../../services/dexie/authService';
import { Modal } from '../../components/common/Modal';
import { Notification } from '../../components/common/Notification';
import { KeyRound } from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  currentUser,
}) => {
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    if (newPass !== confirmPass) {
      setNotification({ type: 'error', text: 'New password and confirm password do not match.' });
      return;
    }

    if (newPass.length < 6) {
      setNotification({ type: 'error', text: 'New password must be at least 6 characters long.' });
      return;
    }

    setLoading(true);
    const res = await authService.changePassword(currentUser.username, currentPass, newPass);
    setLoading(false);

    if (res.success) {
      setNotification({ type: 'success', text: 'Password changed successfully.' });
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setTimeout(() => onClose(), 1500);
    } else {
      setNotification({ type: 'error', text: res.error || 'Failed to change password.' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Password" maxWidth="450px">
      {notification && <Notification type={notification.type} message={notification.text} onClose={() => setNotification(null)} />}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Current Password</label>
          <input
            type="password"
            className="form-control"
            value={currentPass}
            onChange={(e) => setCurrentPass(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">New Password</label>
          <input
            type="password"
            className="form-control"
            value={newPass}
            onChange={(e) => setNewPass(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Confirm New Password</label>
          <input
            type="password"
            className="form-control"
            value={confirmPass}
            onChange={(e) => setConfirmPass(e.target.value)}
            required
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-gold" disabled={loading}>
            <KeyRound size={15} />
            <span>{loading ? 'Updating...' : 'Update Password'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
