import React from 'react';
import { AttendanceStatus } from '../../types';
import {
  CheckCircle2,
  Clock,
  XCircle,
  Palmtree,
  Stethoscope,
  Shield,
  GraduationCap,
  PauseCircle,
  Coffee,
} from 'lucide-react';

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

  if (status === 'Annual Leave') {
    return (
      <span className="badge badge-leave">
        <Palmtree size={13} />
        <span>ANNUAL LEAVE</span>
      </span>
    );
  }

  if (status === 'Sick Leave') {
    return (
      <span className="badge badge-sick">
        <Stethoscope size={13} />
        <span>SICK LEAVE</span>
      </span>
    );
  }

  if (status === 'Military Services') {
    return (
      <span className="badge badge-military">
        <Shield size={13} />
        <span>MILITARY SERVICES</span>
      </span>
    );
  }

  if (status === 'Training') {
    return (
      <span className="badge badge-training">
        <GraduationCap size={13} />
        <span>TRAINING</span>
      </span>
    );
  }

  if (status === 'Stand Down') {
    return (
      <span className="badge badge-standdown">
        <PauseCircle size={13} />
        <span>STAND DOWN</span>
      </span>
    );
  }

  if (status === 'Weekend') {
    return (
      <span className="badge badge-info">
        <Coffee size={13} />
        <span>WEEKEND</span>
      </span>
    );
  }

  if (status === 'N/A') {
    return (
      <span className="badge badge-na">
        <Clock size={13} />
        <span>N/A (Pending 08:00 AM)</span>
      </span>
    );
  }

  return <span className="badge badge-info">{status}</span>;

  return <span className="badge badge-info">{status}</span>;
};
