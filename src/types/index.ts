export type UserRole = 'MASTER' | 'INSTRUCTOR' | 'TRAINEE';

export type AttendanceStatus =
  | 'Present'
  | 'Late to Work'
  | 'No Show'
  | 'Annual Leave'
  | 'Sick Leave'
  | 'Military Services'
  | 'Training'
  | 'Stand Down'
  | 'Weekend'
  | 'Holiday'
  | 'N/A';

export type InsideOutside = 'Inside' | 'Outside';

export interface User {
  id?: number;
  username: string;
  passwordHash: string;
  role: UserRole;
  traineeId?: string;
  staffNumber?: string;
  name?: string;
  active: boolean;
  forcePasswordChange?: boolean;
  lastLogin?: string | null;
  lastPasswordChange?: string | null;
}

export interface Instructor {
  id?: number;
  staffNumber: string;
  name: string;
  email: string;
  active: boolean;
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
  enrollmentSelfie?: string | null; // Base64 selfie image recorded on first login
}

export interface Batch {
  id?: number;
  name: string;
  createdAt: string;
}

export interface Holiday {
  id?: number;
  date: string; // YYYY-MM-DD
  name: string; // e.g. "UAE National Day"
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

export interface RemarkHistoryItem {
  id?: number | string;
  traineeId: string;
  remark: string;
  createdBy: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM AM/PM
  timestamp: number;
  status: 'active' | 'deleted';
  deletedBy?: string;
  deletedAtDate?: string;
  deletedAtTime?: string;
  deletedTimestamp?: number;
}

export interface Attendance {
  id?: number;
  traineeId: string;
  date: string; // YYYY-MM-DD (Asia/Dubai)
  loginTime: string; // HH:MM:SS AM/PM
  status: AttendanceStatus;
  authenticationMethod: 'Biometric Passkey (Fingerprint/PIN)' | 'Face Verification Selfie' | 'Password Fallback' | 'WebAuthn/Passkey';
  selfieImage?: string | null; // Verification selfie snapshot
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
  enrollmentSelfie?: string | null;
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

export interface GeofenceSettings {
  enabled: boolean;
  centerLatitude: number;
  centerLongitude: number;
  loginRadiusMeters: number;
  signOutRadiusMeters: number;
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
  hasSelfieEnrolled?: boolean;
  lastPasswordChange: string | null;
  username: string;
}
