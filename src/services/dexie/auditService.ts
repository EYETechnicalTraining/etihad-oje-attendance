import { db } from '../../db';
import { AuditLog } from '../../types';
import { getUAEDateString, getUAETimeString } from '../../utils/timezone';
import { IAuditService } from '../api';

export class DexieAuditService implements IAuditService {
  async logAction(user: string, action: string, relatedTrainee?: string): Promise<void> {
    await db.auditLogs.add({
      user,
      action,
      date: getUAEDateString(),
      time: getUAETimeString(),
      relatedTrainee,
      timestamp: Date.now(),
    });
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    return await db.auditLogs.reverse().sortBy('timestamp');
  }
}

export const auditService = new DexieAuditService();
