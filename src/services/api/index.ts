import {
  User,
  Trainee,
  Batch,
  Remark,
  Attendance,
  Allocation,
  TaskCount,
  SignOut,
  PasskeyCredential,
  AuditLog,
  TraineeLogSummary,
  AttendanceStatus,
} from '../../types';

export interface IAuthService {
  login(username: string, password: string): Promise<{ success: boolean; user?: User; error?: string }>;
  changePassword(username: string, currentPass: string, newPass: string): Promise<{ success: boolean; error?: string }>;
  resetTraineePassword(traineeId: string): Promise<{ success: boolean; newPassword?: string; error?: string }>;
  toggleUserStatus(traineeId: string, active: boolean): Promise<{ success: boolean; error?: string }>;
}

export interface ITraineeService {
  getAllTrainees(): Promise<Trainee[]>;
  getTraineeById(traineeId: string): Promise<Trainee | null>;
  addTrainee(traineeData: Omit<Trainee, 'id' | 'createdAt'>): Promise<{ success: boolean; trainee?: Trainee; error?: string }>;
  removeTrainee(traineeId: string): Promise<{ success: boolean; error?: string }>;
  
  getBatches(): Promise<Batch[]>;
  addBatch(name: string): Promise<{ success: boolean; batch?: Batch; error?: string }>;
  deleteBatch(batchId: number): Promise<{ success: boolean; error?: string }>;

  getRemarks(traineeId: string): Promise<Remark[]>;
  addRemark(traineeId: string, remarkText: string, author: string): Promise<{ success: boolean; remark?: Remark; error?: string }>;
}

export interface IAttendanceService {
  getDailyAttendance(date: string): Promise<Attendance[]>;
  getTraineeAttendanceForDate(traineeId: string, date: string): Promise<Attendance | null>;
  logAttendance(traineeId: string, authMethod: 'Biometric Passkey (Fingerprint/PIN)' | 'Face Verification Selfie' | 'Password Fallback' | 'WebAuthn/Passkey'): Promise<{ success: boolean; attendance?: Attendance; error?: string }>;
  getTraineeLogsForDate(date: string): Promise<TraineeLogSummary[]>;
}

export interface IAllocationService {
  getAllocations(traineeId: string): Promise<Allocation[]>;
  addAllocation(allocationData: Omit<Allocation, 'id' | 'date' | 'time' | 'timestamp'>): Promise<{ success: boolean; allocation?: Allocation; error?: string }>;
}

export interface ITaskService {
  getTaskCounts(traineeId: string): Promise<TaskCount[]>;
  getLatestTaskCount(traineeId: string): Promise<TaskCount | null>;
  addTaskCount(traineeId: string, count: number): Promise<{ success: boolean; taskCount?: TaskCount; error?: string }>;
  
  getSignOut(traineeId: string, date: string): Promise<SignOut | null>;
  submitSignOut(traineeId: string): Promise<{ success: boolean; signOut?: SignOut; error?: string }>;
}

export interface IAuditService {
  logAction(user: string, action: string, relatedTrainee?: string): Promise<void>;
  getAuditLogs(): Promise<AuditLog[]>;
}

export interface IBackupService {
  exportDatabase(): Promise<string>;
  importDatabase(jsonString: string): Promise<{ success: boolean; error?: string }>;
}
