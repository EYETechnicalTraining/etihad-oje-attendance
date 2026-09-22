import Dexie, { Table } from 'dexie';
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
  Setting,
} from '../types';
import { hashPassword } from '../utils/security';
import { getUAEDateString, getUAETimeString } from '../utils/timezone';

export class EtihadDatabase extends Dexie {
  users!: Table<User, number>;
  trainees!: Table<Trainee, number>;
  batches!: Table<Batch, number>;
  remarks!: Table<Remark, number>;
  attendance!: Table<Attendance, number>;
  allocations!: Table<Allocation, number>;
  taskCounts!: Table<TaskCount, number>;
  signOuts!: Table<SignOut, number>;
  passkeyCredentials!: Table<PasskeyCredential, number>;
  auditLogs!: Table<AuditLog, number>;
  settings!: Table<Setting, number>;

  constructor() {
    super('EtihadOJEDatabase');
    this.version(1).stores({
      users: '++id, &username, role, traineeId, active',
      trainees: '++id, &traineeId, &email, batchId, active',
      batches: '++id, &name',
      remarks: '++id, traineeId, date, timestamp',
      attendance: '++id, [traineeId+date], traineeId, date, status',
      allocations: '++id, traineeId, date, timestamp',
      taskCounts: '++id, traineeId, date, timestamp',
      signOuts: '++id, [traineeId+date], traineeId, date',
      passkeyCredentials: '++id, traineeId, credentialId',
      auditLogs: '++id, date, timestamp, user, relatedTrainee',
      settings: '++id, &key',
    });
  }
}

export const db = new EtihadDatabase();

/**
 * Initializes database with master account and initial batches if empty
 */
export async function initializeDatabase(): Promise<void> {
  const masterUser = await db.users.where('username').equals('selva.master').first();

  if (!masterUser) {
    const masterPasswordHash = await hashPassword('Aviation@6996504++');
    await db.users.add({
      username: 'selva.master',
      passwordHash: masterPasswordHash,
      role: 'MASTER',
      active: true,
      forcePasswordChange: false,
      lastLogin: null,
      lastPasswordChange: getUAEDateString(),
    });

    // Seed default batches
    const defaultBatches = ['Batch 1', 'Batch 2', 'OJE Batch 5'];
    for (const name of defaultBatches) {
      const existing = await db.batches.where('name').equals(name).first();
      if (!existing) {
        await db.batches.add({
          name,
          createdAt: getUAEDateString(),
        });
      }
    }

    // Initial audit log entry
    await db.auditLogs.add({
      user: 'SYSTEM',
      action: 'System Initialized - Master Account Created',
      date: getUAEDateString(),
      time: getUAETimeString(),
      timestamp: Date.now(),
    });
  }
}
