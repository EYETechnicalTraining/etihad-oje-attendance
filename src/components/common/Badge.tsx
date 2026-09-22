import React from 'react';
import { AttendanceStatus } from '../../types';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';

interface BadgeProps {
  status: AttendanceStatus | string;
}

export const Badge: React.FC<BadgeProps> = ({ status }) => {
  if (status === 'Present') {
    return (
      <span className="badge badge-present">
        <CheckCircle2 size={13} />
        <span>PRESENT</span>
      </span>
    );
  }

  if (status === 'Late to Work') {
    return (
      <span className="badge badge-late">
        <Clock size={13} />
        <span>LATE TO WORK</span>
      </span>
    );
  }

  if (status === 'No Show') {
    return (
      <span className="badge badge-noshow">
        <XCircle size={13} />
        <span>NO SHOW</span>
      </span>
    );
  }

  return <span className="badge badge-info">{status}</span>;
};
