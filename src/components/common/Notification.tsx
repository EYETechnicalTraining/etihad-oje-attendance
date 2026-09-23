import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface NotificationProps {
  type: 'success' | 'error';
  message: string;
  onClose?: () => void;
}

export const Notification: React.FC<NotificationProps> = ({ type, message, onClose }) => {
  if (!message) return null;

  const isSuccess = type === 'success';

  return (
    <div
      style={{
        padding: '0.85rem 1.1rem',
        borderRadius: '8px',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        backgroundColor: isSuccess ? '#ECFDF5' : '#FEF2F2',
        border: `1px solid ${isSuccess ? '#10B981' : '#EF4444'}`,
        color: isSuccess ? '#065F46' : '#991B1B',
        fontSize: '0.9rem',
        fontWeight: 500,
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', flex: 1, minWidth: 0 }}>
        <div style={{ flexShrink: 0, marginTop: '2px', display: 'flex' }}>
          {isSuccess ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
        </div>
        <span style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>{message}</span>
      </div>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
            fontWeight: 700,
            fontSize: '1.2rem',
            lineHeight: 1,
            padding: '0 0.25rem',
            flexShrink: 0,
          }}
          aria-label="Close notification"
        >
          ×
        </button>
      )}
    </div>
  );
};
