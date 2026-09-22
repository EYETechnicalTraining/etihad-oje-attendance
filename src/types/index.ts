export type UserRole = 'MASTER' | 'TRAINEE';

export type AttendanceStatus = 'Present' | 'Late to Work' | 'No Show';

export type InsideOutside = 'Inside' | 'Outside';

export interface User {
  id?: number;
  username: string;
  passwordHash: string;
  role: UserRole;
  traineeId?: string;
  active: boolean;
  forcePasswordChange?: boolean;
  lastLogin?: string | null;
  lastPasswordChange?: string | null;
}

export interface Trainee {
  id?: number;
  traineeId: string; // Staff/trainee number, must be unique
  name: string;
  email: string;
  batchId: string; // Batch name or batch ID
  program: string;
  active: boolean;
  createdAt: string;
}

export interface Batch {
  id?: number;
  name: string;
  createdAt: string;
}

export interface Remark {
  id?: number;
  traineeId: string;
  remark: string;
  createdBy: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM AM/PM
  timestamp: number;
}

export interface Attendance {
  id?: number;
  traineeId: string;
  date: string; // YYYY-MM-DD (Asia/Dubai)
  loginTime: string; // HH:MM:SS AM/PM
  status: AttendanceStatus;
  authenticationMethod: 'WebAuthn/Passkey' | 'Password Fallback';
  createdAt: string;
}

export interface Allocation {
  id?: number;
  traineeId: string;
  location: string;
  insideOutside: InsideOutside;
  aircraftRegistration: string;
  aircraftType: string;
  manager: string;
  engineer: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM AM/PM
  timestamp: number;
}

export interface TaskCount {
  id?: number;
  traineeId: string;
  taskCount: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM AM/PM
  timestamp: number;
}

export interface SignOut {
  id?: number;
  traineeId: string;
  date: string; // YYYY-MM-DD
  signOutTime: string; // HH:MM AM/PM
  timestamp: number;
}

export interface PasskeyCredential {
  id?: number;
  traineeId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  deviceName: string;
  createdAt: string;
}

export interface AuditLog {
  id?: number;
  user: string;
  action: string;
  date: string;
  time: string;
  relatedTrainee?: string;
  timestamp: number;
}

export interface Setting {
  id?: number;
  key: string;
  value: any;
}

export interface TraineeLogSummary {
  srNo: number;
  traineeId: string;
  name: string;
  batch: string;
  status: AttendanceStatus;
  loginTime: string;
  signOutTime: string;
  allocationCount: number;
  latestTaskCount: number | null;
  accountStatus: 'Active' | 'Disabled';
  passkeyRegistered: boolean;
  lastPasswordChange: string | null;
  username: string;
}
